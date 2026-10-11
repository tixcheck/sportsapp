"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { seatAlignmentTiersAction } from "@/server/actions/alignment";
import {
  parseTierSizes,
  seatTiersFormSchema,
  type SeatTiersFormInput,
} from "@/lib/validations/alignment";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/** Seat Round 1's tiers from the night's ranking, in the sizes the organizer gives. */
export function SeatTiersForm({
  competitionId,
  teamCount,
  defaultSizes,
}: {
  competitionId: string;
  teamCount: number;
  defaultSizes: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<SeatTiersFormInput>({
    resolver: zodResolver(seatTiersFormSchema),
    defaultValues: { sizes: defaultSizes },
  });
  const total = parseTierSizes(form.watch("sizes")).reduce(
    (a, b) => a + (Number.isFinite(b) ? b : 0),
    0,
  );

  function onSubmit(values: SeatTiersFormInput) {
    setFormError(null);
    start(async () => {
      const res = await seatAlignmentTiersAction({
        competitionId,
        sizes: parseTierSizes(values.sizes),
      });
      if ("error" in res) {
        setFormError(res.error);
        return;
      }
      toast.success(`${teamCount} teams seated into ${res.tiers} tiers.`);
      router.refresh();
    });
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <FormField
          control={form.control}
          name="sizes"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Round 1 tier sizes</FormLabel>
              <FormControl>
                <Input inputMode="numeric" {...field} />
              </FormControl>
              <FormDescription>
                Top tier first. {total} of {teamCount} teams placed.
              </FormDescription>
              <FormMessage />
              {formError && (
                <p className="text-destructive text-sm">{formError}</p>
              )}
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending || total !== teamCount}>
          {pending ? "Seating…" : "Seat Round 1 tiers"}
        </Button>
      </form>
    </Form>
  );
}
