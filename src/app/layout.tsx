import type { Metadata, Viewport } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

// next/font downloads these at build time, no extra library needed
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Colosseum",
  description: "A scoreboard for your own group's calls.",
  // on iPhones, "Add to Home Screen" opens it full screen with this name.
  // the manifest (manifest.ts) and the icons (icon.png, apple-icon.png) get picked up by Next on their own
  appleWebApp: { capable: true, title: "Colosseum", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#73000A",
  // lets the tab bar sit above the iPhone home bar (it uses env(safe-area-inset-bottom))
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${anton.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
