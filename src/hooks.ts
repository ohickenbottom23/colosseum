"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut, User as AuthUser } from "firebase/auth";
import { collection, collectionGroup, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/firebase";
import { Arena, Position, User } from "@/lib/types";

// errors that mean the saved sign-in is dead (the account is gone, or the session was revoked).
// Firebase keeps the user "signed in" anyway, so every read fails until we sign out ourselves.
// on the emulators this happens after a restart, since that wipes every account
const DEAD_SESSION = ["auth/invalid-refresh-token", "auth/user-token-expired", "auth/user-not-found", "auth/user-disabled"];

// who's signed in. also makes sure their player record exists, and picks up today's tokens
export function useAuthUser() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [setupError, setSetupError] = useState("");
  const [granted, setGranted] = useState(0); // tokens they just got for today
  const [ready, setReady] = useState(false); // their player record is set up, so arena stuff can start

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setAuthUser(u);
      setLoading(false);
      setReady(false);
      if (u) {
        // check the saved sign-in still works before using it. if it's dead, sign out so they
        // see the sign in button instead of a home screen where nothing loads
        u.getIdToken(true)
          .then(() => {
            // the phone's timezone decides when their day starts. the server double checks it
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            return httpsCallable<{ timeZone: string }, { granted: number }>(functions, "ensureUser")({ timeZone })
              .then((res) => setGranted(res.data.granted))
              .catch(() => setSetupError("Couldn't set up your account. Try again."))
              .finally(() => setReady(true));
          })
          .catch((err) => {
            if (DEAD_SESSION.includes((err as { code?: string }).code ?? "")) signOut(auth);
            else setSetupError("Couldn't reach the server. Check your connection and try again.");
          });
      }
    });
  }, []);

  return { authUser, loading, setupError, granted, ready };
}

// every player. used to look up names and faces. arena pages filter it down to their members
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

// the arenas you're in, by name
export function useMyArenas(uid: string | null) {
  const [arenas, setArenas] = useState<Arena[]>([]);

  useEffect(() => {
    if (!uid) {
      setArenas([]);
      return;
    }
    const q = query(collection(db, "arenas"), where("memberIds", "array-contains", uid));
    return onSnapshot(
      q,
      (snap) => setArenas(snap.docs.map((d) => d.data() as Arena).sort((a, b) => a.name.localeCompare(b.name))),
      () => setArenas([])
    );
  }, [uid]);

  return arenas;
}
