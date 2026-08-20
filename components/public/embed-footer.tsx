import Link from "next/link";

/**
 * A quiet way back to the real page.
 *
 * An embed is a fragment — no schedule tab, no standings, no team pages. A
 * player who wants more has nowhere to go unless the embed says where, and the
 * host site usually can't link there itself because it doesn't know the slug.
 */
export function EmbedFooter({ slug, label }: { slug: string; label: string }) {
  return (
    <p className="text-ink-3 mt-3 text-center text-[0.7rem]">
      <Link
        href={`/l/${slug}`}
        target="_blank"
        rel="noopener"
        className="hover:text-foreground underline underline-offset-2"
      >
        {label}
      </Link>
      <span className="mx-1.5">·</span>
      <Link
        href="/"
        target="_blank"
        rel="noopener"
        className="hover:text-foreground underline underline-offset-2"
      >
        MySportsApp
      </Link>
    </p>
  );
}
