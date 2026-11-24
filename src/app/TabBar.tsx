"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
];

// the bar along the bottom of the screen on the main pages
export default function TabBar() {
  const path = usePathname();

  return (
    <nav className="tabbar">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} className={path === tab.href ? "tab on" : "tab"}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
