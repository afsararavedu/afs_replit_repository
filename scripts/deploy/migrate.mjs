#!/usr/bin/env node
/**
 * migrate.mjs — Auto-create database tables for BRR Liquor Soft.
 *
 * Checks whether the application tables already exist in the configured
 * schema. If they do, exits immediately (< 200 ms) — safe to run on
 * every service restart. If they don't, runs `drizzle-kit push --force`
 * to create them from the Drizzle schema definition.
 *
 * Environment variables (read from /etc/brr/brr-api.env if not already set):
 *   DATABASE_URL  — PostgreSQL connection string
 *   DB_SCHEMA     — target schema name (default: public)
 *
 * Usage (manual / CI):
 *   node scripts/deploy/migrate.mjs
 *
 * Usage (automated via systemd ExecStartPre — env already injected):
 *   ExecStartPre=/usr/bin/node /opt/brr/repo/scripts/deploy/migrate.mjs
 */

import { execSync }          from "child_process";
import { createRequire }      from "module";
import { fileURLToPath }      from "url";
import { dirname, join }      from "path";
import { readFileSync, existsSync } from "fs";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = join(__dirname, "../..");

// ── 1. Load env from /etc/brr/brr-api.env when vars are not already set ──────
if (!process.env.DATABASE_URL) {
  try {
    const raw = readFileSync("/etc/brr/brr-api.env", "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq  = t.indexOf("=");
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // env file absent — env vars must be set by the caller (e.g. systemd)
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const DB_SCHEMA    = process.env.DB_SCHEMA || "public";

if (!DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

// ── 2. Connect to DB (reuse pg from api-server's already-installed deps) ──────
const require = createRequire(
  join(REPO_ROOT, "artifacts/api-server/package.json"),
);
const { Client } = require("pg");

function buildUrl(base, schema) {
  const url  = new URL(base);
  const prev = url.searchParams.get("options") ?? "";
  const opt  = `-c search_path=${schema}`;
  url.searchParams.set("options", prev ? `${prev} ${opt}` : opt);
  return url.toString();
}

const client = new Client({
  connectionString: buildUrl(DATABASE_URL, DB_SCHEMA),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  // Ensure the schema exists (idempotent).
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`);

  // Check whether our anchor table ("users") already exists.
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = $1 AND table_name = 'users'`,
    [DB_SCHEMA],
  );

  if (rows.length > 0) {
    console.log(
      `[migrate] Schema "${DB_SCHEMA}" already has tables — skipping push.`,
    );
    process.exit(0);
  }

  console.log(
    `[migrate] No tables found in schema "${DB_SCHEMA}" — running drizzle-kit push...`,
  );
} catch (err) {
  console.error("[migrate] DB probe failed:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}

// ── 3. Create tables via drizzle-kit push ─────────────────────────────────────
const drizzleKit = join(REPO_ROOT, "node_modules/.bin/drizzle-kit");
const configFile = join(REPO_ROOT, "lib/db/drizzle.config.ts");
const libDbDir   = join(REPO_ROOT, "lib/db");

// drizzle-kit is a devDependency — it is present after a full `pnpm install`
// but absent when only `pnpm install --prod` was run (e.g. a fresh EC2 box
// that hasn't built yet). Install the workspace deps now if the binary is
// missing so the push can proceed.
if (!existsSync(drizzleKit)) {
  console.log(
    "[migrate] drizzle-kit not found — running pnpm install to fetch dev deps...",
  );
  try {
    execSync("pnpm install --frozen-lockfile", {
      cwd:   REPO_ROOT,
      stdio: "inherit",
    });
  } catch (err) {
    console.error("[migrate] pnpm install failed:", err.message);
    process.exit(1);
  }
}

try {
  execSync(
    `"${drizzleKit}" push --force --config "${configFile}"`,
    {
      cwd:   libDbDir,
      env:   { ...process.env, DATABASE_URL, DB_SCHEMA },
      stdio: "inherit",
    },
  );
  console.log(
    `[migrate] Tables created successfully in schema "${DB_SCHEMA}".`,
  );
} catch (err) {
  console.error("[migrate] drizzle-kit push failed:", err.message);
  process.exit(1);
}
