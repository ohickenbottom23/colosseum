"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useAuthUser, useMyPositions, usePlayer, usePlayers } from "@/hooks";
import { Prediction } from "@/lib/types";
import CallCard from "./CallCard";

export default function Home() {
  const { authUser, loading, setupError } = useAuthUser();
  const uid = authUser?.uid ?? null;
  const players = usePlayers(!!authUser);
  const player = usePlayer(uid);
  const myPositions = useMyPositions(uid);
  const [calls, setCalls] = useState<Prediction[]>([]);
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

  // calls you can still get in on, and calls you're already in
  const needsSide = calls.filter((c) => !myPositions.has(c.id) && c.deadline > now);
  const youreIn = calls.filter((c) => myPositions.has(c.id));

  return (
    <main>
      <h1>Colosseum</h1>

      {setupError && <p className="error">{setupError}</p>}

      {player ? (
        <div className="stats">
          <div className="stat">
            <span className="stat-number">{player.glory}</span>
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
              <CallCard key={c.id} call={c} nameOf={nameOf} mine={myPositions.get(c.id)} now={now} />
            ))}
          </ul>
        </>
      )}

      <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
    </main>
  );
}
