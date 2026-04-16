ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedules" ADD COLUMN IF NOT EXISTS "end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "day_of_week" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "start_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "end_time" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "schedules" ALTER COLUMN "group_id" TYPE varchar(50);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schedules_classroom_one_off_start_idx" ON "schedules" ("classroom_id","start_at");
