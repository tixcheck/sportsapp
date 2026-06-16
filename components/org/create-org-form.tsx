"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { createOrganizationAction } from "@/server/actions/orgs";
import { createOrgSchema, type CreateOrgInput } from "@/lib/validations/org";
import { slugify } from "@/lib/utils/slug";
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

export function CreateOrgForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<CreateOrgInput>({
    resolver: zodResolver(createOrgSchema),
    defaultValues: { name: "" },
  });

  const name = form.watch("name");
  const previewSlug = name.trim() ? slugify(name) : "your-org";

  function onSubmit(values: CreateOrgInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await createOrganizationAction(values);
      if (result?.error) setFormError(result.error);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Organization name</FormLabel>
              <FormControl>
                <Input placeholder="Toronto Volleyball Collective" {...field} />
              </FormControl>
              <FormDescription>
                Public URL: <span className="font-mono">/{previewSlug}</span>
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError && <p className="text-destructive text-sm">{formError}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create organization"}
        </Button>
      </form>
    </Form>
  );
}
