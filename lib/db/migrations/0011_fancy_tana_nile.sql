CREATE TYPE "public"."team_status" AS ENUM('active', 'withdrawn');--> statement-breakpoint
ALTER TABLE "pools" ADD COLUMN "match_format" jsonb;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "status" "team_status" DEFAULT 'active' NOT NULL;