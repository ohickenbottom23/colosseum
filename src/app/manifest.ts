import type { MetadataRoute } from "next";

// what phones use when you add Colosseum to your home screen: the name under the icon,
// the icons, and opening full screen like an app instead of in a browser tab
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Colosseum",
    short_name: "Colosseum",
    description: "Make calls about your friends. Get proven right.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#73000A",
    theme_color: "#73000A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // android crops these into a circle or squircle, so the C sits further in
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
