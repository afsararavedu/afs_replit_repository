# BRR Liquor Soft — Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains the BRR Liquor Soft web app (sales & inventory management for a liquor business), ported from a single-app structure into a multi-artifact workspace.

## Artifacts

- **`artifacts/brr-web/`** — React + Vite frontend, preview path `/` (port 18172 in dev)
- **`artifacts/api-server/`** — Express 5 backend API, preview path `/api`
- **`artifacts/brr-mobile/`** — Expo (React Native) mobile companion app, preview path `/brr-mobile/` (port 26176 in dev). Talks to the same `/api/*` backend via cookie-based session (Set-Cookie captured natively + stored in AsyncStorage).
- **`artifacts/mockup-sandbox/`** — Design/mockup canvas (pre-existing)

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 18, Wouter routing, TanStack Query, Tailwind CSS v3, shadcn/ui components
- **API framework**: Express 5
- **Auth**: Passport.js (local strategy) + express-session + connect-pg-simple
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod v3
- **File import**: multer + xlsx (Excel parsing), pdf-parse (PDF parsing)
- **Build**: esbuild (api-server), Vite (frontend)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run push-force` — force push DB schema (drops conflicting tables)

## Project Structure

```
artifacts/
  api-server/        # Express backend
    src/
      auth.ts        # Passport.js auth setup
      db.ts          # DB connection pool
      storage.ts     # Data access layer
      routes/
        routes.ts    # All API routes (registerRoutes)
        health.ts    # Health check route
      shared/
        routes.ts    # API route contract (paths + zod schemas)
  brr-web/           # React frontend
    src/
      App.tsx        # Main app with routing
      pages/         # Page components
      components/    # Shared UI components
      hooks/         # Custom hooks (auth, sales, orders)
      lib/           # queryClient, utils
      shared/        # Local type definitions + API contract
lib/
  db/                # Shared DB schema (Drizzle tables + types)
  api-spec/          # OpenAPI spec
  api-zod/           # Generated Zod schemas
  api-client-react/  # Generated React Query hooks
```

## Notes

- The replit.md mentions `zod/v4` but the workspace actually uses `zod` v3 (`^3.25.76`)
- The frontend's `@shared/*` alias resolves to `artifacts/brr-web/src/shared/` (local type copies, no backend imports)
- Session store uses `connect-pg-simple` (PostgreSQL-backed sessions)
- Password expiry: every user row carries `password_changed_at`. The api
  exposes a server-computed `passwordExpired` boolean on `/api/login` and
  `/api/user` responses (true when `password_changed_at` is older than 90
  days). The frontend forces a redirect to `/reset-password` only when
  `passwordExpired === true`. Users can also reset their password on
  demand via the "Reset Password" button in the sidebar.
- Initial admin bootstrap: on first startup against an empty `users` table the api-server creates a single `admin` account. The password comes from `ADMIN_BOOTSTRAP_PASSWORD` if that env var is set (must be ≥ 8 characters), otherwise a random one is generated and printed once to the server log. The account is created with `mustResetPassword: true`, so the operator is forced to set a real password on first login. No other accounts (including any "employee" account) are seeded — additional users must be created from inside the app by an admin.

## Required production secrets

- **`SESSION_SECRET`** — Long random string used to sign session cookies. **Required when `NODE_ENV=production`**: the api-server refuses to start without it (see `artifacts/api-server/src/index.ts`). In development a clear warning is logged and an insecure fallback is used. Generate with `openssl rand -hex 32`.
- **`ADMIN_BOOTSTRAP_PASSWORD`** *(optional)* — One-time password used when bootstrapping the very first admin account. Only consulted when no admin user exists yet. If unset, a random password is generated and printed once to the server log. Either way the account is created with `mustResetPassword: true` and must change its password on first login.
