"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import {
  adminReplyAction,
  closeSupportThreadAction,
} from "@/server/actions/support";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Type a reply.")
    .max(4000, "Keep it under 4,000 characters."),
});
type Values = z.infer<typeof schema>;

/** The admin's reply box and Close button on a support conversation. */
export function AdminSupportReply({
  threadId,
  closed,
}: {
  threadId: string;
  closed: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { body: "" },
  });

  function reply(values: Values) {
    start(async () => {
      const res = await adminReplyAction(threadId, values.body);
      if ("error" in res) {
        form.setError("body", { message: res.error });
        return;
      }
      form.reset({ body: "" });
      toast.success("Sent. They'll get it by email and in their Help window.");
      router.refresh();
    });
  }

  function close() {
    start(async () => {
      const res = await closeSupportThreadAction(threadId);
      if ("error" in res) toast.error(res.error);
      else router.push("/admin/support");
    });
  }

  if (closed) {
    return (
      <p className="text-muted-foreground text-sm">
        This conversation is closed. If they write again, it starts a new one.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(reply)} className="space-y-3">
        <FormField
          control={form.control}
          name="body"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Your reply</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  rows={4}
                  className="border-input bg-background focus-visible:ring-ring/50 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Sending…" : "Send reply"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={close}
          >
            Close conversation
          </Button>
        </div>
      </form>
    </Form>
  );
}
