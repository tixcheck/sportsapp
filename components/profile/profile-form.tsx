"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updateProfileAction } from "@/server/actions/profile";
import {
  updateProfileSchema,
  type UpdateProfileInput,
} from "@/lib/validations/org";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

export function ProfileForm({
  defaultValues,
  email,
}: {
  defaultValues: UpdateProfileInput;
  email: string;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues,
  });

  const watched = form.watch();
  const initials = (watched.displayName || email || "?")
    .trim()
    .slice(0, 2)
    .toUpperCase();

  function onSubmit(values: UpdateProfileInput) {
    startTransition(async () => {
      const result = await updateProfileAction(values);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Profile updated.");
        form.reset(values);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarImage src={watched.avatarUrl || undefined} alt="" />
            <AvatarFallback className="text-base">{initials}</AvatarFallback>
          </Avatar>
          <div className="text-sm text-slate-600">{email}</div>
        </div>

        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Display name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="avatarUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Avatar URL</FormLabel>
              <FormControl>
                <Input
                  placeholder="https://…"
                  {...field}
                  value={field.value ?? ""}
                />
              </FormControl>
              <FormDescription>
                Paste an image URL. Upload comes later.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div>
          <Button type="submit" disabled={pending || !form.formState.isDirty}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
