"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthUser, useMyArenas, usePlayers } from "@/hooks";
import { arenaInviteUrl, formatGlory } from "@/format";
import { rankPlayers, Ranked } from "@/lib/glory";
import { rankName, tierForGlory } from "@/lib/ranks";
import { User } from "@/lib/types";
import TabBar from "../TabBar";
import ShareButton from "../ShareButton";
import NewArenaForm from "../NewArenaForm";
import Avatar from "../ui/Avatar";
import AvatarStack from "../ui/AvatarStack";
import RankShield from "../ui/RankShield";

const NUMERALS = ["I", "II", "III", "IV", "V"];

// a player's rank (the server fills this in for older players, this covers the moment before)
const tierOf = (u: User) => u.rankTier ?? tierForGlory(u.glory);
const faceOfUser = (u: User) => ({ uid: u.uid, name: u.displayName, photoURL: u.photoURL });

// reading ?arena= needs a Suspense wrapper, or Next can't build this page ahead of time
export default function LeaderboardPage() {
  return (
    <Suspense fallback={<main><p>Loading...</p></main>}>
      <Leaderboard />
    </Suspense>
  );
}

function Leaderboard() {
  const router = useRouter();
  const { authUser, loading } = useAuthUser();
  const players = usePlayers(!!authUser);
  const arenas = useMyArenas(authUser?.uid ?? null);
  const [arenaId, setArenaId] = useState(useSearchParams().get("arena") ?? "");
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
  const podium = ranked.slice(0, 3);
  const rest = ranked.slice(3);
  const nameFor = (u: User) => (u.uid === authUser.uid ? "You" : u.displayName.split(" ")[0]);

  // the podium order on screen is 2nd, 1st, 3rd so 1st stands in the middle
  const podiumOrder = [podium[1], podium[0], podium[2]].filter(Boolean) as Ranked[];

  return (
    <main className="with-tabs">
      <h1>Leaderboard</h1>

      {arena && (
        <div className="arena-bar">
          <label className="arena-pill">
            <select value={arena.id} onChange={(e) => setArenaId(e.target.value)} aria-label="Arena">
              {arenas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <span className="muted">
            Arena · {arena.memberIds.length} {arena.memberIds.length === 1 ? "person" : "people"} · all time
          </span>
        </div>
      )}

      {podium.length > 0 && (
        <div className="podium">
          {podiumOrder.map((r) => (
            <div key={r.user.uid} className={`podium-spot place-${podium.indexOf(r) + 1}`}>
              <div className="podium-face">
                <Avatar face={faceOfUser(r.user)} size={podium.indexOf(r) === 0 ? 84 : 66} />
                <span className="podium-shield">
                  <RankShield tier={tierOf(r.user)} size={22} onTheLine={r.user.onTheLine} />
                </span>
              </div>
              <p className="podium-name">{nameFor(r.user)}</p>
              <p className="podium-glory">
                <span className="glory">{formatGlory(r.user.glory)}</span> ·{" "}
                {r.user.onTheLine ? "On the line" : rankName(tierOf(r.user))}
              </p>
              <div className="podium-block">{r.rank}</div>
            </div>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <ol className="board">
          {rest.map((r) => (
            <li key={r.user.uid} className={r.user.uid === authUser.uid ? "row me" : "row"}>
              <span className="row-rank">{r.rank}</span>
              <Avatar face={faceOfUser(r.user)} />
              <div className="row-main">
                <p className="row-name">{nameFor(r.user)}</p>
                <p className="row-meta">
                  {r.user.wins} of {r.user.calls} right
                </p>
              </div>
              {/* the score decides the order, but we show glory since that's what people know */}
              <div className="row-glory">
                <span className="row-score glory">{formatGlory(r.user.glory)}</span>
                <span className="row-glory-label">
                  {NUMERALS[tierOf(r.user) - 1]} · {rankName(tierOf(r.user))}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      {arena && ranked.length === 0 && (
        <p className="muted">Nobody&apos;s on the board yet. You show up once a call you picked a side on is settled.</p>
      )}

      {/* people who haven't played yet, and a nudge to make a call about them */}
      {arena && notPlayed.length > 0 && (
        <div className="not-played">
          <AvatarStack faces={notPlayed.map(faceOfUser)} size={34} max={3} />
          <p>
            <strong>{namesList(notPlayed.map(nameFor))}</strong> {notPlayed.length === 1 && nameFor(notPlayed[0]) !== "You" ? "hasn't" : "haven't"} played yet
          </p>
          {notPlayed.some((u) => u.uid !== authUser.uid) && (
            <Link
              href={`/new?arena=${arena.id}&about=${notPlayed.find((u) => u.uid !== authUser.uid)!.uid}`}
              className="call-out-link"
            >
              Call them out
            </Link>
          )}
        </div>
      )}

      {arena && (
        <div className="arena-actions">
          <ShareButton
            url={arenaInviteUrl(window.location.origin, arena.inviteCode)}
            text={`Join ${arena.name} on Colosseum`}
            label="Invite people"
            className="secondary"
            icon
          />
        </div>
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

// "Nora", "Nora and Ben", "Nora, Ben, and 2 more"
function namesList(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]}, and ${names[2]}`;
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
}
