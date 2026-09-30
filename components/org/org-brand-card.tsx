"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { updateOrgBrandAction } from "@/server/actions/orgs";
import { embedTheme, parseHexColor } from "@/lib/embed/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const colour = z
  .string()
  .trim()
  .refine(
    (v) => v === "" || parseHexColor(v) !== null,
    "Use a colour like #c04890.",
  );
const formSchema = z
  .object({ accent: colour, background: colour })
  .refine((v) => !v.background || v.accent, {
    path: ["accent"],
    message: "Pick an accent to go with the background.",
  });
type FormValues = z.infer<typeof formSchema>;

/**
 * The org's colours on its public event pages — Reverse Pairs, registration.
 *
 * Two inputs on purpose: the accent (buttons, highlights) and the page
 * background. Text and card edges are derived so they stay readable, which the
 * preview shows before anything is saved.
 */
export function OrgBrandCard({
  orgId,
  initialAccent,
  initialBackground,
}: {
  orgId: string;
  initialAccent: string | null;
  initialBackground: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      accent: initialAccent ?? "",
      background: initialBackground ?? "",
    },
  });
  const v = useWatch({ control: form.control });
  const theme = embedTheme({ accent: v.accent, background: v.background });
  const errors = form.formState.errors;

  function save(values: FormValues) {
    start(async () => {
      const res = await updateOrgBrandAction({ orgId, ...values });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        values.accent ? "Brand colours saved." : "Colours cleared.",
      );
      router.refresh();
    });
  }

  const field = (
    name: "accent" | "background",
    label: string,
    hint: string,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`brand-${name}`}>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          className="border-input h-8 w-10 shrink-0 cursor-pointer rounded-lg border bg-transparent p-0.5"
          value={parseHexColor(v[name]) ?? "#ffffff"}
          onChange={(e) =>
            form.setValue(name, e.target.value, { shouldValidate: true })
          }
        />
        <Input
          id={`brand-${name}`}
          placeholder={name === "accent" ? "#c04890" : "Optional"}
          {...form.register(name)}
        />
      </div>
      {errors[name] ? (
        <p className="text-destructive text-xs">{errors[name]?.message}</p>
      ) : (
        <p className="text-muted-foreground text-xs">{hint}</p>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand colours</CardTitle>
        <CardDescription>
          Your event and registration pages in your colours. Leave both blank
          for the app&apos;s own.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(save)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("accent", "Accent", "Buttons and highlights.")}
            {field("background", "Background", "The page. Blank = white.")}
          </div>

          {theme && (
            <div
              className="rounded-lg border p-4"
              style={{
                background: theme.background,
                color: theme.ink,
                borderColor: theme.rule,
              }}
            >
              <p
                className="text-xs font-semibold tracking-wide uppercase"
                style={{ color: theme.accentText }}
              >
                Preview
              </p>
              <p className="font-display mt-1 text-lg font-semibold">
                Reverse Pairs Tournament
              </p>
              <div
                className="mt-3 rounded-md p-3 text-sm"
                style={{ background: theme.surface }}
              >
                Register your pair
                <span
                  className="mt-2 block w-fit rounded-md px-3 py-1.5 text-sm font-medium"
                  style={{ background: theme.accent, color: theme.accentInk }}
                >
                  Register
                </span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              Save colours
            </Button>
            {(initialAccent || initialBackground) && (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => save({ accent: "", background: "" })}
              >
                Use the app&apos;s colours
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
