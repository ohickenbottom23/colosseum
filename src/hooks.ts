"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User as AuthUser } from "firebase/auth";
import { collection, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/firebase";
import { User } from "@/lib/types";

// who's signed in. also makes sure their player record exists the first time
export function useAuthUser() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setLoading(false);
      if (u) {
        httpsCallable(functions, "ensureUser")().catch(() => setSetupError("Couldn't set up your account. Try again."));
      }
    });
  }, []);

  return { authUser, loading, setupError };
}

// every player. fine while it's just friends, will need groups later
export function usePlayers(signedIn: boolean) {
  const [players, setPlayers] = useState<User[]>([]);

  useEffect(() => {
    if (!signedIn) return;
    return onSnapshot(
      collection(db, "users"),
      (snap) => setPlayers(snap.docs.map((d) => d.data() as User)),
      () => setPlayers([])
    );
  }, [signedIn]);

  return players;
}
