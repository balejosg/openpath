-- Add Google OAuth support (machine download tokens handled by 0003)

ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_id" varchar(255);--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_google_id_unique" UNIQUE("google_id");
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;