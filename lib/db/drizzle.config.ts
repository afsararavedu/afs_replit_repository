import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

const DB_SCHEMA = process.env.DB_SCHEMA || "public";

function buildConnectionString(base: string, dbSchema: string): string {
  if (dbSchema === "public") return base;
  const url = new URL(base);
  const existing = url.searchParams.get("options") ?? "";
  const schemaOption = `-c search_path=${dbSchema}`;
  url.searchParams.set(
    "options",
    existing ? `${existing} ${schemaOption}` : schemaOption,
  );
  return url.toString();
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // Migration SQL files are written here by `drizzle-kit generate` and read
  // by drizzle-orm's migrate() in the api-server at startup. Committing these
  // files means drizzle-kit is only needed locally/in CI, never on EC2.
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  dbCredentials: {
    url: buildConnectionString(process.env.DATABASE_URL, DB_SCHEMA),
  },
  // Only inspect/create tables in the configured schema.
  // Without this, drizzle-kit sees every table in every schema (including
  // the "session" table created by connect-pg-simple) and tries to drop them.
  schemaFilter: [DB_SCHEMA],
  // Exclude the "session" table — it is managed by connect-pg-simple, not
  // by drizzle, and must never be dropped or altered by drizzle-kit push.
  tablesFilter: ["!session"],
});
