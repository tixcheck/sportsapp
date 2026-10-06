"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

import { recordOfflinePaymentAction } from "@/server/actions/organizer-payments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const METHODS = [
  { value: "cash", label: "Cash" },
  { value: "etransfer", label: "E-transfer" },
  { value: "paypal", label: "PayPal" },
  { value: "other", label: "Other" },
] as const;

const schema = z.object({
  method: z.enum(["cash", "etransfer", "paypal", "other"]),
  amount: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) > 0, {
      message: "Enter the amount received, like 80 or 40.00.",
    }),
  note: z.string().trim().max(280, "Keep the note under 280 characters."),
});
type Values = z.infer<typeof schema>;

/**
 * "Record payment" — money the organizer took outside the app (Helix: cash
 * at the door, e-transfers, "other means"). Organizer-only: the button lives
 * on the organizer's Payments tab, and the database refuses anyone else.
 *
 * The amount defaults to what's still owed, so the common case is: pick the
 * method, maybe add a note, save.
 */
export function RecordPaymentDialog({
  teamId,
  teamName,
  outstandingCents,
}: {
  teamId: string;
  teamName: string;
  outstandingCents: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      method: "cash",
      amount: (outstandingCents / 100).toFixed(2),
      note: "",
    },
  });
  const errors = form.formState.errors;

  function save(v: Values) {
    start(async () => {
      const res = await recordOfflinePaymentAction({
        teamId,
        method: v.method,
        amountCents: Math.round(Number(v.amount) * 100),
        note: v.note || undefined,
      });
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(
        res.covered
          ? `${teamName} is paid and in.`
          : "Payment recorded — part of the fee is still owing.",
      );
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Banknote className="size-3.5" />
          Record payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment for {teamName}</DialogTitle>
          <DialogDescription>
            Money you collected outside the app — cash, e-transfer, or anything
            else. Only organizers can do this.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(save)} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`rp-method-${teamId}`}>How they paid</Label>
              <NativeSelect
                id={`rp-method-${teamId}`}
                {...form.register("method")}
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`rp-amount-${teamId}`}>Amount received ($)</Label>
              <Input
                id={`rp-amount-${teamId}`}
                inputMode="decimal"
                aria-invalid={!!errors.amount}
                {...form.register("amount")}
              />
              {errors.amount && (
                <p className="text-destructive text-xs">
                  {errors.amount.message}
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`rp-note-${teamId}`}>Note (optional)</Label>
            <Input
              id={`rp-note-${teamId}`}
              placeholder="e.g. Cash at the door, e-transfer ref 1234"
              maxLength={280}
              aria-invalid={!!errors.note}
              {...form.register("note")}
            />
            {errors.note && (
              <p className="text-destructive text-xs">{errors.note.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
