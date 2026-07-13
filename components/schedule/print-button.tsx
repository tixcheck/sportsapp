"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Opens the browser print dialog for the current (print-optimized) page. */
export function PrintButton() {
  return (
    <Button onClick={() => window.print()} size="sm">
      <Printer className="size-4" />
      Print
    </Button>
  );
}
