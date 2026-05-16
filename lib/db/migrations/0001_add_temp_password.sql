-- Add columns to users table that may be missing in older deployments.
-- Uses ADD COLUMN IF NOT EXISTS so this is safe to run multiple times.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temp_password" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_reset_password" boolean DEFAULT false;
