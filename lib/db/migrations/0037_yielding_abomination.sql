ALTER TYPE "public"."kotc_stage_kind" ADD VALUE 'consolation';--> statement-breakpoint
ALTER TYPE "public"."kotc_stage_kind" ADD VALUE 'finals';--> statement-breakpoint
CREATE TABLE "kotc_round_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"king_points" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer,
	"reached_final_seq" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kotc_round_results_round_team_unique" UNIQUE("round_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "kotc_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"round_index" integer DEFAULT 0 NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"minutes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kotc_rounds_pool_round_unique" UNIQUE("pool_id","round_index")
);
--> statement-breakpoint
ALTER TABLE "kotc_events" ADD COLUMN "round_id" uuid;--> statement-breakpoint
ALTER TABLE "kotc_pool_pairs" ADD COLUMN "eliminated_at_round" integer;--> statement-breakpoint
ALTER TABLE "kotc_round_results" ADD CONSTRAINT "kotc_round_results_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_round_results" ADD CONSTRAINT "kotc_round_results_round_id_kotc_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."kotc_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_round_results" ADD CONSTRAINT "kotc_round_results_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_rounds" ADD CONSTRAINT "kotc_rounds_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_rounds" ADD CONSTRAINT "kotc_rounds_pool_id_kotc_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."kotc_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kotc_round_results_round_id_idx" ON "kotc_round_results" USING btree ("round_id");--> statement-breakpoint
CREATE INDEX "kotc_rounds_pool_id_idx" ON "kotc_rounds" USING btree ("pool_id");--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_round_id_kotc_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."kotc_rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- ===========================================================================
-- RLS for the new KotC elimination tables — same shape as migration 0036:
-- readable by anyone who can view the competition, writable by competition
-- admins. (eliminated_at_round / round_id are columns on the already-RLS'd
-- kotc_pool_pairs / kotc_events, so they need no new policies.)
-- ===========================================================================
ALTER TABLE "kotc_rounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_rounds_select" ON "kotc_rounds" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_rounds_admin_all" ON "kotc_rounds" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_round_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_round_results_select" ON "kotc_round_results" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_round_results_admin_all" ON "kotc_round_results" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));