"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthUser, useMyArenas, usePlayers } from "@/hooks";
import { arenaInviteUrl, formatGlory } from "@/format";
import { rankPlayers } from "@/lib/glory";
import TabBar from "../TabBar";
import ShareButton from "../ShareButton";
import NewArenaForm from "../NewArenaForm";
import Avatar from "../ui/Avatar";

export default function LeaderboardPage() {
  const router = useRouter();
  const { authUser, loading } = useAuthUser();
  const players = usePlayers(!!authUser);
  const arenas = useMyArenas(authUser?.uid ?? null);
  const [arenaId, setArenaId] = useState("");
  const [makingArena, setMakingArena] = useState(false);

  // this page is only for signed in players
  useEffect(() => {
    if (!loading && !authUser) router.replace("/");
  }, [loading, authUser, router]);

  if (!authUser) return <main><p>Loading...</p></main>;

  // the arena you picked, or your first one until you pick
  const arena = arenas.find((a) => a.id === arenaId) ?? arenas[0];

  // glory and records belong to the person, so this just ranks the arena's members
  const members = players.filter((p) => arena?.memberIds.includes(p.uid));
  const { ranked, notPlayed } = rankPlayers(members);
  const me = ranked.find((r) => r.user.uid === authUser.uid);
  const iHaventPlayed = notPlayed.some((u) => u.uid === authUser.uid);

  return (
    <main className="with-tabs">
      <h1>Leaderboard</h1>

      {arenas.length > 0 && (
        <div className="arena-switcher">
          <select value={arena?.id ?? ""} onChange={(e) => setArenaId(e.target.value)} aria-label="Arena">
            {arenas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          {arena && (
            <p className="muted">
              {arena.memberIds.length} {arena.memberIds.length === 1 ? "person" : "people"} · all time
            </p>
          )}
        </div>
      )}

      {arena && (
        <ShareButton
          url={arenaInviteUrl(window.location.origin, arena.inviteCode)}
          text={`Join ${arena.name} on Colosseum`}
          label="Invite people"
        />
      )}

      {arena && <p className="muted">Ranked by Glory and how often you&apos;re right.</p>}

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
            <Avatar face={{ uid: r.user.uid, name: r.user.displayName, photoURL: r.user.photoURL }} />
            <div className="row-main">
              <p className="row-name">{r.user.displayName}</p>
              <p className="row-meta">
                {r.user.wins} of {r.user.calls} right
              </p>
            </div>
            {/* the score decides the order, but we show glory since that's what people know */}
            <div className="row-glory">
              <span className="row-score glory">{formatGlory(r.user.glory)}</span>
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
                <Avatar face={{ uid: u.uid, name: u.displayName, photoURL: u.photoURL }} />
                <div className="row-main">
                  <p className="row-name">{u.displayName}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* make another arena (or your first one) */}
      <div className="new-arena">
        {arenas.length > 0 && !makingArena ? (
          <button type="button" className="link-button" onClick={() => setMakingArena(true)}>
            + New arena
          </button>
        ) : (
          <NewArenaForm
            onMade={(id) => {
              setArenaId(id);
              setMakingArena(false);
            }}
          />
        )}
      </div>

      <TabBar />
    </main>
  );
}
