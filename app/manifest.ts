import type { MetadataRoute } from "next";

// PWA manifest. Icons live in /public (icon-192.png, icon-512.png); the
// favicon is app/icon.png (auto-wired by Next). Ink & Paper colors.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MySportsApp — volleyball leagues & tournaments",
    short_name: "MySportsApp",
    description:
      "Run free volleyball leagues and tournaments, and follow schedules, standings, and scores.",
    start_url: "/",
    display: "standalone",
    background_color: "#F1E9D9",
    theme_color: "#8E2C3B",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
