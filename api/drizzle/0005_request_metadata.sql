-- Migration: Add metadata columns to requests table
-- Purpose: improve traceability for extension-originated domain requests

ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "source" varchar(50) DEFAULT 'unknown';
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "machine_hostname" varchar(255);
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "origin_host" varchar(255);
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "origin_page" text;
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "client_version" varchar(50);
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "error_type" varchar(100);
