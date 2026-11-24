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

  const { ranked, notPlayed } = rankPlayers(players);
  const me = ranked.find((r) => r.user.uid === authUser.uid);
  const iHaventPlayed = notPlayed.some((u) => u.uid === authUser.uid);

  return (
    <main className="with-tabs">
      <h1>Leaderboard</h1>
      <p className="muted">Ranked by Glory and how often you&apos;re right.</p>

      {me && (
        <p className="banner">
          You&apos;re #{me.rank} of {ranked.length}
        </p>
      )}
      {iHaventPlayed && <p className="banner">You&apos;ll show up once a call you picked a side on is settled</p>}

      <ol className="board">
        {ranked.map((r) => (
          <li key={r.user.uid} className={r.user.uid === authUser.uid ? "row me" : "row"}>
            <span className="row-rank">{r.rank}</span>
            <div className="row-main">
              <p className="row-name">{r.user.displayName}</p>
              <p className="row-meta">
                {r.user.wins} of {r.user.calls} right
              </p>
            </div>
            {/* the score decides the order, but we show glory since that's what people know */}
            <div className="row-glory">
              <span className="row-score">{formatGlory(r.user.glory)}</span>
              <span className="row-glory-label">Glory</span>
            </div>
          </li>
        ))}
      </ol>

      {notPlayed.length > 0 && (
        <>
          <h2>Hasn&apos;t played yet</h2>
          <ul className="board">
            {notPlayed.map((u) => (
              <li key={u.uid} className={u.uid === authUser.uid ? "row me" : "row"}>
                <div className="row-main">
                  <p className="row-name">{u.displayName}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <TabBar />
    </main>
  );
}
