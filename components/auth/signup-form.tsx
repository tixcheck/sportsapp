"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { signUpAction } from "@/server/actions/auth";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
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

export function SignupForm({ next }: { next?: string }) {
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { displayName: "", email: "", password: "" },
  });

  function onSubmit(values: SignupInput) {
    setFormError(null);
    startTransition(async () => {
      const result = await signUpAction(values, next);
      if (result?.error) setFormError(result.error);
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormDescription>At least 8 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        {formError && <p className="text-destructive text-sm">{formError}</p>}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </Form>
  );
}
