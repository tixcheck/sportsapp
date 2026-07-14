import { notFound } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";

import { createClient } from "@/lib/supabase/server";
import { competitionPath } from "@/lib/queries/dashboard";
import { getOrigin } from "@/lib/utils/url";
import { PrintButton } from "@/components/schedule/print-button";

export const metadata = { title: "QR poster" };

/**
 * A print-ready poster: the event name and a big QR that opens its public page
 * (schedule + live scores). Stick it up at the venue so players scan straight
 * to the standings.
 */
export default async function QrPosterPage({
  params,
}: {
  params: Promise<{ competitionId: string }>;
}) {
  const { competitionId } = await params;
  const supabase = await createClient();
  const { data: comp } = await supabase
    .from("competitions")
    .select("name, type, slug, venue, visibility")
    .eq("id", competitionId)
    .single();
  if (!comp) notFound();

  const origin = await getOrigin();
  const url = `${origin}${competitionPath(comp.type, comp.slug)}`;
  const isPublic = comp.visibility === "public";

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center bg-white px-6 py-10 text-center text-black print:py-4">
      <div className="mb-8 flex w-full items-center justify-end print:hidden">
        <PrintButton />
      </div>

      <h1 className="font-display text-4xl font-bold">{comp.name}</h1>
      {comp.venue && (
        <p className="mt-1 text-lg text-neutral-600">{comp.venue}</p>
      )}
      <p className="mt-6 text-xl font-semibold">
        Scan for schedule &amp; scores
      </p>

      <div className="mt-6 rounded-2xl border-4 border-black p-6">
        <QRCodeSVG value={url} size={320} level="M" marginSize={2} />
      </div>

      <p className="mt-6 text-base break-all text-neutral-700">{url}</p>

      {!isPublic && (
        <p className="mt-6 max-w-md text-sm text-neutral-500 print:hidden">
          Heads up: this event isn&apos;t published yet, so the link won&apos;t
          work until you publish it (or open registration for a tournament).
        </p>
      )}
    </main>
  );
}
