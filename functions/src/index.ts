import { initializeApp } from "firebase-admin/app";
import { getFirestore, DocumentReference, FieldValue, Transaction } from "firebase-admin/firestore";
import { randomBytes } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { START_GLORY, START_TOKENS, VOTE_WINDOW_MS } from "../../src/lib/constants";
import { Arena, Payout, Position, Prediction, Side, User, VoidReason } from "../../src/lib/types";
import { tierForGlory } from "../../src/lib/ranks";
import { canJoinArena, canLeaveArena, canMakeArena, canRemoveMember, isMember, ownerAfterLeaving, validateArenaName } from "../../src/lib/arenas";
import {
  canDelete,
  canResolve,
  deletePayouts,
  canTakeSide,
  hasNoTakers,
  playerAfter,
  refundAll,
  settle,
  sweepDecision,
} from "../../src/lib/resolve";
import { NewCall, validateNewCall } from "../../src/lib/calls";
import { canDispute, canVote, disputeResult, openingVotes, payoutsAfterVote, redoResult, voteIsOver } from "../../src/lib/disputes";
import { dailyGrant, localDate, pickTimeZone } from "../../src/lib/tokens";

initializeApp();
const db = getFirestore();

// the app calls this every time it opens. makes the player record the first time,
// and hands out the daily tokens once per day in the player's own timezone.
// safe to call as many times as you want
export const ensureUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const uid = request.auth.uid;
  const token = request.auth.token;
  const ref = db.doc(`users/${uid}`);
  const fromPhone = request.data?.timeZone; // checked in pickTimeZone, junk gets ignored

  // transaction so two calls at once can't both create it or both get the grant
  const granted = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const now = Date.now();

    if (!snap.exists) {
      const { timeZone } = pickTimeZone(null, fromPhone, 0, now);
      const user: User = {
        uid,
        displayName: token.name ?? token.email ?? "Player",
        photoURL: token.picture ?? null,
        glory: START_GLORY,
        tokens: START_TOKENS,
        wins: 0,
        calls: 0,
        missedResolves: 0,
        arenaIds: [], // they join or make one next
        rankTier: 1,
        onTheLine: false,
        lastGrantDate: localDate(now, timeZone), // starting tokens count as today's
        timeZone,
        timeZoneChangedAt: now,
        createdAt: now,
      };
      tx.set(ref, user);
      return 0;
    }

    const user = snap.data() as User;
    const tz = pickTimeZone(user.timeZone, fromPhone, user.timeZoneChangedAt ?? 0, now);
    const today = localDate(now, tz.timeZone);

    const updates: Partial<User> = {};
    // players made before arenas or ranks existed don't have these yet
    if (!Array.isArray(user.arenaIds)) updates.arenaIds = [];
    if (typeof user.rankTier !== "number") {
      updates.rankTier = tierForGlory(user.glory);
      updates.onTheLine = false;
    }
    if (tz.changed) {
      updates.timeZone = tz.timeZone;
      updates.timeZoneChangedAt = now;
    }

    // save today even if they're at the cap, so they can't spend down and claim again later today
    let granted = 0;
    if (user.lastGrantDate !== today) {
      const tokens = dailyGrant(user.tokens, user.lastGrantDate, today);
      granted = tokens - user.tokens;
      updates.tokens = tokens;
      updates.lastGrantDate = today;
    }

    if (Object.keys(updates).length > 0) tx.update(ref, updates);
    return granted;
  });

  return { granted };
});

// make a new call. the creator backs a side while posting it, so the call, their pick,
// and taking their tokens all happen in one transaction.
// the app works out the deadline in local time, we just check it's sensible
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
  const side = data.side;
  const stake = typeof data.stake === "number" ? data.stake : NaN;
  const arenaId = typeof data.arenaId === "string" ? data.arenaId : "";

  const uid = request.auth.uid;
  const now = Date.now();

  // no slashes, or the id could point somewhere else in the database
  if (!arenaId || arenaId.includes("/")) {
    throw new HttpsError("invalid-argument", "Pick an arena");
  }

  const problem = validateNewCall(call, uid, now);
  if (problem) {
    throw new HttpsError("invalid-argument", problem);
  }
  if (side !== "yes" && side !== "no") {
    throw new HttpsError("invalid-argument", "Pick your side");
  }

  const ref = db.collection("predictions").doc();
  const userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const [userSnap, arenaSnap] = await Promise.all([tx.get(userRef), tx.get(db.doc(`arenas/${arenaId}`))]);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Your account isn't set up yet");

    // you can only post in an arena you're in, about someone who's in it too
    if (!arenaSnap.exists) throw new HttpsError("not-found", "That arena doesn't exist");
    const arena = arenaSnap.data() as Arena;
    if (!isMember(arena, uid)) throw new HttpsError("permission-denied", "You're not in this arena");
    if (call.subjectId && !isMember(arena, call.subjectId)) {
      throw new HttpsError("invalid-argument", "That person isn't in this arena");
    }

    const prediction: Prediction = {
      id: ref.id,
      text: call.text.trim(),
      creatorId: uid,
      subjectId: call.subjectId,
      subjectLabel: call.subjectLabel?.trim() ?? null,
      arenaId,
      deadline: call.deadline,
      status: "open",
      outcome: null,
      voidReason: null,
      createdAt: now,
      resolvedAt: null,
    };

    // same checks as anyone picking a side (whole tokens, enough of them, picks still open),
    // except the creator can back their own call with 0, so running out never stops a post
    const user = userSnap.data() as User;
    const sideProblem = canTakeSide(prediction, user, stake, false, now, true);
    if (sideProblem) throw new HttpsError("failed-precondition", sideProblem);

    const position: Position = { uid, predictionId: ref.id, arenaId, side: side as Side, stake, createdAt: now };
    tx.set(ref, prediction);
    tx.set(ref.collection("positions").doc(uid), position);
    tx.update(userRef, { tokens: user.tokens - stake });
    // so the app can tell which arena is busiest (for picking a default arena)
    tx.update(db.doc(`arenas/${arenaId}`), { lastCallAt: now });
  });

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

    // only members of the call's arena can pick a side
    if (!(user.arenaIds ?? []).includes(prediction.arenaId)) {
      throw new HttpsError("permission-denied", "You're not in this arena");
    }

    const problem = canTakeSide(prediction, user, stake, positionSnap.exists, now);
    if (problem) throw new HttpsError("failed-precondition", problem);

    const position: Position = { uid, predictionId, arenaId: prediction.arenaId, side: side as Side, stake, createdAt: now };
    tx.set(positionRef, position);
    tx.update(userRef, { tokens: user.tokens - stake });
  });

  return { ok: true };
});

// ---------- arenas ----------

// a random code for invite links, like "Kx3_pQ9aLm2w". long enough that nobody can guess one
function makeInviteCode(): string {
  return randomBytes(9).toString("base64url");
}

// an invite code from the app, checked so it can't be used to poke at the database
function cleanCode(code: unknown): string {
  if (typeof code !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
    throw new HttpsError("not-found", "That invite link doesn't work");
  }
  return code;
}

async function findArenaByCode(code: string) {
  const found = await db.collection("arenas").where("inviteCode", "==", code).limit(1).get();
  if (found.empty) throw new HttpsError("not-found", "That invite link doesn't work");
  return found.docs[0];
}

// make a new arena with you as the first member
export const createArena = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const name = typeof request.data?.name === "string" ? request.data.name : "";
  const problem = validateArenaName(name);
  if (problem) throw new HttpsError("invalid-argument", problem);

  const uid = request.auth.uid;
  const userRef = db.doc(`users/${uid}`);
  const ref = db.collection("arenas").doc();
  const inviteCode = makeInviteCode();

  await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Your account isn't set up yet");
    const user = userSnap.data() as User;

    const tooMany = canMakeArena(user.arenaIds ?? []);
    if (tooMany) throw new HttpsError("failed-precondition", tooMany);

    const arena: Arena = { id: ref.id, name: name.trim(), ownerId: uid, memberIds: [uid], inviteCode, createdAt: Date.now() };
    tx.set(ref, arena);
    tx.update(userRef, { arenaIds: FieldValue.arrayUnion(ref.id) });
  });

  return { id: ref.id, inviteCode };
});

// join an arena from an invite link. joining one you're already in does nothing
export const joinArena = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const code = cleanCode(request.data?.code);
  const uid = request.auth.uid;
  const arenaRef = (await findArenaByCode(code)).ref;
  const userRef = db.doc(`users/${uid}`);

  // the arena list and the member list always change together
  await db.runTransaction(async (tx) => {
    const [arenaSnap, userSnap] = await Promise.all([tx.get(arenaRef), tx.get(userRef)]);
    if (!userSnap.exists) throw new HttpsError("failed-precondition", "Your account isn't set up yet");
    const arena = arenaSnap.data() as Arena;
    const user = userSnap.data() as User;

    const problem = canJoinArena(arena, uid, user.arenaIds ?? []);
    if (problem) throw new HttpsError("failed-precondition", problem);
    if (isMember(arena, uid)) return;

    tx.update(arenaRef, { memberIds: FieldValue.arrayUnion(uid) });
    tx.update(userRef, { arenaIds: FieldValue.arrayUnion(arenaRef.id) });
  });

  return { arenaId: arenaRef.id };
});

// what someone sees when they open an invite link before joining (even signed out).
// needs the arena's invite code, and only returns what that screen shows
export const previewInvite = onCall(async (request) => {
  const code = cleanCode(request.data?.code);
  const arenaSnap = await findArenaByCode(code);
  const arena = arenaSnap.data() as Arena;
  const arenaInfo = { name: arena.name, memberCount: arena.memberIds.length };

  const callId = request.data?.callId;
  if (callId === undefined || callId === null) return { arena: arenaInfo, call: null };

  // the call has to be in the arena the code is for
  if (typeof callId !== "string" || !callId || callId.includes("/")) {
    throw new HttpsError("not-found", "That call doesn't exist");
  }
  const callSnap = await db.doc(`predictions/${callId}`).get();
  const call = callSnap.data() as Prediction | undefined;
  if (!call || call.arenaId !== arena.id) throw new HttpsError("not-found", "That call doesn't exist");

  // names and photos for the faces on the screen. stakes stay private
  const positions = (await callSnap.ref.collection("positions").get()).docs.map((d) => d.data() as Position);
  // just how much trash talk there is, not what anyone said
  const [reactionCount, commentCount] = await Promise.all([
    callSnap.ref.collection("reactions").count().get(),
    callSnap.ref.collection("comments").count().get(),
  ]);
  const uids = [...new Set([call.creatorId, ...(call.subjectId ? [call.subjectId] : []), ...positions.map((p) => p.uid)])];
  const users = await db.getAll(...uids.map((u) => db.doc(`users/${u}`)));
  const face = (u: string) => {
    const user = users.find((x) => x.id === u)?.data() as User | undefined;
    return { uid: u, name: user?.displayName ?? "Someone", photoURL: user?.photoURL ?? null };
  };

  return {
    arena: arenaInfo,
    call: {
      id: call.id,
      text: call.text,
      status: call.status,
      outcome: call.outcome,
      createdAt: call.createdAt,
      deadline: call.deadline,
      subjectLabel: call.subjectLabel,
      creator: face(call.creatorId),
      subject: call.subjectId ? face(call.subjectId) : null,
      yes: positions.filter((p) => p.side === "yes").map((p) => face(p.uid)),
      no: positions.filter((p) => p.side === "no").map((p) => face(p.uid)),
      reactions: reactionCount.data().count,
      comments: commentCount.data().count,
    },
  };
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
  const updates = new Map<string, Record<string, number | boolean>>();
  for (const payout of payouts) {
    const user = call.users.get(payout.uid);
    if (!user) continue;
    // a settled call can move your rank. voided ones (refunds) never do, so no rankResult
    const { player, rankResult } = playerAfter(user, payout, counted);
    updates.set(payout.uid, { ...player });
    tx.update(ref.collection("positions").doc(payout.uid), rankResult ? { result: payout, rankResult } : { result: payout });
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

// the person a call is about takes it down. everyone else gets their tokens back,
// and the text is wiped so the words about them are gone
export const deleteCall = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in first");
  }

  const data = request.data ?? {};
  const predictionId = typeof data.predictionId === "string" ? data.predictionId : "";
  if (!predictionId || predictionId.includes("/")) {
    throw new HttpsError("invalid-argument", "That call doesn't exist");
  }

  const uid = request.auth.uid;
  const ref = db.doc(`predictions/${predictionId}`);

  await db.runTransaction(async (tx) => {
    const call = await loadCall(tx, ref);
    if (!call) throw new HttpsError("not-found", "That call doesn't exist");

    const problem = canDelete(call.prediction, uid);
    if (problem) throw new HttpsError("failed-precondition", problem);

    finishCall(tx, ref, call, deletePayouts(call.positions, uid), false, {
      status: "void",
      voidReason: "subject_killed",
      text: "",
    });
  });

  return { ok: true };
});

// ---------- disputes ----------

function cleanCallId(id: unknown): string {
  const callId = typeof id === "string" ? id : "";
  if (!callId || callId.includes("/")) throw new HttpsError("invalid-argument", "That call doesn't exist");
  return callId;
}

// a vote is over: keep the result, flip it, or void the call on a tie.
// flipping or voiding takes back what the first result did to everyone, then applies the new one
function finishVote(tx: Transaction, ref: DocumentReference, call: LoadedCall, votes: Record<string, Side>) {
  const prediction = { ...call.prediction, votes };
  const result = disputeResult(prediction);

  if (result === "upheld") {
    tx.update(ref, { status: "resolved", votes, disputeResult: "upheld" });
    return;
  }

  const payouts = payoutsAfterVote(call.positions, prediction, result);
  const counted = result === "flipped";
  for (const position of call.positions) {
    const user = call.users.get(position.uid);
    const payout = payouts.find((p) => p.uid === position.uid);
    if (!user || !payout || !position.result || !position.rankResult) continue;

    const { player, rankResult } = redoResult(user, { result: position.result, rankResult: position.rankResult }, payout, counted);
    tx.update(db.doc(`users/${position.uid}`), { ...player });
    tx.update(ref.collection("positions").doc(position.uid), { result: payout, rankResult: rankResult ?? FieldValue.delete() });
    // so home shows them the result screen again with the new result
    if (counted) tx.delete(db.doc(`users/${position.uid}/seen/${ref.id}`));
  }

  if (counted) {
    const outcome: Side = prediction.outcome === "yes" ? "no" : "yes";
    tx.update(ref, { status: "resolved", outcome, votes, disputeResult: "flipped", resolvedAt: Date.now() });
  } else {
    tx.update(ref, { status: "void", voidReason: "tied_vote", votes, disputeResult: "void", resolvedAt: Date.now() });
  }
}

// someone who picked a side says the result is wrong. starts a vote among everyone who picked a side
export const disputeCall = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first");
  const uid = request.auth.uid;
  const ref = db.doc(`predictions/${cleanCallId(request.data?.predictionId)}`);

  const status = await db.runTransaction(async (tx) => {
    const call = await loadCall(tx, ref);
    if (!call) throw new HttpsError("not-found", "That call doesn't exist");
    const pickedASide = call.positions.some((p) => p.uid === uid);
    const problem = canDispute(call.prediction, uid, pickedASide, Date.now());
    if (problem) throw new HttpsError("failed-precondition", problem);

    const now = Date.now();
    const votes = openingVotes(call.prediction, uid);
    const disputed: Prediction = { ...call.prediction, status: "disputed", disputedBy: uid, disputedAt: now, votes };
    // with just two people in it, both have already voted, so it's over right away
    if (voteIsOver(disputed, call.positions, now)) {
      finishVote(tx, ref, { ...call, prediction: disputed }, votes);
      return "finished";
    }
    tx.update(ref, { status: "disputed", disputedBy: uid, disputedAt: now, votes });
    return "disputed";
  });

  return { status };
});

// a vote on what really happened. ends the vote once everyone's in
export const voteOnDispute = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first");
  const uid = request.auth.uid;
  const ref = db.doc(`predictions/${cleanCallId(request.data?.predictionId)}`);
  const side = request.data?.side;
  if (side !== "yes" && side !== "no") throw new HttpsError("invalid-argument", "Pick yes or no");

  const status = await db.runTransaction(async (tx) => {
    const call = await loadCall(tx, ref);
    if (!call) throw new HttpsError("not-found", "That call doesn't exist");
    const pickedASide = call.positions.some((p) => p.uid === uid);
    const problem = canVote(call.prediction, uid, pickedASide, Date.now());
    if (problem) throw new HttpsError("failed-precondition", problem);

    const votes = { ...call.prediction.votes, [uid]: side as Side };
    if (voteIsOver({ ...call.prediction, votes }, call.positions, Date.now())) {
      finishVote(tx, ref, call, votes);
      return "finished";
    }
    tx.update(ref, { votes });
    return "voted";
  });

  return { status };
});

// ---------- leaving and removing ----------

// take someone out of an arena: off both lists in one transaction, ownership handed on if the
// owner left. then the open calls they made or that are about them get voided (refunding
// everyone), since nobody could settle them or the person they're about isn't there anymore
async function takeOutOfArena(arenaId: string, targetUid: string, byUid: string, removing: boolean) {
  const arenaRef = db.doc(`arenas/${arenaId}`);
  const userRef = db.doc(`users/${targetUid}`);

  await db.runTransaction(async (tx) => {
    const arenaSnap = await tx.get(arenaRef);
    if (!arenaSnap.exists) throw new HttpsError("not-found", "That arena doesn't exist");
    const arena = arenaSnap.data() as Arena;

    const problem = removing ? canRemoveMember(arena, byUid, targetUid) : canLeaveArena(arena, targetUid);
    if (problem) throw new HttpsError("failed-precondition", problem);

    const arenaUpdate: Record<string, unknown> = { memberIds: FieldValue.arrayRemove(targetUid) };
    const owner = ownerAfterLeaving(arena, targetUid);
    if (owner) arenaUpdate.ownerId = owner;
    if (removing) arenaUpdate.removedIds = FieldValue.arrayUnion(targetUid);
    tx.update(arenaRef, arenaUpdate);
    tx.update(userRef, { arenaIds: FieldValue.arrayRemove(arenaId) });
  });

  const open = await db.collection("predictions").where("arenaId", "==", arenaId).where("status", "==", "open").get();
  let voided = 0;
  for (const doc of open.docs) {
    const p = doc.data() as Prediction;
    if (p.creatorId !== targetUid && p.subjectId !== targetUid) continue;

    // each in its own transaction, checking it's still open
    const did = await db.runTransaction(async (tx) => {
      const call = await loadCall(tx, doc.ref);
      if (!call || call.prediction.status !== "open") return false;
      // a call about someone who's gone gets its text wiped, like when they take it down
      const about = call.prediction.subjectId === targetUid;
      finishCall(tx, doc.ref, call, refundAll(call.positions), false, {
        status: "void",
        voidReason: "member_left",
        ...(about ? { text: "" } : {}),
      });
      return true;
    });
    if (did) voided++;
  }
  return voided;
}

function cleanArenaId(id: unknown): string {
  if (typeof id !== "string" || !id || id.includes("/")) throw new HttpsError("invalid-argument", "That arena doesn't exist");
  return id;
}

// leave an arena you're in
export const leaveArena = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first");
  const arenaId = cleanArenaId(request.data?.arenaId);
  const voided = await takeOutOfArena(arenaId, request.auth.uid, request.auth.uid, false);
  return { voided };
});

// the owner removes someone. they can't rejoin with the invite link
export const removeMember = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first");
  const arenaId = cleanArenaId(request.data?.arenaId);
  const target = request.data?.uid;
  if (typeof target !== "string" || !target || target.includes("/")) throw new HttpsError("invalid-argument", "Pick someone");
  const voided = await takeOutOfArena(arenaId, target, request.auth.uid, true);
  return { voided };
});

// ---------- voiding calls nobody settled ----------

// finds open calls past their deadline and voids the ones that need it (returns how many),
// and decides disputes whose voting time is up
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

  // disputes whose 24 hours of voting are up get decided with the votes they have
  const votesDue = await db
    .collection("predictions")
    .where("status", "==", "disputed")
    .where("disputedAt", "<", Date.now() - VOTE_WINDOW_MS)
    .limit(200)
    .get();
  for (const doc of votesDue.docs) {
    await db.runTransaction(async (tx) => {
      const call = await loadCall(tx, doc.ref);
      if (!call || !voteIsOver(call.prediction, call.positions, Date.now())) return;
      finishVote(tx, doc.ref, call, call.prediction.votes ?? {});
    });
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
