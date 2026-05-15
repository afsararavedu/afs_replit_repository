#!/usr/bin/env node
/**
 * migrate.mjs — Apply database migrations for BRR Liquor Soft.
 *
 * Reads the committed SQL files from lib/db/migrations/ and applies any
 * that have not yet been recorded in __drizzle_migrations. This is the
 * same table that drizzle-orm's migrate() function uses, so the two are
 * fully compatible — whichever runs first wins, and the other is a no-op.
 *
 * WHY NOT drizzle-kit: drizzle-kit is a devDependency that cannot be assumed
 * to exist on EC2. The committed .sql files in lib/db/migrations/ ARE the
 * source of truth; drizzle-kit is only needed locally to generate them.
 *
 * Environment variables (read from /etc/brr/brr-api.env if not already set):
 *   DATABASE_URL  — PostgreSQL connection string
 *   DB_SCHEMA     — target schema name (default: public)
 *
 * Usage (manual / emergency):
 *   node scripts/deploy/migrate.mjs
 *
 * Normal operation: the api-server applies migrations automatically on every
 * startup via drizzle-orm's migrate() — you rarely need this script directly.
 */

import { createRequire }                   from "module";
import { fileURLToPath }                    from "url";
import { dirname, join, basename }          from "path";
import { readFileSync, readdirSync, existsSync } from "fs";
import { createHash }                       from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");

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
    // env file absent — env vars must be set by caller
  }
}

const DATABASE_URL = process.env.DATABASE_URL;
const DB_SCHEMA    = process.env.DB_SCHEMA || "public";

if (!DATABASE_URL) {
  console.error("[migrate] ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

// ── 2. Connect to DB ──────────────────────────────────────────────────────────
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
} catch (err) {
  console.error("[migrate] Could not connect to DB:", err.message);
  process.exit(1);
}

// ── 3. Ensure schema exists ───────────────────────────────────────────────────
try {
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`);
  console.log(`[migrate] Schema "${DB_SCHEMA}" is ready.`);
} catch (err) {
  console.error("[migrate] Could not create schema:", err.message);
  await client.end().catch(() => {});
  process.exit(1);
}

// ── 4. Ensure drizzle migrations tracking table exists ───────────────────────
// This is the same table drizzle-orm's migrate() function uses — compatible.
await client.query(`
  CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
    id        serial PRIMARY KEY,
    hash      text NOT NULL,
    created_at bigint
  )
`);

// ── 5. Read committed SQL files ───────────────────────────────────────────────
const migrationsDir = join(REPO_ROOT, "lib/db/migrations");
if (!existsSync(migrationsDir)) {
  console.error(`[migrate] Migrations folder not found at ${migrationsDir}`);
  console.error("[migrate] Run: pnpm --filter @workspace/db run generate");
  await client.end().catch(() => {});
  process.exit(1);
}

const sqlFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (sqlFiles.length === 0) {
  console.log("[migrate] No SQL migration files found — nothing to apply.");
  await client.end().catch(() => {});
  process.exit(0);
}

// ── 6. Apply pending migrations ───────────────────────────────────────────────
const { rows: applied } = await client.query(
  `SELECT hash FROM "__drizzle_migrations"`,
);
const appliedHashes = new Set(applied.map((r) => r.hash));

let appliedCount = 0;

for (const file of sqlFiles) {
  const sql  = readFileSync(join(migrationsDir, file), "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");

  if (appliedHashes.has(hash)) {
    console.log(`[migrate] ✓ Already applied: ${file}`);
    continue;
  }

  console.log(`[migrate] Applying: ${file} …`);

  // drizzle uses "--> statement-breakpoint" as the separator between statements
  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    await client.query("BEGIN");
    for (const stmt of statements) {
      await client.query(stmt);
    }
    await client.query(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
      [hash, Date.now()],
    );
    await client.query("COMMIT");
    appliedCount++;
    console.log(`[migrate] ✓ Applied: ${file}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[migrate] ✗ Failed: ${file} — ${err.message}`);
    await client.end().catch(() => {});
    process.exit(1);
  }
}

await client.end().catch(() => {});

if (appliedCount === 0) {
  console.log(`[migrate] Schema "${DB_SCHEMA}" is already up to date.`);
} else {
  console.log(
    `[migrate] Done. Applied ${appliedCount} migration(s) to schema "${DB_SCHEMA}".`,
  );
}
