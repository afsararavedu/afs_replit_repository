#!/usr/bin/env node
/**
 * reset-schema.mjs
 *
 * Drops and recreates a PostgreSQL schema so that drizzle-kit push can start
 * from a clean slate (no column-type conflicts, no stale tables).
 *
 * Usage (EC2):
 *   DB_SCHEMA=jyothi_schema \
 *   DATABASE_URL='postgresql://user:pass@host/db?sslmode=no-verify' \
 *   node scripts/deploy/reset-schema.mjs
 *
 * WARNING: ALL DATA in the named schema is permanently deleted.
 * Run db-snapshot.sh first if you need a backup.
 *
 * NOTE: pg is resolved from artifacts/api-server/node_modules so no extra
 * pnpm install step is needed on the EC2 box.
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Resolve pg from api-server's node_modules (already installed on EC2).
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(
  join(__dirname, "../../artifacts/api-server/package.json"),
);
const pg = require("pg");
const { Client } = pg;

const schema = process.env.DB_SCHEMA;
const url = process.env.DATABASE_URL;

if (!schema || !url) {
  console.error("ERROR: DB_SCHEMA and DATABASE_URL must both be set.");
  process.exit(1);
}

if (schema === "public") {
  console.error('ERROR: refusing to drop the "public" schema.');
  process.exit(1);
}

console.log(`\nThis will DROP and RECREATE the schema: ${schema}`);
console.log("ALL DATA in that schema will be permanently deleted.\n");

const client = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();

  console.log(`Dropping schema "${schema}" (CASCADE)...`);
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);

  console.log(`Creating schema "${schema}"...`);
  await client.query(`CREATE SCHEMA "${schema}"`);

  console.log(
    `\nDone. Schema "${schema}" is empty and ready for drizzle-kit push.\n`,
  );
} catch (err) {
  console.error("ERROR:", err.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
