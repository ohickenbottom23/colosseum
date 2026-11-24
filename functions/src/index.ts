import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { START_GLORY, START_TOKENS } from "../../src/lib/constants";
import { User } from "../../src/lib/types";

initializeApp();
const db = getFirestore();

// the app calls this right after sign-in. makes the player record the first time,
// does nothing after that. safe to call as many times as you want
export const ensureUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const uid = request.auth.uid;
  const token = request.auth.token;
  const ref = db.doc(`users/${uid}`);

  // transaction so two calls at once can't both create it
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;

    const user: User = {
      uid,
      displayName: token.name ?? token.email ?? "Player",
      photoURL: token.picture ?? null,
      glory: START_GLORY,
      tokens: START_TOKENS,
      wins: 0,
      calls: 0,
      missedResolves: 0,
      friendIds: [],
      // they already got today's tokens. UTC date for now, decide on timezones with the daily grant
      lastGrantDate: new Date().toISOString().slice(0, 10),
      createdAt: Date.now(),
    };
    tx.set(ref, user);
  });

  return { ok: true };
});
