"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser, usePlayers } from "@/hooks";
import { formatGlory } from "@/format";
import { rankPlayers } from "@/lib/glory";
import TabBar from "../TabBar";

export default function LeaderboardPage() {
  const router = useRouter();
  const { authUser, loading } = useAuthUser();
  const players = usePlayers(!!authUser);

  // this page is only for signed in players
  useEffect(() => {
    if (!loading && !authUser) router.replace("/");
  }, [loading, authUser, router]);

  if (!authUser) return <main><p>Loading...</p></main>;

  const ranked = rankPlayers(players);
  const me = ranked.find((r) => r.user.uid === authUser.uid);

  return (
    <main className="with-tabs">
      <h1>Leaderboard</h1>
      <p className="muted">Glory, adjusted for how often you&apos;re right.</p>

      {me && (
        <p className="banner">
          You&apos;re #{me.rank} of {ranked.length}
        </p>
      )}

      <ol className="board">
        {ranked.map((r) => (
          <li key={r.user.uid} className={r.user.uid === authUser.uid ? "row me" : "row"}>
            <span className="row-rank">{r.rank}</span>
            <div className="row-main">
              <p className="row-name">{r.user.displayName}</p>
              <p className="row-meta">
                {formatGlory(r.user.glory)} Glory ·{" "}
                {r.user.calls === 0 ? "No calls yet" : `${r.user.wins} of ${r.user.calls} right`}
              </p>
            </div>
            <span className="row-score">{r.score}</span>
          </li>
        ))}
      </ol>

      <TabBar />
    </main>
  );
}
