import { initializeApp } from "firebase-admin/app";
import { getFirestore, DocumentReference, Transaction } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { START_GLORY, START_TOKENS } from "../../src/lib/constants";
import { Payout, Position, Prediction, Side, User, VoidReason } from "../../src/lib/types";
import {
  applyPayout,
  canResolve,
  canTakeSide,
  hasNoTakers,
  refundAll,
  settle,
  sweepDecision,
} from "../../src/lib/resolve";
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

// ---------- ending a call (settling or voiding) ----------

// everything we need to end a call, read inside a transaction
async function loadCall(tx: Transaction, ref: DocumentReference) {
  const snap = await tx.get(ref);
  if (!snap.exists) return null;
  const prediction = snap.data() as Prediction;

  const positionSnaps = await tx.get(ref.collection("positions"));
  const positions = positionSnaps.docs.map((d) => d.data() as Position);

  // everyone who played, plus the creator (they might need a missedResolves bump)
  const uids = new Set(positions.map((p) => p.uid));
  uids.add(prediction.creatorId);
  const userSnaps = await tx.getAll(...[...uids].map((uid) => db.doc(`users/${uid}`)));
  const users = new Map(userSnaps.filter((u) => u.exists).map((u) => [u.id, u.data() as User]));

  return { prediction, positions, users };
}

type LoadedCall = NonNullable<Awaited<ReturnType<typeof loadCall>>>;

// apply everyone's payout, save it on their position, and update the call
function finishCall(
  tx: Transaction,
  ref: DocumentReference,
  call: LoadedCall,
  payouts: Payout[],
  counted: boolean,
  callUpdate: Partial<Prediction>,
  missedResolve = false
) {
  // build each player's update first so nobody's record gets written twice
  const updates = new Map<string, Record<string, number>>();
  for (const payout of payouts) {
    const user = call.users.get(payout.uid);
    if (!user) continue;
    updates.set(payout.uid, applyPayout(user, payout, counted));
    tx.update(ref.collection("positions").doc(payout.uid), { result: payout });
  }

  if (missedResolve) {
    const creatorId = call.prediction.creatorId;
    const creator = call.users.get(creatorId);
    if (creator) {
      updates.set(creatorId, { ...updates.get(creatorId), missedResolves: creator.missedResolves + 1 });
    }
  }

  for (const [uid, fields] of updates) {
    tx.update(db.doc(`users/${uid}`), fields);
  }
  tx.update(ref, { ...callUpdate, resolvedAt: Date.now() });
}

function voidCall(tx: Transaction, ref: DocumentReference, call: LoadedCall, reason: VoidReason) {
  // everyone gets their stake back, and it doesn't count as a played call
  finishCall(tx, ref, call, refundAll(call.positions), false, { status: "void", voidReason: reason }, reason === "not_resolved");
}

// the creator says what happened. pays everyone out in one transaction
export const resolveCall = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const data = request.data ?? {};
  const predictionId = typeof data.predictionId === "string" ? data.predictionId : "";
  const outcome = data.outcome;

  if (!predictionId || predictionId.includes("/")) {
    throw new HttpsError("invalid-argument", "That call doesn't exist");
  }
  if (outcome !== "yes" && outcome !== "no") {
    throw new HttpsError("invalid-argument", "Pick yes or no");
  }

  const uid = request.auth.uid;
  const ref = db.doc(`predictions/${predictionId}`);

  const status = await db.runTransaction(async (tx) => {
    const call = await loadCall(tx, ref);
    if (!call) throw new HttpsError("not-found", "That call doesn't exist");

    const problem = canResolve(call.prediction, uid, Date.now());
    if (problem) throw new HttpsError("failed-precondition", problem);

    // nobody else joined, so there's nothing to settle
    if (hasNoTakers(call.prediction, call.positions)) {
      voidCall(tx, ref, call, "no_takers");
      return "void";
    }

    const payouts = settle(call.positions, outcome as Side);
    finishCall(tx, ref, call, payouts, true, { status: "resolved", outcome: outcome as Side });
    return "resolved";
  });

  return { status };
});

// ---------- voiding calls nobody settled ----------

// finds open calls past their deadline and voids the ones that need it. returns how many
async function sweep(): Promise<number> {
  const due = await db
    .collection("predictions")
    .where("status", "==", "open")
    .where("deadline", "<", Date.now())
    .limit(200)
    .get();

  let voided = 0;
  for (const doc of due.docs) {
    // each call gets its own transaction, and we check again inside it
    const didVoid = await db.runTransaction(async (tx) => {
      const call = await loadCall(tx, doc.ref);
      if (!call) return false;
      const reason = sweepDecision(call.prediction, call.positions, Date.now());
      if (!reason) return false;
      voidCall(tx, doc.ref, call, reason);
      return true;
    });
    if (didVoid) voided++;
  }
  return voided;
}

export const sweepCalls = onSchedule("every 15 minutes", async () => {
  await sweep();
});

// the emulator doesn't run scheduled functions, so this lets us run the sweep by hand.
// it only exists in the emulator, so it never gets deployed
export const runSweep =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? onCall(async () => ({ voided: await sweep() }))
    : undefined;
