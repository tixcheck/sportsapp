import { describe, expect, it } from "vitest";

import {
  buildImagePath,
  checkImageFile,
  formatBytes,
  isSafeImageUrl,
  MAX_IMAGE_BYTES,
  orgFromImagePath,
} from "@/lib/uploads/image";

const ORG = "88f8af92-7249-4195-b3ef-e7ba9474f10b";

describe("checkImageFile", () => {
  it("accepts the three raster formats", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(checkImageFile({ type, size: 1000 }).ok).toBe(true);
    }
  });

  it("refuses SVG, and says why in words an organizer can act on", () => {
    // An SVG is a document that can carry <script>. It would be served from
    // Supabase's origin rather than ours, but it would still be a script we
    // hosted and handed to a player.
    const r = checkImageFile({ type: "image/svg+xml", size: 500 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/save it as a png/i);
  });

  it("refuses things that are not images at all", () => {
    for (const type of [
      "application/pdf",
      "text/html",
      "application/octet-stream",
      "",
    ]) {
      expect(checkImageFile({ type, size: 500 }).ok).toBe(false);
    }
  });

  it("is not fooled by casing or padding on the content type", () => {
    expect(checkImageFile({ type: "  IMAGE/PNG ", size: 10 }).ok).toBe(true);
  });

  it("reports the type problem before the size problem", () => {
    // Someone uploading a 30 MB PDF should be told it is the wrong kind of
    // file, not sent away to shrink it first.
    const r = checkImageFile({ type: "application/pdf", size: 30_000_000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).not.toMatch(/limit/i);
  });

  it("refuses an empty file", () => {
    expect(checkImageFile({ type: "image/png", size: 0 }).ok).toBe(false);
  });

  it("allows exactly the limit and refuses one byte more", () => {
    expect(
      checkImageFile({ type: "image/png", size: MAX_IMAGE_BYTES }).ok,
    ).toBe(true);
    const over = checkImageFile({
      type: "image/png",
      size: MAX_IMAGE_BYTES + 1,
    });
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toMatch(/5\.0 MB/);
  });
});

describe("buildImagePath", () => {
  it("puts the org id first, which is what the storage policy reads", () => {
    const p = buildImagePath({
      orgId: ORG,
      purpose: "banner",
      type: "image/png",
      randomId: "abc123def456",
    });
    expect(p.startsWith(`${ORG}/`)).toBe(true);
    expect(p.endsWith(".png")).toBe(true);
  });

  it("takes the extension from the content type, not a claimed filename", () => {
    expect(
      buildImagePath({
        orgId: ORG,
        purpose: "logo",
        type: "image/jpeg",
        randomId: "abc123def456",
      }),
    ).toMatch(/\.jpg$/);
  });

  it("refuses an org id that is not a UUID", () => {
    // The policy authorises writes by reading this segment back. If it could be
    // influenced, it could be talked into authorising someone else's folder.
    for (const bad of ["../../etc", "not-a-uuid", "", "*", `${ORG}/../other`]) {
      expect(() =>
        buildImagePath({
          orgId: bad,
          purpose: "banner",
          type: "image/png",
          randomId: "abc123def456",
        }),
      ).toThrow(/UUID/);
    }
  });

  it("strips anything path-like out of the random id", () => {
    const p = buildImagePath({
      orgId: ORG,
      purpose: "banner",
      type: "image/png",
      randomId: "../../../etc/passwd-aaaaaaaa",
    });
    expect(p.split("/")).toHaveLength(2);
    expect(p).not.toContain("..");
  });

  it("refuses a random id too short to be unique", () => {
    expect(() =>
      buildImagePath({
        orgId: ORG,
        purpose: "banner",
        type: "image/png",
        randomId: "ab",
      }),
    ).toThrow(/short/);
  });

  it("produces a different path each time", () => {
    const a = buildImagePath({
      orgId: ORG,
      purpose: "banner",
      type: "image/png",
      randomId: "aaaaaaaaaa",
    });
    const b = buildImagePath({
      orgId: ORG,
      purpose: "banner",
      type: "image/png",
      randomId: "bbbbbbbbbb",
    });
    expect(a).not.toBe(b);
  });
});

describe("orgFromImagePath", () => {
  it("reads back what buildImagePath wrote", () => {
    const p = buildImagePath({
      orgId: ORG,
      purpose: "banner",
      type: "image/webp",
      randomId: "abc123def456",
    });
    expect(orgFromImagePath(p)).toBe(ORG.toLowerCase());
  });

  it("returns null rather than guessing at a junk path", () => {
    for (const bad of ["", "banner.png", "../x/y.png", "not-a-uuid/x.png"]) {
      expect(orgFromImagePath(bad)).toBeNull();
    }
  });
});

describe("isSafeImageUrl", () => {
  it("accepts ordinary http(s) links", () => {
    expect(isSafeImageUrl("https://cdn.example.com/a.png")).toBe(true);
    expect(isSafeImageUrl("http://example.com/a.jpg")).toBe(true);
  });

  it("rejects schemes that execute", () => {
    // `new URL()` parses these happily, which is the trap.
    for (const bad of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ]) {
      expect(isSafeImageUrl(bad)).toBe(false);
    }
  });

  it("rejects credentials in the authority", () => {
    // Reads as trustworthy at a glance; isn't.
    expect(isSafeImageUrl("https://evil@real-cdn.com/a.png")).toBe(false);
    expect(isSafeImageUrl("https://u:p@real-cdn.com/a.png")).toBe(false);
  });

  it("rejects empty and unparseable input", () => {
    for (const bad of ["", "   ", "not a url", "//example.com/a.png"]) {
      expect(isSafeImageUrl(bad)).toBe(false);
    }
  });
});

describe("formatBytes", () => {
  it("reads the way a person would say it", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  });
});
