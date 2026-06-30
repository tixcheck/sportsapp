CREATE TYPE "public"."kotc_event_type" AS ENUM('round_start', 'rally', 'round_end', 'void');--> statement-breakpoint
CREATE TYPE "public"."kotc_seed_metric" AS ENUM('normalized_placement', 'raw_points');--> statement-breakpoint
CREATE TYPE "public"."kotc_stage_kind" AS ENUM('seeding', 'elimination');--> statement-breakpoint
ALTER TYPE "public"."competition_type" ADD VALUE 'kotc';--> statement-breakpoint
CREATE TABLE "kotc_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"round_index" integer DEFAULT 0 NOT NULL,
	"type" "kotc_event_type" NOT NULL,
	"king_team_id" uuid,
	"challenger_team_id" uuid,
	"winner_team_id" uuid,
	"point_awarded" boolean DEFAULT false NOT NULL,
	"voids_seq" integer,
	"created_by" uuid,
	CONSTRAINT "kotc_events_pool_seq_unique" UNIQUE("pool_id","seq")
);
--> statement-breakpoint
CREATE TABLE "kotc_pool_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"entry_seed" integer,
	"queue_position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "kotc_pool_pairs_pool_team_unique" UNIQUE("pool_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "kotc_pool_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"pool_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"king_points" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer,
	"reached_final_seq" integer,
	"reached_final_at" timestamp with time zone,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kotc_pool_results_pool_team_unique" UNIQUE("pool_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "kotc_pools" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"current_round_index" integer DEFAULT 0 NOT NULL,
	"clock_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kotc_seeds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"seed_score" numeric,
	"total_points" integer DEFAULT 0 NOT NULL,
	"seed_rank" integer,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kotc_seeds_competition_team_unique" UNIQUE("competition_id","team_id")
);
--> statement-breakpoint
CREATE TABLE "kotc_settings" (
	"competition_id" uuid PRIMARY KEY NOT NULL,
	"pairs_per_pool" integer DEFAULT 5 NOT NULL,
	"rounds_per_session" integer DEFAULT 3 NOT NULL,
	"round_minutes" integer DEFAULT 15 NOT NULL,
	"point_cap" integer,
	"seeding_round_count" integer DEFAULT 2 NOT NULL,
	"seed_metric" "kotc_seed_metric" DEFAULT 'normalized_placement' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kotc_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"competition_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"kind" "kotc_stage_kind" NOT NULL,
	"name" text NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_pool_id_kotc_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."kotc_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_king_team_id_teams_id_fk" FOREIGN KEY ("king_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_challenger_team_id_teams_id_fk" FOREIGN KEY ("challenger_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_winner_team_id_teams_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_events" ADD CONSTRAINT "kotc_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pool_pairs" ADD CONSTRAINT "kotc_pool_pairs_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pool_pairs" ADD CONSTRAINT "kotc_pool_pairs_pool_id_kotc_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."kotc_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pool_pairs" ADD CONSTRAINT "kotc_pool_pairs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pool_results" ADD CONSTRAINT "kotc_pool_results_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pool_results" ADD CONSTRAINT "kotc_pool_results_pool_id_kotc_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."kotc_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pool_results" ADD CONSTRAINT "kotc_pool_results_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pools" ADD CONSTRAINT "kotc_pools_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_pools" ADD CONSTRAINT "kotc_pools_stage_id_kotc_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."kotc_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_seeds" ADD CONSTRAINT "kotc_seeds_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_seeds" ADD CONSTRAINT "kotc_seeds_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_settings" ADD CONSTRAINT "kotc_settings_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kotc_stages" ADD CONSTRAINT "kotc_stages_competition_id_competitions_id_fk" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kotc_events_pool_id_idx" ON "kotc_events" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "kotc_pool_pairs_pool_id_idx" ON "kotc_pool_pairs" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "kotc_pools_stage_id_idx" ON "kotc_pools" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "kotc_stages_competition_id_idx" ON "kotc_stages" USING btree ("competition_id");--> statement-breakpoint
-- ===========================================================================
-- King of the Court RLS — readable by anyone who can view the competition;
-- writable only by competition admins (organizers / scorekeepers). Every KotC
-- table carries competition_id so the policies are uniform.
-- ===========================================================================
ALTER TABLE "kotc_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_settings_select" ON "kotc_settings" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_settings_admin_all" ON "kotc_settings" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_stages_select" ON "kotc_stages" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_stages_admin_all" ON "kotc_stages" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_pools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_pools_select" ON "kotc_pools" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_pools_admin_all" ON "kotc_pools" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_pool_pairs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_pool_pairs_select" ON "kotc_pool_pairs" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_pool_pairs_admin_all" ON "kotc_pool_pairs" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_events_select" ON "kotc_events" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_events_admin_all" ON "kotc_events" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_pool_results" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_pool_results_select" ON "kotc_pool_results" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_pool_results_admin_all" ON "kotc_pool_results" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));--> statement-breakpoint
ALTER TABLE "kotc_seeds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "kotc_seeds_select" ON "kotc_seeds" FOR SELECT USING (public.can_view_competition(competition_id));--> statement-breakpoint
CREATE POLICY "kotc_seeds_admin_all" ON "kotc_seeds" FOR ALL TO authenticated USING (public.is_competition_admin(competition_id)) WITH CHECK (public.is_competition_admin(competition_id));