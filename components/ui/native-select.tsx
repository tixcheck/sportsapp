import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A native `<select>` styled to match `Input`.
 *
 * These were hand-styled at each call site, and drifted: `h-9 rounded-md px-3`
 * against the input's `h-8 rounded-lg px-2.5`. Side by side in a two-column
 * row that reads as a misalignment, because it is one — a four-pixel height
 * difference and a different corner radius on two controls the eye expects to
 * be a pair.
 *
 * Native rather than a custom listbox on purpose: on a phone this opens the
 * platform's own picker, which is the control people already know and the one
 * that behaves properly with a keyboard, a screen reader and autofill.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input focus-visible:border-ring focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        "dark:bg-input/30 h-8 w-full min-w-0 rounded-lg border bg-transparent",
        "px-2.5 py-1 text-base transition-colors outline-none",
        "focus-visible:ring-3 disabled:pointer-events-none",
        "disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
