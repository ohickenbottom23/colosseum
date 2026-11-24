"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useAuthUser, useMyPositions, usePlayer, usePlayers } from "@/hooks";
import { formatGlory, resultLine } from "@/format";
import { Prediction } from "@/lib/types";
import CallCard from "./CallCard";

export default function Home() {
  const { authUser, loading, setupError, granted } = useAuthUser();
  const uid = authUser?.uid ?? null;
  const players = usePlayers(!!authUser);
  const player = usePlayer(uid);
  const myPositions = useMyPositions(uid);
  const [calls, setCalls] = useState<Prediction[]>([]);
  const [myOpenCalls, setMyOpenCalls] = useState<Prediction[]>([]);
  const [finished, setFinished] = useState<Prediction[]>([]);
  const [signInError, setSignInError] = useState("");

  async function signIn() {
    setSignInError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      const code = (err as { code?: string }).code;
      // closing the popup yourself isn't an error
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
      if (code === "auth/popup-blocked") setSignInError("Your browser blocked the sign-in window. Allow popups and try again.");
      else setSignInError("Couldn't sign in. Try again.");
    }
  }

  // open calls, newest first
  useEffect(() => {
    if (!authUser) {
      setCalls([]);
      return;
    }
    const q = query(collection(db, "predictions"), where("status", "==", "open"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(
      q,
      (snap) => setCalls(snap.docs.map((d) => d.data() as Prediction)),
      () => setCalls([])
    );
  }, [authUser]);

  // calls you made that are still open, so we can nudge you to settle them
  useEffect(() => {
    if (!uid) {
      setMyOpenCalls([]);
      return;
    }
    const q = query(collection(db, "predictions"), where("creatorId", "==", uid), where("status", "==", "open"));
    return onSnapshot(
      q,
      (snap) => setMyOpenCalls(snap.docs.map((d) => d.data() as Prediction)),
      () => setMyOpenCalls([])
    );
  }, [uid]);

  // calls that just finished (settled or voided), newest first
  useEffect(() => {
    if (!uid) {
      setFinished([]);
      return;
    }
    const q = query(
      collection(db, "predictions"),
      where("status", "in", ["resolved", "void"]),
      orderBy("resolvedAt", "desc"),
      limit(30)
    );
    return onSnapshot(
      q,
      (snap) => setFinished(snap.docs.map((d) => d.data() as Prediction)),
      () => setFinished([])
    );
  }, [uid]);

  if (loading) return <main><p>Loading...</p></main>;

  if (!authUser) {
    return (
      <main>
        <h1>Colosseum</h1>
        <p>Call it. Get proven right in front of your friends.</p>
        <button onClick={signIn}>Sign in with Google</button>
        {signInError && <p className="error">{signInError}</p>}
      </main>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.uid === id)?.displayName ?? "Someone";
  const now = Date.now();

  // your calls past their deadline come first, then ones you can still get in on, then ones you're in
  const needsResult = myOpenCalls.filter((c) => c.deadline <= now).sort((a, b) => a.deadline - b.deadline);
  const needsResultIds = new Set(needsResult.map((c) => c.id));
  const needsSide = calls.filter((c) => !myPositions.has(c.id) && c.deadline > now);
  const youreIn = calls.filter((c) => myPositions.has(c.id) && !needsResultIds.has(c.id));

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
    <main>
      <h1>Colosseum</h1>

      {setupError && <p className="error">{setupError}</p>}
      {granted > 0 && <p className="banner">+{granted} tokens for today</p>}

      {player ? (
        <div className="stats">
          <div className="stat">
            <span className="stat-number">{formatGlory(player.glory)}</span>
            <span className="stat-label">Glory</span>
          </div>
          <div className="stat">
            <span className="stat-number">{player.tokens}</span>
            <span className="stat-label">Tokens</span>
          </div>
        </div>
      ) : (
        !setupError && <p>Setting up your account...</p>
      )}

      <Link href="/new" className="button">Make a call</Link>

      {needsResult.length > 0 && (
        <>
          <h2>Needs your result</h2>
          <ul className="calls">
            {needsResult.map((c) => (
              <CallCard key={c.id} call={c} nameOf={nameOf} note="Say what happened" now={now} />
            ))}
          </ul>
        </>
      )}

      <h2>Needs your side</h2>
      {needsSide.length === 0 && <p className="muted">You&apos;re caught up. Make a call to get things going.</p>}
      <ul className="calls">
        {needsSide.map((c) => (
          <CallCard key={c.id} call={c} nameOf={nameOf} now={now} />
        ))}
      </ul>

      {youreIn.length > 0 && (
        <>
          <h2>You&apos;re in</h2>
          <ul className="calls">
            {youreIn.map((c) => (
              <CallCard
                key={c.id}
                call={c}
                nameOf={nameOf}
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
              <CallCard key={c.id} call={c} nameOf={nameOf} note={recentNote(c)} now={now} />
            ))}
          </ul>
        </>
      )}

      <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
    </main>
  );
}
