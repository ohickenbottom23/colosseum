import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { START_GLORY, START_TOKENS } from "../../src/lib/constants";
import { Position, Prediction, Side, User } from "../../src/lib/types";
import { canTakeSide } from "../../src/lib/resolve";
import { NewCall, validateNewCall } from "../../src/lib/calls";

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

// make a new call. the app works out the deadline in local time, we just check it's sensible
export const createCall = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  // anyone can send anything here, so only take the fields we expect, with the right types
  const data = request.data ?? {};
  const call: NewCall = {
    text: typeof data.text === "string" ? data.text : "",
    subjectId: typeof data.subjectId === "string" && data.subjectId ? data.subjectId : null,
    subjectLabel: typeof data.subjectLabel === "string" && data.subjectLabel.trim() ? data.subjectLabel : null,
    deadline: typeof data.deadline === "number" ? data.deadline : NaN,
  };

  const uid = request.auth.uid;
  const now = Date.now();

  const problem = validateNewCall(call, uid, now);
  if (problem) {
    throw new HttpsError("invalid-argument", problem);
  }

  // if it's about a person, they have to actually be a player
  if (call.subjectId) {
    const subject = await db.doc(`users/${call.subjectId}`).get();
    if (!subject.exists) {
      throw new HttpsError("invalid-argument", "That player doesn't exist");
    }
  }

  const ref = db.collection("predictions").doc();
  const prediction: Prediction = {
    id: ref.id,
    text: call.text.trim(),
    creatorId: uid,
    subjectId: call.subjectId,
    subjectLabel: call.subjectLabel?.trim() ?? null,
    groupId: null, // no groups yet, everyone can see it
    deadline: call.deadline,
    status: "open",
    outcome: null,
    voidReason: null,
    createdAt: now,
    resolvedAt: null,
  };
  await ref.set(prediction);

  return { id: ref.id };
});

// pick a side on a call. takes the tokens and saves your side in one transaction,
// so double taps or spending more than you have can't sneak through
export const takeSide = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const data = request.data ?? {};
  const predictionId = typeof data.predictionId === "string" ? data.predictionId : "";
  const side = data.side;
  const stake = typeof data.stake === "number" ? data.stake : NaN;

  // no slashes, or the id could point somewhere else in the database
  if (!predictionId || predictionId.includes("/")) {
    throw new HttpsError("invalid-argument", "That call doesn't exist");
  }
  if (side !== "yes" && side !== "no") {
    throw new HttpsError("invalid-argument", "Pick yes or no");
  }

  const uid = request.auth.uid;
  const predictionRef = db.doc(`predictions/${predictionId}`);
  const userRef = db.doc(`users/${uid}`);
  const positionRef = db.doc(`predictions/${predictionId}/positions/${uid}`);

  await db.runTransaction(async (tx) => {
    const [predictionSnap, userSnap, positionSnap] = await Promise.all([
      tx.get(predictionRef),
      tx.get(userRef),
      tx.get(positionRef),
    ]);

    if (!predictionSnap.exists) throw new HttpsError("not-found", "That call doesn't exist");
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Your account isn't set up yet");

    const prediction = predictionSnap.data() as Prediction;
    const user = userSnap.data() as User;
    const now = Date.now();

    const problem = canTakeSide(prediction, user, stake, positionSnap.exists, now);
    if (problem) throw new HttpsError("failed-precondition", problem);

    const position: Position = { uid, predictionId, side: side as Side, stake, createdAt: now };
    tx.set(positionRef, position);
    tx.update(userRef, { tokens: user.tokens - stake });
  });

  return { ok: true };
});
