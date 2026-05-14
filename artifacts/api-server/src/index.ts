import { createServer } from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";
import { db, pool, DB_SCHEMA } from "./db";
import { sql } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Fail fast in production if SESSION_SECRET is not configured. Without a
// real secret the session cookie signer falls back to a hardcoded value,
// which would let anyone who knows that value forge valid login cookies
// for any user (including admins). Better to refuse to start than to
// silently expose every account.
const nodeEnv = process.env["NODE_ENV"] ?? "development";
if (nodeEnv === "production" && !process.env["SESSION_SECRET"]) {
  logger.error(
    "SESSION_SECRET environment variable is required in production but " +
      "was not provided. Refusing to start: a missing secret would let " +
      "attackers forge valid login sessions. Set SESSION_SECRET to a " +
      "long random value (e.g. `openssl rand -hex 32`) and restart.",
  );
  process.exit(1);
}

const httpServer = createServer(app);

logger.info({ DB_SCHEMA }, "Active database schema (search_path)");

(async () => {
  try {
    await db.execute(sql`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='daily_sales' AND column_name='date'
        ) THEN
          ALTER TABLE daily_sales RENAME COLUMN "date" TO "sale_date";
        END IF;
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='stock_details' AND column_name='date'
        ) THEN
          ALTER TABLE stock_details RENAME COLUMN "date" TO "invoice_date";
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='daily_sales' AND column_name='invoice_date'
        ) THEN
          ALTER TABLE daily_sales ADD COLUMN "invoice_date" DATE;
        END IF;
      END $$
    `);
  } catch (e) {
    logger.warn({ err: e }, "Column rename migration skipped or already applied");
  }

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    logger.error({ err }, "Internal Server Error");
    if (res.headersSent) {
      return next(err);
    }
    return res.status(status).json({ message });
  });

  httpServer.listen({ port, host: "0.0.0.0" }, (err?: Error) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
})();
