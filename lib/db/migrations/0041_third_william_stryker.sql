ALTER TABLE "league_settings" ADD COLUMN "games_per_team" integer;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "match_format" jsonb;