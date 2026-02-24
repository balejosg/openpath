CREATE TABLE IF NOT EXISTS "api_tokens" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"user_id" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"last_four" varchar(4) NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "source" varchar(50) DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "machine_hostname" varchar(255);--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "origin_host" varchar(255);--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "origin_page" text;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "client_version" varchar(50);--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "error_type" varchar(100);--> statement-breakpoint
ALTER TABLE "whitelist_groups" ADD COLUMN IF NOT EXISTS "visibility" varchar(20) DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "whitelist_groups" ADD COLUMN IF NOT EXISTS "owner_user_id" varchar(50);--> statement-breakpoint
ALTER TABLE "whitelist_rules" ADD COLUMN IF NOT EXISTS "source" varchar(50) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "whitelist_groups" ADD CONSTRAINT "whitelist_groups_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
