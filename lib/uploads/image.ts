/**
 * Rules for organizer-uploaded images. Pure: no DB, no network, no browser.
 *
 * These images end up in an `<img src>` on a page open to the public internet,
 * so the interesting decisions here are all refusals.
 *
 * **No SVG.** An SVG is a document, not a picture — it can carry `<script>` and
 * event handlers. Supabase serves uploads from its own origin so it would not
 * be same-origin XSS against the app, but it would still be a script we hosted
 * and handed to a player, and an organizer account is not a hard thing to get.
 * PNG, JPEG and WebP only.
 *
 * **The stored filename is never the uploaded one.** A name arriving from a
 * browser can contain path separators, traversal, control characters, or 300
 * unicode characters chosen to break something downstream. The extension is
 * taken from the allow-list — matched to the CONTENT TYPE, not to whatever the
 * name claimed — and the rest is a random id.
 *
 * The size and type limits are enforced again by the bucket itself (0087), so
 * a caller skipping these functions still cannot store a 40 MB executable.
 */

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

/** Extension per content type. Never derived from the uploaded filename. */
const EXTENSION: Record<AllowedImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** 5 MB. A banner is decoration; nobody needs more, and every byte is served
 *  to every visitor of a public page. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const IMAGE_ACCEPT_ATTRIBUTE = ALLOWED_IMAGE_TYPES.join(",");

export type ImageCheck =
  | { ok: true; type: AllowedImageType }
  | { ok: false; error: string };

/** Human-readable size, for error copy an organizer can act on. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowed(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/**
 * Is this file allowed?
 *
 * Type is checked before size so someone uploading a 30 MB PDF is told the real
 * problem rather than being sent away to shrink it.
 */
export function checkImageFile(file: {
  type: string;
  size: number;
}): ImageCheck {
  const type = file.type.toLowerCase().trim();

  if (!isAllowed(type)) {
    return {
      ok: false,
      error:
        type === "image/svg+xml"
          ? "SVG files can't be uploaded. Save it as a PNG and try again."
          : "That needs to be a PNG, JPEG or WebP image.",
    };
  }
  if (file.size <= 0) {
    return { ok: false, error: "That file looks empty." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: `That image is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_IMAGE_BYTES)}.`,
    };
  }
  return { ok: true, type };
}

/** Matches a canonical UUID. Anything else must not become a storage folder. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where an upload is stored: `<orgId>/<purpose>-<random>.<ext>`.
 *
 * The FIRST segment is the org id and nothing else, because the storage policy
 * reads it back to decide whether the caller may write here. If that segment
 * could be influenced, the policy could be talked into authorising a write into
 * another organization's folder — so a non-UUID org id is refused outright
 * rather than sanitised into something plausible.
 */
export function buildImagePath(input: {
  orgId: string;
  purpose: "banner" | "logo";
  type: AllowedImageType;
  /** Injected so this stays pure and testable. */
  randomId: string;
}): string {
  if (!UUID.test(input.orgId)) {
    throw new Error("buildImagePath: orgId must be a UUID.");
  }
  const id = input.randomId.replace(/[^a-z0-9]/gi, "").slice(0, 32);
  if (id.length < 8) {
    throw new Error("buildImagePath: randomId is too short to be unique.");
  }
  return `${input.orgId.toLowerCase()}/${input.purpose}-${id}.${EXTENSION[input.type]}`;
}

/** The org folder an object path belongs to, or null. Mirrors the SQL policy. */
export function orgFromImagePath(path: string): string | null {
  const first = path.split("/")[0] ?? "";
  return UUID.test(first) ? first.toLowerCase() : null;
}

/**
 * Is this a URL we are willing to render in an `<img src>` on a public page?
 *
 * Deliberately not "is it a valid URL": `javascript:` parses fine. Only http
 * and https, and no credentials in the authority — a URL like
 * `https://evil@host/x` reads as trustworthy at a glance and isn't.
 */
export function isSafeImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return false;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username !== "" || url.password !== "") return false;
  return true;
}
