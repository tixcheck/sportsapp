import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/support";

/** A one-line "where to get help" footer for signed-in and auth pages. */
export function HelpFooter() {
  return (
    <footer className="text-muted-foreground mx-auto max-w-5xl px-4 pb-8 text-center text-xs">
      Problem with the app? Email{" "}
      <a href={SUPPORT_MAILTO} className="underline underline-offset-2">
        {SUPPORT_EMAIL}
      </a>
      . For schedules, teams or payments, your league organizer can help too.
    </footer>
  );
}
