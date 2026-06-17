ALTER TABLE "competitions" ADD COLUMN "allow_captain_entry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "allow_ref_entry" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "allow_organizer_entry" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN "require_confirmation" boolean DEFAULT false NOT NULL;