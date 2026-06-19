ALTER TABLE "pools" ADD COLUMN "needs_drop" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "dropped_match_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_dropped_match_id_matches_id_fk" FOREIGN KEY ("dropped_match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;