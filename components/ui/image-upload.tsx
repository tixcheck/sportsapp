"use client";

import { useRef, useState } from "react";
import { ImageUp, Loader2, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { createImageUploadUrlAction } from "@/server/actions/uploads";
import {
  checkImageFile,
  IMAGE_ACCEPT_ATTRIBUTE,
  isSafeImageUrl,
  MAX_IMAGE_BYTES,
  formatBytes,
} from "@/lib/uploads/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const BUCKET = "event-images";

/**
 * Pick an image, or paste a link to one.
 *
 * Two steps: a Server Action authorises the upload and returns a one-shot
 * signed URL, then the file goes from the browser straight to Supabase Storage.
 * The bytes never pass through our server (5 MB would exceed the Server Action
 * body limit), but the authorization does — which matters, because the browser
 * Supabase client is not otherwise used anywhere in this app and cannot be
 * assumed to carry a session.
 *
 * Pasting a URL stays supported. Some organizers already host their artwork,
 * and taking that away to add uploads would be a downgrade for them.
 */
/**
 * Turn whatever Storage said into something an organizer can act on.
 *
 * Every branch here is a real refusal with a different fix: a session that
 * expired needs a sign-in, a rejected file needs a different file, and a
 * network failure needs a retry. Telling all three to "try again" is only
 * correct for the last one.
 */
function uploadErrorMessage(err: unknown): string {
  const raw =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : String(err ?? "");
  const m = raw.toLowerCase();

  if (m.includes("row-level security") || m.includes("unauthorized")) {
    return "You don't have permission to upload for this organization — or your sign-in expired. Reload the page and try again.";
  }
  if (m.includes("jwt") || m.includes("expired") || m.includes("token")) {
    return "Your sign-in expired while the file was uploading. Reload the page and try again.";
  }
  if (m.includes("mime") || m.includes("content type")) {
    return "That file isn't a PNG, JPEG or WebP, whatever its name says. Re-export it and try again.";
  }
  if (m.includes("payload") || m.includes("too large") || m.includes("413")) {
    return "That image is over 5 MB. Save it smaller and try again.";
  }
  if (m.includes("already exists")) {
    return "That upload was already used. Pick the file again.";
  }
  if (m.includes("failed to fetch") || m.includes("network")) {
    return "The upload couldn't reach the server. Check your connection and try again.";
  }
  return raw
    ? `That upload didn't go through: ${raw}`
    : "That upload didn't go through. Please try again.";
}

export function ImageUpload({
  orgId,
  purpose,
  value,
  onChange,
  disabled,
  aspectHint,
}: {
  orgId: string;
  purpose: "banner" | "logo";
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  /** e.g. "about 3:1 sits best" — shown under the control. */
  aspectHint?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  async function upload(file: File) {
    setError(null);

    // Checked here for a good message; the bucket enforces both again, so a
    // caller that skipped this still can't store a 40 MB executable.
    const check = checkImageFile({ type: file.type, size: file.size });
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setBusy(true);
    try {
      // The server decides the path and whether this is allowed at all.
      const ticket = await createImageUploadUrlAction({
        orgId,
        purpose,
        contentType: check.type,
      });
      if ("error" in ticket) {
        setError(ticket.error);
        return;
      }

      const supabase = createClient();
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(ticket.path, ticket.token, file, {
          contentType: check.type,
        });

      if (upErr) {
        setError(uploadErrorMessage(upErr));
        // The mapped sentence is for the organizer; this is for whoever has to
        // work out why. Throwing the only description of the failure away —
        // which this did — left "please try again" as the entire diagnosis of
        // a step with half a dozen distinct causes.
        console.error("[upload] storage rejected the file", upErr);
        return;
      }

      setBroken(false);
      onChange(ticket.publicUrl);
    } catch (e) {
      setError(uploadErrorMessage(e));
      console.error("[upload] failed before storage answered", e);
    } finally {
      setBusy(false);
      // Let the same file be chosen again after a failure.
      if (input.current) input.current.value = "";
    }
  }

  const showPreview = value !== "" && isSafeImageUrl(value) && !broken;

  return (
    <div className="flex flex-col gap-3">
      {showPreview && (
        <div className="border-rule bg-paper-sunken overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary
              organizer-supplied host; next/image would need every domain
              allow-listed in next.config. */}
          <img
            src={value}
            alt=""
            onError={() => setBroken(true)}
            // Matches how the public page renders it, so the preview is a
            // preview rather than a second opinion.
            className={cn(
              "mx-auto w-auto max-w-full object-contain",
              purpose === "banner" ? "max-h-44" : "max-h-28 p-3",
            )}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept={IMAGE_ACCEPT_ATTRIBUTE}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImageUp className="size-4" />
          )}
          {busy ? "Uploading…" : value ? "Replace image" : "Upload an image"}
        </Button>

        {value !== "" && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || busy}
            onClick={() => {
              setBroken(false);
              setError(null);
              onChange("");
            }}
          >
            <Trash2 className="size-4" />
            Remove
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Input
          value={value}
          disabled={disabled || busy}
          placeholder="…or paste a link to an image you already host"
          aria-label="Image link"
          onChange={(e) => {
            setBroken(false);
            setError(null);
            onChange(e.target.value);
          }}
        />
        <p className="text-ink-3 text-xs">
          PNG, JPEG or WebP, up to {formatBytes(MAX_IMAGE_BYTES)}.
          {aspectHint ? ` ${aspectHint}` : ""}
        </p>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {broken && !error && (
        <p className="text-ink-3 text-sm">
          That link didn&apos;t load as an image. It will still be saved, but
          check it before you publish.
        </p>
      )}
    </div>
  );
}
