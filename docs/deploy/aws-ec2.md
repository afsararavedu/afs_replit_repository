# Deploying BRR Liquor Soft to AWS EC2

This runbook brings the app up on a single EC2 instance with RDS Postgres, the same way the project was deployed before it became a monorepo. It assumes you have an AWS account, a domain name, and basic AWS Console familiarity.

> **Architecture in one diagram**
>
> ```
> Internet ──HTTPS──▶ EC2 (nginx :443)
>                       ├── /api/*  ──▶ node api-server (loopback :8080) ──▶ RDS Postgres
>                       └── /*      ──▶ static files in /var/www/brr-web
>
> Mobile app (Expo) ──HTTPS──▶ same nginx ──▶ same /api/*
> ```

The web frontend (`artifacts/brr-web`) and api server (`artifacts/api-server`) both run on the EC2 box. The mobile app (`artifacts/brr-mobile`) is an Expo app that you ship via the App Store / Play Store; it just talks to the same `/api/*` endpoints over HTTPS, so all you have to do for mobile is point its `EXPO_PUBLIC_DOMAIN` at your AWS domain.

---

## 1. Provision AWS resources

### 1.1 EC2 instance
- **AMI**: Amazon Linux 2023 or Ubuntu 22.04 LTS (instructions below cover both).
- **Size**: `t3.small` (2 vCPU, 2 GB RAM) is the practical minimum. The build (esbuild + vite) needs ~1.5 GB of RAM at peak; if you build elsewhere and rsync the artifacts in, `t3.micro` is enough to *run* the app.
- **Storage**: 16 GB gp3 root volume.
- **Security group** (`brr-ec2-sg`):
  - Inbound TCP 22 from your office/home IP only.
  - Inbound TCP 80 and 443 from `0.0.0.0/0`.
  - Outbound: allow all.
- **Elastic IP**: allocate one and attach it so the public IP survives reboots. Point your domain's `A` record at it.

### 1.2 RDS Postgres
- **Engine**: PostgreSQL 15 or newer.
- **Size**: `db.t4g.micro` is enough to start. Storage: 20 GB gp3.
- **Networking**: same VPC as the EC2 instance. **Not** publicly accessible.
- **Security group** (`brr-rds-sg`): inbound TCP 5432 from `brr-ec2-sg` only.
- Note the master username, password, endpoint host, and database name -- you'll assemble them into `DATABASE_URL` shortly.

---

## 2. Prepare the EC2 box

SSH into the instance, then install Node 24, pnpm, nginx, git, and certbot.

### Amazon Linux 2023
```bash
sudo dnf update -y
sudo dnf install -y nginx git
# Node.js 24 via the official tarball or nodesource. Easiest:
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs
sudo corepack enable
# certbot via snap is awkward on AL2023; use the EPEL package or pip install:
sudo dnf install -y python3-pip
sudo python3 -m pip install certbot certbot-nginx
```

### Ubuntu 22.04
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo apt install -y certbot python3-certbot-nginx
```

Verify:
```bash
node --version    # v24.x
pnpm --version    # >= 9
nginx -v
```

### 2.1 Create the service user and directory layout
```bash
sudo useradd --system --home /opt/brr --shell /usr/sbin/nologin brr || true
sudo mkdir -p /opt/brr /var/www/brr-web /etc/brr
sudo chown -R brr:brr /opt/brr /var/www/brr-web
sudo chmod 750 /etc/brr
```

The runbook keeps a single canonical layout under `/opt/brr/`:

```
/opt/brr/
├── repo/                                     # git checkout
│   ├── artifacts/api-server/node_modules/    # persistent runtime deps
│   └── release/                              # rebuilt every deploy
│       ├── api/dist/index.mjs                # what systemd executes
│       └── web/                              # rsync'd to /var/www/brr-web
└── (no other top-level dirs)
```

Both `WorkingDirectory` and `ExecStart` in the systemd unit point into this layout, so there are no symlinks to maintain.

---

## 3. Build a release

You have two choices: build **on the EC2 box** (simplest) or build **on your laptop / CI** and rsync the result over (faster repeated deploys, less RAM needed on the box).

Both use the helper script in this repo: `scripts/deploy/build-release.sh`.

### 3.1 Build on the EC2 box (simplest)
```bash
sudo -u brr -H bash -lc '
  cd /opt/brr
  if [ ! -d repo ]; then
    git clone https://github.com/<your-org>/<your-repo>.git repo
  fi
  cd repo
  git fetch --all && git checkout main && git pull --ff-only
  bash scripts/deploy/build-release.sh
'
```

This produces `/opt/brr/repo/release/` with two folders:
- `release/api/` — the bundled api-server (`dist/index.mjs` + `package.json` + `pnpm-lock.yaml`)
- `release/web/` — the static Vite output you serve from nginx

### 3.2 (Optional) Build elsewhere and rsync over
On your laptop / CI runner:
```bash
bash scripts/deploy/build-release.sh
rsync -az --delete release/ ec2-user@<EC2-IP>:/opt/brr/repo/release/
```
You still need a checkout of the repo on the EC2 box for `pnpm install --prod` (next step), because the api-server depends on workspace packages (`@workspace/db`, `@workspace/api-zod`) that pnpm can only resolve from inside the monorepo. The rsync target above intentionally lands inside that same checkout so `release/` and `artifacts/api-server/node_modules/` end up under one tree -- which is exactly what the systemd unit's `WorkingDirectory` and `ExecStart` paths assume.

---

## 4. Install the api-server's runtime dependencies

The release bundle is intentionally lean -- esbuild externalizes native deps like `bcrypt` and `pg-native`. Install them once from the repo checkout:

```bash
sudo -u brr -H bash -lc '
  cd /opt/brr/repo
  pnpm install --prod --filter @workspace/api-server --frozen-lockfile
'
```

This populates `/opt/brr/repo/artifacts/api-server/node_modules/`, which is what node's resolver finds at runtime (the systemd unit sets `WorkingDirectory` to `/opt/brr/repo/artifacts/api-server` for exactly this reason). Re-run this command only when `pnpm-lock.yaml` changes -- normal release builds don't touch it.

> **Why no symlinks?** Earlier revisions of this runbook symlinked `/opt/brr/api` -> `release/api` and `/opt/brr/api/node_modules` -> the source tree. That broke on every redeploy because `build-release.sh` wipes `release/` and re-creates it, leaving the second symlink dangling. Pointing systemd directly at the source-tree path avoids the issue.

---

## 5. Publish the static web build

```bash
sudo rsync -a --delete /opt/brr/repo/release/web/ /var/www/brr-web/
sudo chown -R nginx:nginx /var/www/brr-web 2>/dev/null || sudo chown -R www-data:www-data /var/www/brr-web
```

(`nginx` user on Amazon Linux, `www-data` on Ubuntu.)

---

## 6. Configure environment variables

Generate a session secret and write the env file:
```bash
SESSION_SECRET="$(openssl rand -hex 32)"

sudo install -m 600 -o root -g root deploy/aws-ec2/brr-api.env.example /etc/brr/brr-api.env
sudo sed -i "s|CHANGE_ME_TO_A_LONG_RANDOM_HEX_STRING|$SESSION_SECRET|" /etc/brr/brr-api.env
sudo $EDITOR /etc/brr/brr-api.env
```

In the editor, fill in `DATABASE_URL` (use `?sslmode=require` for RDS) and -- if this is the very first boot against an empty database -- uncomment `ADMIN_BOOTSTRAP_PASSWORD` and set it to something you'll remember for one minute (you'll change it on first login).

> **What's required vs optional:** `NODE_ENV`, `PORT`, `DATABASE_URL`, and `SESSION_SECRET` are required. The api-server refuses to start in production without `SESSION_SECRET`, and will exit immediately if `PORT` or `DATABASE_URL` is missing. `ADMIN_BOOTSTRAP_PASSWORD` is only consulted on first boot against an empty `users` table.

---

## 7. Apply the database schema

The database needs the BRR Liquor Soft tables before the api-server can serve traffic.

### 7.1 First-ever deploy (empty database)
```bash
cd /opt/brr/repo
DATABASE_URL='postgres://...same as in /etc/brr/brr-api.env...' \
  pnpm --filter @workspace/db run push
```
`drizzle-kit push` creates all tables defined in `lib/db/src/schema/schema.ts`.

### 7.2 Subsequent deploys (live database)
**Do not** run `pnpm --filter @workspace/db run push` against a live production database without inspecting it first. `drizzle-kit push` aborts if it would lose data (e.g. it asks "you're about to delete the session table with N items?"), but it can still be aggressive about column renames.

For additive changes (new columns, new tables), prefer the same pattern this project already uses for `password_changed_at` -- a hand-written `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` applied directly to the database:

```sql
-- example
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at
  TIMESTAMP NOT NULL DEFAULT now();
```

For destructive or renaming migrations, use a real migration tool (`drizzle-kit generate` + manual review of the SQL, or `pg_dump` first and apply the diff by hand).

---

## 8. Wire up systemd and nginx

### 8.1 systemd unit
```bash
sudo cp deploy/aws-ec2/brr-api.service.example /etc/systemd/system/brr-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now brr-api.service
sudo systemctl status brr-api.service
journalctl -u brr-api -n 50 --no-pager
```

You should see a line like `Server listening port=8080`. If `ADMIN_BOOTSTRAP_PASSWORD` was not set, the same log will contain a one-time generated admin password -- **copy it now**, it is not printed again.

Smoke-test the api directly:
```bash
curl -s http://127.0.0.1:8080/api/healthz
# {"status":"ok"}
```

### 8.2 nginx (pre-cert bootstrap)
```bash
sudo cp deploy/aws-ec2/nginx.conf.example /etc/nginx/conf.d/brr.conf
sudo sed -i 's/brr.example.com/<your-actual-domain>/g' /etc/nginx/conf.d/brr.conf
# Disable the default "welcome" site if your distro ships one:
#   Amazon Linux 2023: edit /etc/nginx/nginx.conf and delete or comment out
#     the default `server { listen 80 default_server; ... }` block.
#   Ubuntu: `sudo rm /etc/nginx/sites-enabled/default`
```

The shipped `nginx.conf.example` assumes you already have a TLS cert: the port-80 server redirects to HTTPS, and the port-443 server references `/etc/letsencrypt/live/.../fullchain.pem`. On a brand-new box those files don't exist yet, so nginx will refuse to start. **Before** the first `nginx -t`, edit `/etc/nginx/conf.d/brr.conf` so port 80 serves the app directly. The minimum edit is:

1. In the **port-80 server**, comment out the `location / { return 301 https://...; }` block and add the contents of the port-443 `server { ... }` block (everything from `client_max_body_size 16m;` down through the closing `}` of `location /`) directly inside the port-80 server.
2. Comment out (or delete) the **entire port-443 server block**, including the `ssl_certificate*` lines that point at files that don't exist yet.

Then bring nginx up:
```bash
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
# Verify the app loads over plain HTTP at http://<your-domain>/ before continuing.
```

Section 8.3 will run certbot, which puts the original two-server-block layout back (port 80 → redirect, port 443 → app) and fills in the real cert paths.

### 8.3 TLS via Let's Encrypt
```bash
sudo mkdir -p /var/www/letsencrypt
sudo certbot --nginx -d <your-actual-domain>
# Verify auto-renewal
sudo certbot renew --dry-run
```

certbot will rewrite `/etc/nginx/conf.d/brr.conf` to enable HTTPS. After that, browse to `https://<your-domain>` and you should see the login page.

> **Alternative**: terminate TLS at an Application Load Balancer (ALB) with an ACM certificate, point the ALB at port 80 on the EC2 box, and skip certbot. If you do this you need three small changes to the supplied `nginx.conf.example`, otherwise the secure session cookie won't get set:
>
> 1. Delete the `listen 443 ssl http2;` block and the HTTP→HTTPS redirect; nginx should serve everything on plain port 80 since the ALB is the TLS terminator.
> 2. Change `proxy_set_header X-Forwarded-Proto $scheme;` to `proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;` so nginx forwards the protocol the ALB observed (`https`) instead of the protocol it observed itself (`http`).
> 3. In `artifacts/api-server/src/app.ts`, change `app.set("trust proxy", 1)` to `app.set("trust proxy", 2)` so Express trusts both hops (ALB + nginx) when reading `X-Forwarded-Proto` to decide whether to mark the session cookie `Secure`.

---

## 9. First-login checklist

1. Browse to `https://<your-domain>/`.
2. Log in as `admin` with the bootstrap password (either the value of `ADMIN_BOOTSTRAP_PASSWORD` or the one printed once in `journalctl -u brr-api`).
3. The app will force you onto the **Reset Password** screen because the bootstrap account is created with `mustResetPassword=true`. Set a real password.
4. Comment out `ADMIN_BOOTSTRAP_PASSWORD` in `/etc/brr/brr-api.env` and `sudo systemctl restart brr-api` so it isn't sitting in the env file.
5. Create your other users from inside the app (Admin → Users).

---

## 10. Point the mobile app at AWS

The Expo app reads its API base URL from `EXPO_PUBLIC_DOMAIN` at build time (see `artifacts/brr-mobile/lib/api.ts`). When you build the production iOS/Android binary, set:

```bash
EXPO_PUBLIC_DOMAIN=<your-actual-domain> \
  eas build --profile production --platform all
```

The cookie-based session works the same as on the web because the mobile client captures `Set-Cookie` and replays it on subsequent requests.

---

## 11. Day-2 operations

### Logs
```bash
journalctl -u brr-api -f                # tail api-server logs
sudo tail -f /var/log/nginx/access.log  # nginx access
sudo tail -f /var/log/nginx/error.log   # nginx errors
```

### Health check
- `GET /api/healthz` → `{"status":"ok"}`. Use this for ALB target-group health checks (path `/api/healthz`, success code `200`).

### Deploying a new version
1. SSH in.
2. `cd /opt/brr/repo && sudo -u brr git pull && sudo -u brr bash scripts/deploy/build-release.sh`
3. `sudo -u brr pnpm install --prod --filter @workspace/api-server --frozen-lockfile`
4. `sudo rsync -a --delete /opt/brr/repo/release/web/ /var/www/brr-web/`
5. `sudo systemctl restart brr-api`
6. `sudo systemctl reload nginx` (only needed if `nginx.conf.example` itself changed)

### Rolling back
The simplest rollback is `git`-driven: `cd /opt/brr/repo && git checkout <previous-good-sha> && bash scripts/deploy/build-release.sh && sudo systemctl restart brr-api && sudo rsync -a --delete release/web/ /var/www/brr-web/`. The `release/` folder is regenerated from source each time, so the rollback always matches the chosen commit exactly.

If you need faster rollback (no rebuild), copy `release/api/dist/` and `release/web/` to a side directory like `/opt/brr/snapshots/<timestamp>/` *before* each deploy, and restore from there by rsync'ing back into `release/api/dist/` and `/var/www/brr-web/`.

---

## 12. Known limitations

- **Login lockout is in-process.** The brute-force protection on `/api/login` (5 failures → 15 min lockout, growing exponentially) keeps state in the api-server's memory. On a single EC2 instance this works perfectly. If you ever scale to **multiple** api-server instances behind a load balancer, an attacker could spread guesses across instances and dodge the lockout. There is a tracked task to move this state to Postgres / Redis when you're ready to scale horizontally.
- **Sessions are stored in Postgres** (`connect-pg-simple`), so they already work across instances -- only the lockout counters don't.

---

## 13. Cheat sheet -- env vars

| Variable                  | Required?      | Where it's read |
|---------------------------|----------------|-----------------|
| `NODE_ENV=production`     | yes            | `artifacts/api-server/src/index.ts` (gates `SESSION_SECRET` enforcement) |
| `PORT`                    | yes            | `artifacts/api-server/src/index.ts` |
| `DATABASE_URL`            | yes            | `artifacts/api-server/src/db.ts` (via `pg`) |
| `SESSION_SECRET`          | yes (in prod)  | `artifacts/api-server/src/auth.ts` |
| `ADMIN_BOOTSTRAP_PASSWORD`| optional       | `artifacts/api-server/src/routes/routes.ts` (only on first boot, empty users table) |
| `LOG_LEVEL`               | optional       | pino logger; defaults to `info` |
| `EXPO_PUBLIC_DOMAIN`      | mobile only    | `artifacts/brr-mobile/lib/api.ts` (build-time) |
