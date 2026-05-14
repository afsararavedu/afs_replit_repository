
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db";

const { Pool, Client } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// DB_SCHEMA selects the PostgreSQL schema (search_path) for this tenant.
// e.g. DB_SCHEMA=balaji_schema  →  all tables resolved inside balaji_schema.
// Defaults to "public" when not set (standard single-tenant behaviour).
export const DB_SCHEMA = process.env.DB_SCHEMA || "public";

// ── Schema bootstrap (top-level await) ────────────────────────────────────────
//
// WHY: The session store (connect-pg-simple) runs CREATE TABLE IF NOT EXISTS
// the moment DatabaseStorage is constructed (at module load time).  If the
// PostgreSQL schema named in DB_SCHEMA does not exist yet, that CREATE TABLE
// silently fails and every request after login returns 401 because sessions
// can never be saved.
//
// FIX: Use a plain Client (not the pool) to guarantee the schema exists
// BEFORE the module finishes loading and BEFORE any other module can import
// `pool` or `db`.  Top-level await makes Node.js wait here — storage.ts and
// everything else that imports db.ts will only continue once this resolves.
//
// The Client uses process.env.DATABASE_URL directly (no search_path option)
// because CREATE SCHEMA does not use search_path.
if (DB_SCHEMA !== "public") {
  const bootstrapClient = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await bootstrapClient.connect();
    await bootstrapClient.query(
      `CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`,
    );
    // eslint-disable-next-line no-console
    console.info(`[db] Schema "${DB_SCHEMA}" is ready.`);
  } catch (err: unknown) {
    // Log but do not crash — if the schema already exists this will not fire.
    // If the DB user lacks CREATE SCHEMA privileges the app will still start
    // but the operator must pre-create the schema manually.
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[db] Could not create schema "${DB_SCHEMA}": ${msg}`);
    console.error(
      `[db] If this is a permissions error, run:  CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}";  as a superuser, then restart.`,
    );
  } finally {
    await bootstrapClient.end().catch(() => {});
  }
}
// ──────────────────────────────────────────────────────────────────────────────

// Embed search_path directly in the PostgreSQL connection string via the
// `options` GUC parameter so every connection from the pool automatically
// targets the configured schema — no extra SQL round-trips or event hooks.
function buildConnectionString(base: string, dbSchema: string): string {
  const url = new URL(base);
  const existing = url.searchParams.get("options") ?? "";
  const schemaOption = `-c search_path=${dbSchema}`;
  url.searchParams.set(
    "options",
    existing ? `${existing} ${schemaOption}` : schemaOption,
  );
  return url.toString();
}

const connectionString = buildConnectionString(
  process.env.DATABASE_URL,
  DB_SCHEMA,
);

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected database pool error:", err.message);
});

export const db = drizzle(pool, { schema });
