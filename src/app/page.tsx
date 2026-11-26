"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useAuthUser, useMyArenas, useMyPositions, usePlayer, usePlayers } from "@/hooks";
import { formatGlory, resultLine } from "@/format";
import { Prediction } from "@/lib/types";
import { picksCloseAt } from "@/lib/resolve";
import CallCard from "./CallCard";
import TabBar from "./TabBar";
import SignInButton from "./SignInButton";
import AboutYouCard from "./AboutYouCard";
import RankStrip from "./RankStrip";
import NewArenaForm from "./NewArenaForm";
import { faceOf } from "./ui/Avatar";

export default function Home() {
  const { authUser, loading, setupError, granted } = useAuthUser();
  const uid = authUser?.uid ?? null;
  const players = usePlayers(!!authUser);
  const player = usePlayer(uid);
  const myPositions = useMyPositions(uid);
  const arenas = useMyArenas(uid);
  const [calls, setCalls] = useState<Prediction[]>([]);
  const [finished, setFinished] = useState<Prediction[]>([]);

  // your arenas, from your own record (the rules check against the same list).
  // joined into a string so the effects below only rerun when it really changes
  const arenaKey = (player?.arenaIds ?? []).join(",");

  // open calls from all your arenas, newest first
  useEffect(() => {
    if (!arenaKey) {
      setCalls([]);
      return;
    }
    const q = query(
      collection(db, "predictions"),
      where("arenaId", "in", arenaKey.split(",")),
      where("status", "==", "open"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    return onSnapshot(
      q,
      (snap) => setCalls(snap.docs.map((d) => d.data() as Prediction)),
      () => setCalls([])
    );
  }, [arenaKey]);

  // calls in your arenas that just finished (settled or voided), newest first.
  // open calls have no resolvedAt, so "after 0" leaves them out
  useEffect(() => {
    if (!arenaKey) {
      setFinished([]);
      return;
    }
    const q = query(
      collection(db, "predictions"),
      where("arenaId", "in", arenaKey.split(",")),
      where("resolvedAt", ">", 0),
      orderBy("resolvedAt", "desc"),
      limit(30)
    );
    return onSnapshot(
      q,
      (snap) => setFinished(snap.docs.map((d) => d.data() as Prediction)),
      () => setFinished([])
    );
  }, [arenaKey]);

  if (loading) return <main><p>Loading...</p></main>;

  if (!authUser) {
    return (
      <main>
        <h1 className="wordmark">Colosseum</h1>
        <p>Call it. Get proven right in front of your friends.</p>
        <SignInButton />
      </main>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.uid === id)?.displayName ?? "Someone";
  const arenaName = (id: string) => arenas.find((a) => a.id === id)?.name ?? "";
  const faceFor = (id: string) => faceOf(id, players);
  const now = Date.now();

  // your own open calls, and open calls about you, come out of the same list
  const myOpenCalls = calls.filter((c) => c.creatorId === authUser.uid);
  const aboutMe = calls.filter((c) => c.subjectId === authUser.uid);

  // your calls past their deadline come first, then ones you can still get in on, then ones you're in
  const needsResult = myOpenCalls.filter((c) => c.deadline <= now).sort((a, b) => a.deadline - b.deadline);
  const needsResultIds = new Set(needsResult.map((c) => c.id));
  // calls about you get their own section at the top, so leave them out of the others
  const aboutMeIds = new Set(aboutMe.map((c) => c.id));
  const needsSide = calls.filter((c) => !myPositions.has(c.id) && now < picksCloseAt(c) && !aboutMeIds.has(c.id));
  const youreIn = calls.filter((c) => myPositions.has(c.id) && !needsResultIds.has(c.id) && !aboutMeIds.has(c.id));

  // finished calls you played in or made
  const recent = finished.filter((c) => myPositions.has(c.id) || c.creatorId === authUser.uid).slice(0, 10);

  // what to say under a finished call
  function recentNote(c: Prediction): string {
    const mine = myPositions.get(c.id);
    if (c.status === "void") {
      if (mine?.result) return `Didn't count. ${resultLine(mine.result, true)}`;
      if (c.voidReason === "not_resolved" && c.creatorId === authUser?.uid) return "Didn't count. You didn't settle it in time";
      return "Didn't count";
    }
    if (mine?.result) return `Result: ${c.outcome?.toUpperCase()}. ${resultLine(mine.result, false)}`;
    return `Result: ${c.outcome?.toUpperCase()}`;
  }

  return (
    <main className="with-tabs">
      <h1 className="wordmark">Colosseum</h1>

      {setupError && <p className="error">{setupError}</p>}
      {granted > 0 && <p className="banner">+{granted} tokens for today</p>}

      {player ? (
        <>
        <RankStrip player={player} />
        <div className="stats">
          <div className="stat">
            <span className="stat-number glory">{formatGlory(player.glory)}</span>
            <span className="stat-label">Glory</span>
          </div>
          <div className="stat">
            <span className="stat-number">{player.tokens}</span>
            <span className="stat-label">Tokens</span>
          </div>
        </div>
        <p className="explainer">Tokens are what you put behind a call. Glory is your record for being right.</p>
        </>
      ) : (
        !setupError && <p>Setting up your account...</p>
      )}

      {/* brand new players need an arena before anything else works */}
      {player && player.arenaIds?.length === 0 && (
        <>
          <h2>Start an arena</h2>
          <p className="muted">
            An arena is your friend group. Calls, sides, and the leaderboard all happen inside one. Make one and send
            the invite link to your group chat, or open an invite link a friend sent you.
          </p>
          <NewArenaForm main />
        </>
      )}

      {aboutMe.length > 0 && (
        <>
          <h2>About you</h2>
          <ul className="calls">
            {aboutMe.map((c) => (
              <AboutYouCard key={c.id} call={c} nameOf={nameOf} arenaName={arenaName(c.arenaId)} mine={myPositions.get(c.id)} now={now} />
            ))}
          </ul>
        </>
      )}

      {player && player.arenaIds?.length > 0 && <Link href="/new" className="button">Make a call</Link>}

      {needsResult.length > 0 && (
        <>
          <h2>Needs your result</h2>
          <ul className="calls">
            {needsResult.map((c) => (
              <CallCard key={c.id} call={c} nameOf={nameOf} faceFor={faceFor} arenaName={arenaName(c.arenaId)} note="Say what happened" now={now} />
            ))}
          </ul>
        </>
      )}

      {/* with no arena there's nothing to pick a side on yet, so skip this */}
      {player && player.arenaIds?.length > 0 && (
        <>
          <h2>Needs your side</h2>
          {needsSide.length === 0 && <p className="muted">You&apos;re caught up. Make a call to get things going.</p>}
          <ul className="calls">
            {needsSide.map((c) => (
              <CallCard key={c.id} call={c} nameOf={nameOf} faceFor={faceFor} arenaName={arenaName(c.arenaId)} now={now} />
            ))}
          </ul>
        </>
      )}

      {youreIn.length > 0 && (
        <>
          <h2>You&apos;re in</h2>
          <ul className="calls">
            {youreIn.map((c) => (
              <CallCard
                key={c.id}
                call={c}
                nameOf={nameOf}
                faceFor={faceFor}
                arenaName={arenaName(c.arenaId)}
                note={`You picked ${myPositions.get(c.id)?.side.toUpperCase()}`}
                now={now}
              />
            ))}
          </ul>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h2>Recent results</h2>
          <ul className="calls">
            {recent.map((c) => (
              <CallCard key={c.id} call={c} nameOf={nameOf} faceFor={faceFor} arenaName={arenaName(c.arenaId)} note={recentNote(c)} now={now} />
            ))}
          </ul>
        </>
      )}

      <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>

      <TabBar />
    </main>
  );
}
