# BRR Liquor Soft — EC2 HTTP Deployment Guide

Complete step-by-step guide to deploy BRR Liquor Soft on AWS EC2 with plain HTTP
(no HTTPS required). Compatible with iPad and Android tablet browsers.

---

## What you need before starting

- An EC2 instance running Ubuntu 22.04 / 24.04
- Node.js 20+ installed on EC2 (`node --version` to check)
- nginx installed on EC2 (`nginx -v` to check)
- Your RDS PostgreSQL connection string
- The release package: `brr-liquor-soft-release.tar.gz`

---

## Step 1 — Upload the release package to EC2

Download `brr-liquor-soft-release.tar.gz` from Replit (right-click the file in the
file browser → Download), then upload it to EC2:

```bash
# Run this on your LOCAL machine (replace the key and IP)
scp -i your-key.pem brr-liquor-soft-release.tar.gz ubuntu@16.112.170.203:~
```

Or if you have the file on your local machine you can also use any SFTP client
(FileZilla, Cyberduck, WinSCP) to drag-and-drop it to the EC2 home folder.

---

## Step 2 — SSH into EC2 and extract the package

```bash
ssh -i your-key.pem ubuntu@16.112.170.203

# Create the deployment folder and extract
sudo mkdir -p /opt/brr
sudo tar -xzf ~/brr-liquor-soft-release.tar.gz -C /opt/brr

# Verify the layout
ls /opt/brr/release/api/dist/   # should show index.mjs
ls /opt/brr/release/web/        # should show index.html
```

---

## Step 3 — Create the environment file

```bash
sudo mkdir -p /etc/brr
sudo tee /etc/brr/brr-api.env << 'EOF'
# BRR Liquor Soft — API server environment
NODE_ENV=http
PORT=8080
DATABASE_URL=postgres://balajiwinesdb:balajiwines2026@balajiwinesdbinstance.cz4wg8sgwb97.ap-south-2.rds.amazonaws.com:5432/postgres
SESSION_SECRET=REPLACE_WITH_OUTPUT_OF_openssl_rand_-hex_32
EOF

# Lock down the file (contains DB password)
sudo chmod 600 /etc/brr/brr-api.env
sudo chown root:root /etc/brr/brr-api.env
```

**Generate a real SESSION_SECRET** (do this once and paste the output into the file):

```bash
openssl rand -hex 32
# paste the output as the SESSION_SECRET value above
sudo nano /etc/brr/brr-api.env
```

---

## Step 4 — Create the database tables

Connect to RDS and create all required tables:

```bash
psql "postgres://balajiwinesdb:balajiwines2026@balajiwinesdbinstance.cz4wg8sgwb97.ap-south-2.rds.amazonaws.com:5432/postgres" << 'SQL'

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  username            TEXT NOT NULL UNIQUE,
  password            TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'employee',
  must_reset_password BOOLEAN NOT NULL DEFAULT false,
  password_changed_at TIMESTAMP DEFAULT NOW(),
  created_at          TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_details (
  id         SERIAL PRIMARY KEY,
  shop_name  TEXT NOT NULL,
  address    TEXT,
  phone      TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_details (
  id             SERIAL PRIMARY KEY,
  brand_number   TEXT NOT NULL,
  brand_name     TEXT NOT NULL,
  size           TEXT NOT NULL,
  mrp            NUMERIC NOT NULL DEFAULT 0,
  cases          INTEGER NOT NULL DEFAULT 0,
  bottles        INTEGER NOT NULL DEFAULT 0,
  invoice_date   DATE,
  pack_size      TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_sales (
  id             SERIAL PRIMARY KEY,
  brand_number   TEXT NOT NULL,
  brand_name     TEXT NOT NULL,
  size           TEXT NOT NULL,
  opening_cases  INTEGER NOT NULL DEFAULT 0,
  opening_bottles INTEGER NOT NULL DEFAULT 0,
  closing_cases  INTEGER NOT NULL DEFAULT 0,
  closing_bottles INTEGER NOT NULL DEFAULT 0,
  breakage       INTEGER NOT NULL DEFAULT 0,
  sale_date      DATE NOT NULL,
  invoice_date   DATE,
  submitted      BOOLEAN NOT NULL DEFAULT false,
  submitted_by   TEXT,
  submitted_at   TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_submit_status (
  id           SERIAL PRIMARY KEY,
  sale_date    DATE NOT NULL UNIQUE,
  submitted    BOOLEAN NOT NULL DEFAULT false,
  submitted_by TEXT,
  submitted_at TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id             SERIAL PRIMARY KEY,
  brand_number   TEXT NOT NULL,
  brand_name     TEXT NOT NULL,
  size           TEXT NOT NULL,
  mrp            NUMERIC NOT NULL DEFAULT 0,
  cases          INTEGER NOT NULL DEFAULT 0,
  bottles        INTEGER NOT NULL DEFAULT 0,
  invoice_date   DATE,
  invoice_number TEXT,
  pack_size      TEXT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_stock (
  id           SERIAL PRIMARY KEY,
  brand_number TEXT NOT NULL,
  brand_name   TEXT NOT NULL,
  size         TEXT NOT NULL,
  cases        INTEGER NOT NULL DEFAULT 0,
  bottles      INTEGER NOT NULL DEFAULT 0,
  stock_date   DATE NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_mrp_details (
  id           SERIAL PRIMARY KEY,
  brand_number TEXT NOT NULL UNIQUE,
  brand_name   TEXT NOT NULL,
  size         TEXT NOT NULL,
  mrp          NUMERIC NOT NULL DEFAULT 0,
  pack_size    TEXT,
  updated_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS daily_expenses (
  id           SERIAL PRIMARY KEY,
  date         DATE NOT NULL,
  type         TEXT NOT NULL,
  category     TEXT NOT NULL,
  amount       NUMERIC NOT NULL DEFAULT 0,
  description  TEXT,
  payment_mode TEXT NOT NULL DEFAULT 'Cash',
  submitted_by TEXT NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS session (
  sid    TEXT PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);

-- Confirm all tables created
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

SQL
```

---

## Step 5 — Configure nginx

```bash
sudo tee /etc/nginx/conf.d/brr.conf << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name _;

    client_max_body_size 16m;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    root /opt/brr/release/web;
    index index.html;

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location = /index.html {
        add_header Cache-Control "no-store";
        try_files $uri =404;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

# Remove the default nginx site if present
sudo rm -f /etc/nginx/sites-enabled/default

# Test and reload
sudo nginx -t && sudo systemctl reload nginx
```

---

## Step 6 — Create the systemd service

```bash
sudo tee /etc/systemd/system/brr-api.service << 'EOF'
[Unit]
Description=BRR Liquor Soft API server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/brr/release/api
ExecStart=/usr/bin/node --enable-source-maps /opt/brr/release/api/dist/index.mjs
EnvironmentFile=/etc/brr/brr-api.env
Restart=on-failure
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable brr-api
sudo systemctl start brr-api
sleep 3
sudo systemctl status brr-api --no-pager
```

---

## Step 7 — Verify everything is working

```bash
# 1. Check API server is up
curl http://localhost:8080/api/healthz
# Expected: {"status":"ok"}

# 2. Test login and confirm Set-Cookie is sent (no "Secure" flag)
curl -s -i -X POST http://localhost:8080/api/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"balajiadmin","password":"Brr@2026"}' \
  | grep -i "set-cookie\|http/"
# Expected: Set-Cookie: connect.sid=...; Path=/; ... HttpOnly; SameSite=Lax
# (NO "Secure" word in the cookie = working correctly over HTTP)

# 3. Open in browser
echo "Open: http://16.112.170.203/"
```

---

## Step 8 — First login

1. Open `http://16.112.170.203/` in your browser (or tablet)
2. Log in with `balajiadmin` / `Brr@2026`
3. You will be prompted to set a new password (admin account always forces a reset on first login)
4. After resetting, you are in the app

---

## Updating the app in future

When a new release package is available:

```bash
# Upload new brr-liquor-soft-release.tar.gz to EC2, then:

sudo systemctl stop brr-api

sudo rm -rf /opt/brr/release
sudo tar -xzf ~/brr-liquor-soft-release.tar.gz -C /opt/brr

sudo systemctl start brr-api
sleep 2
sudo systemctl status brr-api --no-pager
```

Database tables are NOT touched by an update — your data is safe.

---

## Troubleshooting

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `sudo systemctl status brr-api` — service not running |
| Login works but all pages show 401 | `NODE_ENV` in brr-api.env must NOT be `production` — use `http` |
| Expenses page blank | Missing DB tables — re-run Step 4 |
| Session lost after browser close | Normal if `SESSION_SECRET` changed — re-login |
| Can't reach from tablet | EC2 Security Group must allow inbound TCP port 80 from 0.0.0.0/0 |

---

## EC2 Security Group (important for tablet access)

Make sure your EC2 Security Group has:

| Type | Port | Source |
|---|---|---|
| HTTP | 80 | 0.0.0.0/0 (or your office/home IP) |
| SSH | 22 | Your IP only |

To check: AWS Console → EC2 → your instance → Security tab → Security Groups → Edit inbound rules.
