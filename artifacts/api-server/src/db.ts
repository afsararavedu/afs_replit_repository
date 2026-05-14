
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@workspace/db";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// DB_SCHEMA selects the PostgreSQL schema (search_path) for this tenant.
// e.g. DB_SCHEMA=balaji_schema  →  all tables resolved inside balaji_schema.
// Defaults to "public" when not set (standard single-tenant behaviour).
export const DB_SCHEMA = process.env.DB_SCHEMA || "public";

// Embed search_path directly in the PostgreSQL connection string via the
// `options` GUC parameter.  This is the most reliable approach because:
//
//   1. The PostgreSQL server applies search_path at the protocol level,
//      before the first SQL query runs — zero timing issues.
//   2. Every connection from this pool (AND from any other pool/conObject
//      that uses the same connectionString) gets the right schema without
//      any extra SQL round-trips or pool event hooks.
//   3. Eliminates the pg@8 deprecation warning that arises when calling
//      client.query() inside pool.on("connect").
//
// Format:  ?options=-c%20search_path%3D<schema>
// pg passes the value as-is to the PostgreSQL startup packet.
function buildConnectionString(base: string, dbSchema: string): string {
  // Parse as URL so we can safely append / replace the options param
  // without double-encoding anything already present (e.g. sslmode=...).
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
