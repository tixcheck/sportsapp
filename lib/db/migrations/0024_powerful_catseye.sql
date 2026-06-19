CREATE TYPE "public"."bracket_track" AS ENUM('championship', 'consolation');--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "bracket_track" "bracket_track";