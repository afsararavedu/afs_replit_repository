
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

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Set search_path on every new connection so every Drizzle query
// automatically targets the configured schema without any query changes.
pool.on("connect", (client) => {
  client.query(`SET search_path TO "${DB_SCHEMA}"`);
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error:", err.message);
});

export const db = drizzle(pool, { schema });
