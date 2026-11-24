"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useAuthUser, usePlayers } from "@/hooks";
import { timeLeft } from "@/format";
import { Prediction, User } from "@/lib/types";

export default function Home() {
  const { authUser, loading, setupError } = useAuthUser();
  const players = usePlayers(!!authUser);
  const [player, setPlayer] = useState<User | null>(null);
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

  // keep your glory and tokens in sync
  useEffect(() => {
    if (!authUser) {
      setPlayer(null);
      return;
    }
    return onSnapshot(
      doc(db, "users", authUser.uid),
      (snap) => setPlayer(snap.exists() ? (snap.data() as User) : null),
      () => setPlayer(null)
    );
  }, [authUser]);

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

  const nameOf = (uid: string) => players.find((p) => p.uid === uid)?.displayName ?? "Someone";
  const now = Date.now();

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

      <h2>Open calls</h2>
      {calls.length === 0 && <p className="muted">No open calls yet. Make the first one.</p>}
      <ul className="calls">
        {calls.map((c) => (
          <li key={c.id} className="call">
            <p className="call-text">{c.text}</p>
            <p className="call-meta">
              About {c.subjectId ? nameOf(c.subjectId) : c.subjectLabel} · by {nameOf(c.creatorId)} · {timeLeft(c.deadline, now)}
            </p>
          </li>
        ))}
      </ul>

      <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
    </main>
  );
}
