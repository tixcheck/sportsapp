"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { LifeBuoy, Send, X } from "lucide-react";

import {
  loadSupportChatAction,
  markSupportReadAction,
  requestHumanAction,
  sendSupportMessageAction,
} from "@/server/actions/support";
import type { SupportChat } from "@/lib/queries/support";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** Fired by the account menu's "Help & contact" to open this window. */
export const OPEN_SUPPORT_EVENT = "open-support";

const schema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Type a message.")
    .max(4000, "Keep it under 4,000 characters."),
});
type Values = z.infer<typeof schema>;

const STARTERS = [
  "How do I change my email?",
  "How do I know my waiver is signed?",
  "Where is my schedule?",
];

const WHO: Record<string, string> = {
  ai: "Assistant",
  admin: "MySportsApp team",
};

/**
 * The Help window (0177): a button at the bottom right of every signed-in
 * page. The assistant answers first; "Talk to a person" (or the assistant
 * itself) hands the conversation to the platform admin, whose replies land
 * here — a dot on the button says when one has.
 */
export function SupportChat() {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState<SupportChat | null>(null);
  const [sending, startSend] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { body: "" },
  });

  const refresh = useCallback(async () => {
    setChat(await loadSupportChatAction());
  }, []);

  // Once per page load, for the unread dot.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SUPPORT_EVENT, show);
    return () => window.removeEventListener(OPEN_SUPPORT_EVENT, show);
  }, []);

  // While open and a person is involved, look for their reply.
  useEffect(() => {
    if (!open || (chat?.status !== "waiting" && chat?.status !== "answered"))
      return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [open, chat?.status, refresh]);

  useEffect(() => {
    if (open && chat?.threadId && chat.userUnread) {
      void markSupportReadAction(chat.threadId);
      setChat({ ...chat, userUnread: false });
    }
  }, [open, chat]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat?.messages.length, open, sending]);

  function send(values: Values) {
    startSend(async () => {
      const res = await sendSupportMessageAction(values.body);
      if ("error" in res) {
        form.setError("body", { message: res.error });
        return;
      }
      form.reset({ body: "" });
      setChat(res);
    });
  }

  function askForPerson() {
    startSend(async () => {
      const res = await requestHumanAction();
      if (!("error" in res)) setChat(res);
    });
  }

  const messages = chat?.messages ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="bg-claret fixed right-4 bottom-4 z-50 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
        aria-label={open ? "Close help" : "Open help"}
      >
        {open ? <X className="size-4" /> : <LifeBuoy className="size-4" />}
        Help
        {chat?.userUnread && !open && (
          <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-white bg-amber-400" />
        )}
      </button>

      {open && (
        <section
          aria-label="Help chat"
          className="bg-card border-border fixed inset-x-2 bottom-16 z-50 flex max-h-[75svh] flex-col rounded-xl border shadow-2xl sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <header className="border-border flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="font-semibold">Help</p>
              <p className="text-muted-foreground text-xs">
                {chat?.status === "waiting" || chat?.status === "answered"
                  ? "A person from MySportsApp will reply here."
                  : "Our assistant answers first; a person can take over."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close help"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </header>

          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm"
          >
            {messages.length === 0 ? (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  Ask anything about using the app. For schedules, divisions or
                  refunds, your league organizer decides — we&apos;ll point you
                  the right way.
                </p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={sending}
                      onClick={() => send({ body: q })}
                      className="border-border hover:bg-muted rounded-full border px-3 py-1 text-xs"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap",
                    m.author === "user"
                      ? "bg-claret ml-auto text-white"
                      : "bg-muted",
                  )}
                >
                  {m.author !== "user" && (
                    <p className="text-muted-foreground mb-0.5 text-[10px] font-semibold tracking-wide uppercase">
                      {WHO[m.author]}
                    </p>
                  )}
                  {m.body}
                </div>
              ))
            )}
            {sending && (
              <p className="text-muted-foreground text-xs">Thinking…</p>
            )}
          </div>

          <div className="border-border space-y-2 border-t px-3 py-3">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(send)}
                className="flex items-end gap-2"
              >
                <FormField
                  control={form.control}
                  name="body"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <textarea
                          {...field}
                          rows={2}
                          placeholder="Type your question…"
                          className="border-input bg-background focus-visible:ring-ring/50 w-full resize-none rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              void form.handleSubmit(send)();
                            }
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={sending}
                  aria-label="Send"
                >
                  <Send className="size-4" />
                </Button>
              </form>
            </Form>
            {chat?.status !== "waiting" && chat?.status !== "answered" && (
              <button
                type="button"
                disabled={sending}
                onClick={askForPerson}
                className="text-muted-foreground text-xs underline underline-offset-2"
              >
                Talk to a person instead
              </button>
            )}
          </div>
        </section>
      )}
    </>
  );
}
