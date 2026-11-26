"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HomeIcon, PlusIcon, TrophyIcon } from "./ui/Icons";

// the bar along the bottom of the main pages: Home, a gold + to make a call, and Leaderboard.
// the + is the main button on these screens, so it's the gold one
export default function TabBar() {
  const path = usePathname();

  return (
    <nav className="tabbar">
      <Link href="/" className={path === "/" ? "tab on" : "tab"}>
        <HomeIcon />
        <span>Home</span>
      </Link>
      <Link href="/new" className="make-call" aria-label="Make a call">
        <PlusIcon />
      </Link>
      <Link href="/leaderboard" className={path === "/leaderboard" ? "tab on" : "tab"}>
        <TrophyIcon />
        <span>Leaderboard</span>
      </Link>
    </nav>
  );
}
