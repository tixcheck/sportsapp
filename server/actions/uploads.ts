"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  ALLOWED_IMAGE_TYPES,
  buildImagePath,
  type AllowedImageType,
} from "@/lib/uploads/image";

type ActionError = { error: string };

const BUCKET = "event-images";

const schema = z.object({
  orgId: z.string().uuid(),
  purpose: z.enum(["banner", "logo"]),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
});

export type UploadTicket = {
  /** Where the file will live. Chosen here; the browser never picks it. */
  path: string;
  /** Single-use token for `uploadToSignedUrl`. */
  token: string;
  /** Where the file will be readable once uploaded. */
  publicUrl: string;
};

/**
 * Hand the browser a one-shot ticket to upload one image.
 *
 * The first version of this had the browser talk to Storage directly with its
 * own Supabase session. That failed with a permission error, and the reason is
 * instructive: nothing else in this codebase has ever used the browser client,
 * so whether it carries a session was an untested assumption. Server-side auth
 * demonstrably works — every other action depends on it — so the authorization
 * happens here instead, and the browser gets a token that needs no session.
 *
 * Two things improve as a side effect:
 *
 *   The PATH is built here. Previously the browser composed it and the storage
 *   policy re-derived the org from the first segment; that was sound but it
 *   meant trusting a client-supplied string and checking it afterwards. Now the
 *   client cannot express a path at all.
 *
 *   The failure is legible. A signed-URL request that is refused says so here,
 *   where it can be logged, rather than surfacing as an opaque RLS denial in
 *   somebody's browser.
 *
 * RLS still applies — the signed URL is minted through the user's own client,
 * so `event_images_insert` is evaluated exactly as before. This moves where the
 * check runs, not whether it runs.
 */
export async function createImageUploadUrlAction(
  input: z.input<typeof schema>,
): Promise<ActionError | UploadTicket> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { error: "That file type can't be uploaded." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." };

  // Defence in depth: the storage policy checks this too.
  const { data: isAdmin } = await supabase.rpc("is_org_admin", {
    _org_id: parsed.data.orgId,
  });
  if (isAdmin !== true) {
    return { error: "Only an organization admin can upload images." };
  }

  const path = buildImagePath({
    orgId: parsed.data.orgId,
    purpose: parsed.data.purpose,
    type: parsed.data.contentType as AllowedImageType,
    randomId: crypto.randomUUID().replace(/-/g, ""),
  });

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("[uploads] signed url failed", error?.message ?? "no data");
    return { error: "Couldn't start the upload. Please try again." };
  }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

  return { path: data.path, token: data.token, publicUrl: pub.publicUrl };
}
