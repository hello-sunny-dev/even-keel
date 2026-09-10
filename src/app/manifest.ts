import type { MetadataRoute } from "next";

/**
 * Installable on a phone, which is where this is actually read.
 *
 * `display: standalone` is the point: opened from the home screen it has no
 * address bar, so the bottom tab bar is the whole navigation and there is no
 * URL on screen for someone glancing over a shoulder.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Even Keel",
    short_name: "Even Keel",
    description: "Net worth for two.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#e8eae5",
    theme_color: "#e8eae5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
