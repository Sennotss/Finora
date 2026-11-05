import type { MetadataRoute } from "next";

/**
 * Web app manifest: lets phones install Finora to the home screen and open it
 * full-screen (no browser bar). Requires the site to be served over HTTPS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Finora",
    short_name: "Finora",
    description: "Personal finance intelligence — track, understand and plan your money.",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f7f5",
    theme_color: "#1c5cab",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
