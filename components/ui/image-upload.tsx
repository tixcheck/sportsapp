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
        setError("That upload didn't go through. Please try again.");
        return;
      }

      setBroken(false);
      onChange(ticket.publicUrl);
    } catch {
      setError("That upload didn't go through. Please try again.");
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
            className={cn(
              "w-full object-cover",
              purpose === "banner" ? "max-h-44" : "max-h-28 object-contain p-3",
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
