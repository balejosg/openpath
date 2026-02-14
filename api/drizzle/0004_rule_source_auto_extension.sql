ALTER TABLE "whitelist_rules"
ADD COLUMN IF NOT EXISTS "source" varchar(50) DEFAULT 'manual' NOT NULL;
