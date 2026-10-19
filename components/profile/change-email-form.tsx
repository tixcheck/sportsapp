"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { changeEmailAction } from "@/server/actions/auth";
import {
  changeEmailSchema,
  type ChangeEmailInput,
} from "@/lib/validations/auth";
import { OPEN_SUPPORT_EVENT } from "@/components/support/support-chat";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

/**
 * Change the account's email. The new address has to confirm before it takes
 * over; until then the old one keeps working, and `pendingEmail` (Supabase's
 * `new_email`) shows what's waiting.
 */
export function ChangeEmailForm({
  email,
  pendingEmail,
}: {
  email: string;
  pendingEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(pendingEmail);
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { email: "" },
  });

  function onSubmit(values: ChangeEmailInput) {
    startTransition(async () => {
      const result = await changeEmailAction(values);
      if ("error" in result) {
        form.setError("email", { message: result.error });
      } else {
        setSentTo(result.email);
        form.reset({ email: "" });
      }
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-sm">
        Signed in as <b>{email}</b>
      </p>
      {sentTo && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          We sent a confirmation link to <b>{sentTo}</b>. Open it to finish the
          change — until then, keep using {email}. If a second email arrives at
          your current address, approve that too.
        </p>
      )}
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"
        >
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Change email"}
          </Button>
        </form>
      </Form>
      <p className="text-muted-foreground text-xs">
        Can&apos;t get email at your current address (for example, it was
        mistyped)?{" "}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(OPEN_SUPPORT_EVENT))}
          className="underline underline-offset-2"
        >
          Open Help
        </button>{" "}
        and we&apos;ll move your account.
      </p>
    </div>
  );
}
