import type { NextConfig } from "next";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";

const nextConfig: NextConfig = {
  // sign-in on phones is a redirect, and browsers block it unless the auth domain is the
  // app's own domain. so the app passes Firebase's sign-in pages (/__/auth/...) through from
  // its own domain, and NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN gets set to that domain.
  // the emulators (a "demo-" project) handle sign-in themselves, so it's off for them
  async rewrites() {
    if (!projectId || projectId.startsWith("demo-")) return [];
    return [
      {
        source: "/__/auth/:path*",
        destination: `https://${projectId}.firebaseapp.com/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
