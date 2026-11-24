"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, User as AuthUser } from "firebase/auth";
import { collection, collectionGroup, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/firebase";
import { Position, User } from "@/lib/types";

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

// one player's record, kept in sync (your glory and tokens)
export function usePlayer(uid: string | null) {
  const [player, setPlayer] = useState<User | null>(null);

  useEffect(() => {
    if (!uid) {
      setPlayer(null);
      return;
    }
    return onSnapshot(
      doc(db, "users", uid),
      (snap) => setPlayer(snap.exists() ? (snap.data() as User) : null),
      () => setPlayer(null)
    );
  }, [uid]);

  return player;
}

// every side you've picked, by call id, so we know which calls still need you
export function useMyPositions(uid: string | null) {
  const [positions, setPositions] = useState<Map<string, Position>>(new Map());

  useEffect(() => {
    if (!uid) {
      setPositions(new Map());
      return;
    }
    const q = query(collectionGroup(db, "positions"), where("uid", "==", uid));
    return onSnapshot(
      q,
      (snap) => setPositions(new Map(snap.docs.map((d) => [d.data().predictionId, d.data() as Position]))),
      () => setPositions(new Map())
    );
  }, [uid]);

  return positions;
}
