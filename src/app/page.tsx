"use client";

import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User as AuthUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/firebase";
import { User } from "@/lib/types";

export default function Home() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [player, setPlayer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    // firebase tells us whenever someone signs in or out
    return onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!authUser) {
      setPlayer(null);
      return;
    }

    // make sure the player record exists (the server creates it the first time)
    httpsCallable(functions, "ensureUser")().catch(() => setError("Couldn't set up your account. Try again."));

    // then keep the page in sync with it
    return onSnapshot(
      doc(db, "users", authUser.uid),
      (snap) => setPlayer(snap.exists() ? (snap.data() as User) : null),
      () => setPlayer(null)
    );
  }, [authUser]);

  if (loading) return <main><p>Loading...</p></main>;

  if (!authUser) {
    return (
      <main>
        <h1>Colosseum</h1>
        <p>Call it. Get proven right in front of your friends.</p>
        <button onClick={() => signInWithPopup(auth, new GoogleAuthProvider())}>
          Sign in with Google
        </button>
      </main>
    );
  }

  return (
    <main>
      <h1>Colosseum</h1>
      <p>Signed in as {authUser.displayName ?? authUser.email}</p>

      {error && <p className="error">{error}</p>}

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
        !error && <p>Setting up your account...</p>
      )}

      <button className="secondary" onClick={() => signOut(auth)}>Sign out</button>
    </main>
  );
}
