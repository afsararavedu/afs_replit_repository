-- ============================================================================
-- BRR Liquor Soft — Supabase Initial Setup
-- ============================================================================
-- Run this script in: Supabase Dashboard → SQL Editor → New Query
--
-- This creates all tenant schemas so they exist before the API server starts.
-- The API server will auto-create schemas too (db.ts bootstrap), but it's
-- safer to pre-create them here using the direct connection.
--
-- After running this, import your data using the pg_dump / pg_restore
-- commands documented in deploy/hostinger/MIGRATION.md
-- ============================================================================

-- Create tenant schemas (safe to run multiple times)
CREATE SCHEMA IF NOT EXISTS balaji_schema;
CREATE SCHEMA IF NOT EXISTS jyothi_schema;
CREATE SCHEMA IF NOT EXISTS padma_schema;
CREATE SCHEMA IF NOT EXISTS shop4_schema;

-- Verify schemas were created
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name IN ('balaji_schema','jyothi_schema','padma_schema','shop4_schema')
ORDER BY schema_name;
