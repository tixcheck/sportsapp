"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Trophy } from "lucide-react";

import { drawSessionPlayoffAction } from "@/server/actions/session-playoff";
import {
  PLAYOFF_FORMATS,
  planPlayoffNight,
  playoffFormat,
} from "@/lib/scheduler/playoff-formats";
import type { SessionPlayoffNight } from "@/lib/queries/session-playoff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

const formSchema = z.object({
  night: z.string().min(1, "Pick a playoff night."),
  formatId: z.string().min(1, "Pick a playoff format."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a start time."),
  slotMinutes: z.coerce
    .number({ message: "Enter minutes per game." })
    .int("Whole minutes only.")
    .min(20, "At least 20 minutes.")
    .max(180, "At most 3 hours."),
});
type FormValues = z.infer<typeof formSchema>;

/**
 * The playoff at the end of each session — Big Shoots plays one every third
 * Friday, then re-drafts. The organizer picks a named format and the night;
 * the seeds come from that session's own games, and the preview shows exactly
 * what will be drawn before anything changes.
 */
export function SessionPlayoffPanel({
  competitionId,
  nights,
  timezone,
  defaultStartTime,
  courts,
  today,
}: {
  competitionId: string;
  nights: SessionPlayoffNight[];
  timezone: string;
  defaultStartTime: string;
  courts: string[];
  today: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const firstOpen =
    nights.find((n) => n.night >= today && n.scored === 0) ?? nights[0];
  const form = useForm<z.input<typeof formSchema>, unknown, FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      night: firstOpen?.night ?? "",
      formatId: PLAYOFF_FORMATS[0].id,
      startTime: defaultStartTime,
      slotMinutes: PLAYOFF_FORMATS[0].defaultSlotMinutes,
    },
  });
  const values = useWatch({ control: form.control });
  const format = playoffFormat(values.formatId ?? "");
  const night = nights.find((n) => n.night === values.night);
  const errors = form.formState.errors;

  let preview: ReturnType<typeof planPlayoffNight> | null = null;
  let previewError: string | null = null;
  if (format && night) {
    try {
      preview = planPlayoffNight(
        format,
        night.seeds.slice(0, format.teams).map((s) => s.teamId),
        {
          date: night.night,
          startTime: values.startTime ?? "",
          slotMinutes: Number(values.slotMinutes) || format.defaultSlotMinutes,
          zone: timezone,
          courts,
        },
      );
    } catch (e) {
      previewError = (e as Error).message;
    }
  }
  const nameOf = new Map(night?.seeds.map((s) => [s.teamId, s.name]) ?? []);
  const seedOf = new Map(night?.seeds.map((s, i) => [s.teamId, i + 1]) ?? []);
  const side = (id: string | null, fallback: string) =>
    id ? `${seedOf.get(id)} ${nameOf.get(id)}` : fallback;

  function submit(v: FormValues) {
    start(async () => {
      const res = await drawSessionPlayoffAction({ competitionId, ...v });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(`Playoff drawn — ${res.games} games.`);
      router.refresh();
    });
  }

  if (nights.length === 0) return null;

  return (
    <form
      onSubmit={form.handleSubmit(submit)}
      className="border-border space-y-4 rounded-lg border p-4"
    >
      <div>
        <h4 className="font-display flex items-center gap-2 text-lg font-semibold">
          <Trophy className="size-4" /> Session playoffs
        </h4>
        <p className="text-muted-foreground text-sm">
          The last night of each session. Seeds come from that session&apos;s
          games only, and the playoff replaces the night&apos;s regular games.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sp-format">Format</Label>
          <NativeSelect id="sp-format" {...form.register("formatId")}>
            {PLAYOFF_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-night">Playoff night</Label>
          <NativeSelect id="sp-night" {...form.register("night")}>
            {nights.map((n) => (
              <option key={n.night} value={n.night}>
                {DateTime.fromISO(n.night).toFormat("EEE d LLL")}
                {n.scored > 0 ? " — played" : n.drawn ? " — drawn" : ""}
              </option>
            ))}
          </NativeSelect>
          {errors.night && (
            <p className="text-destructive text-xs">{errors.night.message}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-start">First game</Label>
          <Input id="sp-start" type="time" {...form.register("startTime")} />
          {errors.startTime && (
            <p className="text-destructive text-xs">
              {errors.startTime.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sp-minutes">Minutes per game</Label>
          <Input
            id="sp-minutes"
            type="number"
            inputMode="numeric"
            {...form.register("slotMinutes")}
          />
          {errors.slotMinutes && (
            <p className="text-destructive text-xs">
              {errors.slotMinutes.message}
            </p>
          )}
        </div>
      </div>

      {format && (
        <p className="bg-muted rounded-md px-3 py-2 text-sm">
          {format.description}
        </p>
      )}

      {night && (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground text-xs">
            {night.seedingNights.length
              ? `Seeded from ${night.seedingNights
                  .map((d) => DateTime.fromISO(d).toFormat("d LLL"))
                  .join(" and ")}.`
              : "No games in this session yet — seeds will follow the team list."}
          </p>
          <ol className="grid gap-1 sm:grid-cols-2">
            {night.seeds.slice(0, format?.teams ?? 4).map((s, i) => (
              <li key={s.teamId} className="flex justify-between gap-2">
                <span>
                  <span className="text-muted-foreground tabular-nums">
                    {i + 1}.
                  </span>{" "}
                  {s.name}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {s.record}
                </span>
              </li>
            ))}
          </ol>
          {preview && (
            <ul className="border-border divide-border divide-y rounded-md border">
              {preview.map((g) => {
                // Final and 3rd place are filled by the semis' results.
                const from = g.label === "3rd place" ? "Loser" : "Winner";
                return (
                  <li
                    key={`${g.round}:${g.position}`}
                    className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 px-3 py-2"
                  >
                    <span>
                      <span className="font-medium">{g.label}</span> ·{" "}
                      {side(g.homeTeamId, `${from} SF1`)} v{" "}
                      {side(g.awayTeamId, `${from} SF2`)}
                    </span>
                    <span className="text-muted-foreground tabular-nums">
                      {DateTime.fromISO(g.scheduledAt, {
                        zone: timezone,
                      }).toFormat("h:mm a")}{" "}
                      · {g.court}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {previewError && (
            <p className="text-destructive text-xs">{previewError}</p>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={pending || !preview || (night?.scored ?? 0) > 0}
        className="w-full sm:w-auto"
      >
        {night?.drawn ? "Redraw this playoff" : "Draw the playoff"}
      </Button>
      {night && night.scored > 0 && (
        <p className="text-muted-foreground text-xs">
          This night already has scores, so it can&apos;t be redrawn.
        </p>
      )}
    </form>
  );
}
