-- Add temp_password column to users table if it doesn't already exist.
-- This migration is needed for deployments where the users table was
-- created before temp_password was added to the Drizzle schema.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "temp_password" text;
