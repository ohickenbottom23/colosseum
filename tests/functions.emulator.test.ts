// calls the real Cloud Functions on the emulators, the same way the app does:
// arenas (make, join, invite previews), picking a side (members only, not after halfway),
// and ranks moving when a call is settled.
// needs the auth, firestore, and functions emulators, so run it with: npm run test:functions
import { describe, it, expect } from "vitest";

const PROJECT = "demo-colosseum";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FUNCTIONS = `http://127.0.0.1:5001/${PROJECT}/us-central1`;
const FIRESTORE = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;
const DAY = 24 * 60 * 60 * 1000;

// "owner" is the emulator's admin token, it skips the security rules.
// we only use it to set things up and look at the results, never to pick a side
const ADMIN = { Authorization: "Bearer owner", "Content-Type": "application/json" };

// a fake Google sign-in on the auth emulator. a random id so every run gets fresh players
async function signIn(name: string) {
  const sub = `test-${name}-${Math.random().toString(36).slice(2)}`;
  const idToken = JSON.stringify({ sub, email: `${sub}@example.com`, name });
  const res = await fetch(`${AUTH}/accounts:signInWithIdp?key=demo-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postBody: `id_token=${idToken}&providerId=google.com`,
      requestUri: "http://localhost",
      returnSecureToken: true,
    }),
  });
  const body = await res.json();
  return { token: body.idToken as string, uid: body.localId as string };
}

// call a Cloud Function like the app does. returns the result, or the error message.
// no token means calling it signed out
async function callFunction(name: string, token: string | null, data: object) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ data }),
  });
  const body = await res.json();
  return body.error ? { error: body.error.message as string } : { result: body.result };
}

async function readDoc(path: string) {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: ADMIN });
  return res.status === 404 ? null : res.json();
}

// pretend the call was posted earlier, so we can be past halfway without waiting
async function setCreatedAt(callId: string, createdAt: number) {
  await fetch(`${FIRESTORE}/predictions/${callId}?updateMask.fieldPaths=createdAt`, {
    method: "PATCH",
    headers: ADMIN,
    body: JSON.stringify({ fields: { createdAt: { integerValue: String(createdAt) } } }),
  });
}

async function tokensOf(uid: string) {
  const user = await readDoc(`users/${uid}`);
  return Number(user.fields.tokens.integerValue);
}

// a new signed-in player with their record set up
async function newPlayer(name: string) {
  const player = await signIn(name);
  await callFunction("ensureUser", player.token, { timeZone: "America/Chicago" });
  return player;
}

// maya makes an arena, jake joins it, and maya posts a call in it with a deadline tomorrow
async function setUp() {
  const maya = await newPlayer("Maya");
  const jake = await newPlayer("Jake");
  const made = await callFunction("createArena", maya.token, { name: "Third Floor" });
  const arenaId = made.result.id as string;
  const inviteCode = made.result.inviteCode as string;
  await callFunction("joinArena", jake.token, { code: inviteCode });
  const call = await callFunction("createCall", maya.token, {
    arenaId,
    text: "It snows this weekend",
    subjectLabel: "the weather",
    deadline: Date.now() + DAY,
    side: "yes",
    stake: 10,
  });
  return { maya, jake, arenaId, inviteCode, callId: call.result.id as string };
}

async function arenaIdsOf(uid: string): Promise<string[]> {
  const user = await readDoc(`users/${uid}`);
  return (user.fields.arenaIds.arrayValue.values ?? []).map((v: { stringValue: string }) => v.stringValue);
}

async function membersOf(arenaId: string): Promise<string[]> {
  const arena = await readDoc(`arenas/${arenaId}`);
  return (arena.fields.memberIds.arrayValue.values ?? []).map((v: { stringValue: string }) => v.stringValue);
}

describe("arenas", { timeout: 30000 }, () => {
  it("making one puts you in it", async () => {
    const maya = await newPlayer("Maya");
    const made = await callFunction("createArena", maya.token, { name: "  Third Floor  " });
    const arenaId = made.result.id;
    expect(await membersOf(arenaId)).toEqual([maya.uid]);
    expect(await arenaIdsOf(maya.uid)).toEqual([arenaId]);
    expect((await readDoc(`arenas/${arenaId}`)).fields.name.stringValue).toBe("Third Floor");
  });

  it("needs a name", async () => {
    const maya = await newPlayer("Maya");
    expect(await callFunction("createArena", maya.token, { name: " " })).toEqual({ error: "Give your arena a name" });
    expect(await callFunction("createArena", null, { name: "Sneaky" })).toEqual({ error: "Sign in first" });
  });

  it("joining with the invite code puts you on both lists, and joining twice does nothing", async () => {
    const { jake, arenaId, inviteCode, maya } = await setUp();
    expect(await membersOf(arenaId)).toEqual([maya.uid, jake.uid]);
    expect(await arenaIdsOf(jake.uid)).toEqual([arenaId]);

    await callFunction("joinArena", jake.token, { code: inviteCode });
    expect(await membersOf(arenaId)).toEqual([maya.uid, jake.uid]);
    expect(await arenaIdsOf(jake.uid)).toEqual([arenaId]);
  });

  it("a made up or junk invite code doesn't work", async () => {
    const sam = await newPlayer("Sam");
    expect(await callFunction("joinArena", sam.token, { code: "nope-not-real" })).toEqual({ error: "That invite link doesn't work" });
    expect(await callFunction("joinArena", sam.token, { code: "../users/x" })).toEqual({ error: "That invite link doesn't work" });
    expect(await arenaIdsOf(sam.uid)).toEqual([]);
  });
});

describe("invite previews (seen before joining, even signed out)", { timeout: 30000 }, () => {
  it("shows the arena and the call with the right code", async () => {
    const { inviteCode, callId, maya, jake } = await setUp();
    await callFunction("takeSide", jake.token, { predictionId: callId, side: "no", stake: 5 });

    const res = await callFunction("previewInvite", null, { code: inviteCode, callId });
    expect(res.result.arena).toEqual({ name: "Third Floor", memberCount: 2 });
    expect(res.result.call.text).toBe("It snows this weekend");
    expect(res.result.call.creator.uid).toBe(maya.uid);
    expect(res.result.call.yes.map((f: { uid: string }) => f.uid)).toEqual([maya.uid]);
    expect(res.result.call.no.map((f: { uid: string }) => f.uid)).toEqual([jake.uid]);
    // no stakes in the preview
    expect(JSON.stringify(res.result)).not.toContain("stake");
  });

  it("counts the trash talk, without sending what anyone said", async () => {
    const { inviteCode, callId, jake } = await setUp();
    const write = (path: string, fields: object) =>
      fetch(`${FIRESTORE}/${path}`, { method: "PATCH", headers: ADMIN, body: JSON.stringify({ fields }) });
    await write(`predictions/${callId}/reactions/${jake.uid}`, { uid: { stringValue: jake.uid }, type: { stringValue: "cap" } });
    await write(`predictions/${callId}/comments/c1`, { uid: { stringValue: jake.uid }, text: { stringValue: "secret trash talk" } });

    const res = await callFunction("previewInvite", null, { code: inviteCode, callId });
    expect(res.result.call.reactions).toBe(1);
    expect(res.result.call.comments).toBe(1);
    expect(JSON.stringify(res.result)).not.toContain("secret trash talk");
  });

  it("an arena invite with no call just shows the arena", async () => {
    const { inviteCode } = await setUp();
    expect((await callFunction("previewInvite", null, { code: inviteCode })).result).toEqual({
      arena: { name: "Third Floor", memberCount: 2 },
      call: null,
    });
  });

  it("won't show a call without the right code", async () => {
    const { callId } = await setUp();
    const other = await setUp(); // a different arena with its own code
    expect(await callFunction("previewInvite", null, { code: "wrong-code", callId })).toEqual({ error: "That invite link doesn't work" });
    // a real code, but for a different arena than the call is in
    expect(await callFunction("previewInvite", null, { code: other.inviteCode, callId })).toEqual({ error: "That call doesn't exist" });
  });
});

describe("making a call", { timeout: 30000 }, () => {
  it("only in an arena you're in, about someone who's in it", async () => {
    const { arenaId, maya } = await setUp();
    const sam = await newPlayer("Sam");
    const base = { text: "Test", deadline: Date.now() + DAY, side: "yes", stake: 5 };

    expect(await callFunction("createCall", sam.token, { ...base, arenaId, subjectLabel: "x" })).toEqual({ error: "You're not in this arena" });
    expect(await callFunction("createCall", maya.token, { ...base, arenaId, subjectId: sam.uid })).toEqual({
      error: "That person isn't in this arena",
    });
    expect(await callFunction("createCall", maya.token, { ...base, subjectLabel: "x" })).toEqual({ error: "Pick an arena" });
    expect(await tokensOf(sam.uid)).toBe(50);
  });
});

describe("picking a side through takeSide", { timeout: 30000 }, () => {
  it("works before the halfway point (so the next tests fail for the right reason)", async () => {
    const { jake, callId } = await setUp();
    const res = await callFunction("takeSide", jake.token, { predictionId: callId, side: "no", stake: 10 });
    expect(res).toEqual({ result: { ok: true } });
    expect(await tokensOf(jake.uid)).toBe(40);
  });

  it("is turned down for someone who isn't in the arena", async () => {
    const { callId } = await setUp();
    const sam = await newPlayer("Sam");
    const res = await callFunction("takeSide", sam.token, { predictionId: callId, side: "no", stake: 10 });
    expect(res).toEqual({ error: "You're not in this arena" });
    expect(await readDoc(`predictions/${callId}/positions/${sam.uid}`)).toBeNull();
    expect(await tokensOf(sam.uid)).toBe(50);
  });

  it("is turned down after the halfway point, and nothing changes", async () => {
    const { jake, callId } = await setUp();
    // posted 2 days ago with the deadline tomorrow, so picks closed half a day ago
    await setCreatedAt(callId, Date.now() - 2 * DAY);

    const res = await callFunction("takeSide", jake.token, { predictionId: callId, side: "no", stake: 10 });
    expect(res).toEqual({ error: "Picks are closed for this call" });

    // no position got saved and no tokens got taken
    expect(await readDoc(`predictions/${callId}/positions/${jake.uid}`)).toBeNull();
    expect(await tokensOf(jake.uid)).toBe(50);
  });

  it("is turned down just past the halfway point too", async () => {
    const { jake, callId } = await setUp();
    // posted a day ago with the deadline a day from now, so halfway passed a moment ago
    await setCreatedAt(callId, Date.now() - DAY - 1000);

    const res = await callFunction("takeSide", jake.token, { predictionId: callId, side: "no", stake: 10 });
    expect(res).toEqual({ error: "Picks are closed for this call" });
  });

  it("saves the arena on the position so the rules can check it", async () => {
    const { jake, callId, arenaId } = await setUp();
    await callFunction("takeSide", jake.token, { predictionId: callId, side: "no", stake: 10 });
    const position = await readDoc(`predictions/${callId}/positions/${jake.uid}`);
    expect(position.fields.arenaId.stringValue).toBe(arenaId);
  });
});

// ---------- ranks ----------

// set a player's glory and rank directly (as the admin) to start from a known spot
async function setRank(uid: string, glory: number, rankTier: number, onTheLine: boolean) {
  await fetch(
    `${FIRESTORE}/users/${uid}?updateMask.fieldPaths=glory&updateMask.fieldPaths=rankTier&updateMask.fieldPaths=onTheLine`,
    {
      method: "PATCH",
      headers: ADMIN,
      body: JSON.stringify({
        fields: { glory: { doubleValue: glory }, rankTier: { integerValue: String(rankTier) }, onTheLine: { booleanValue: onTheLine } },
      }),
    }
  );
}

async function rankOf(uid: string) {
  const f = (await readDoc(`users/${uid}`)).fields;
  return {
    glory: Number(f.glory.doubleValue ?? f.glory.integerValue),
    rankTier: Number(f.rankTier.integerValue),
    onTheLine: f.onTheLine.booleanValue as boolean,
  };
}

async function setDeadline(callId: string, deadline: number) {
  await fetch(`${FIRESTORE}/predictions/${callId}?updateMask.fieldPaths=deadline`, {
    method: "PATCH",
    headers: ADMIN,
    body: JSON.stringify({ fields: { deadline: { integerValue: String(deadline) } } }),
  });
}

// maya posts a call backing YES with 10, jake backs NO with jakeStake, then maya settles it
async function playOne(ctx: Awaited<ReturnType<typeof setUp>>, jakeStake: number, outcome: "yes" | "no") {
  const made = await callFunction("createCall", ctx.maya.token, {
    arenaId: ctx.arenaId,
    text: "Rank test",
    subjectLabel: "test",
    deadline: Date.now() + DAY,
    side: "yes",
    stake: 10,
  });
  const callId = made.result.id as string;
  await callFunction("takeSide", ctx.jake.token, { predictionId: callId, side: "no", stake: jakeStake });
  await setDeadline(callId, Date.now() - 60 * 1000);
  const settled = await callFunction("resolveCall", ctx.maya.token, { predictionId: callId, outcome });
  expect(settled).toEqual({ result: { status: "resolved" } });
  return callId;
}

describe("ranks move when a call is settled", { timeout: 60000 }, () => {
  it("new players start as Recruits, not on the line", async () => {
    const sam = await newPlayer("Sam");
    expect(await rankOf(sam.uid)).toEqual({ glory: 100, rankTier: 1, onTheLine: false });
  });

  it("a win past the next floor ranks you up, and the result is saved for the result screen", async () => {
    const ctx = await setUp();
    await setRank(ctx.jake.uid, 148, 1, false);
    // jake alone on NO with 50: 50 x 1.2 x 1 = 60 glory, 148 -> 208
    const callId = await playOne(ctx, 50, "no");
    expect(await rankOf(ctx.jake.uid)).toEqual({ glory: 208, rankTier: 2, onTheLine: false });

    const pick = await readDoc(`predictions/${callId}/positions/${ctx.jake.uid}`);
    const r = pick.fields.rankResult.mapValue.fields;
    expect(Number(r.before.integerValue)).toBe(1);
    expect(Number(r.after.integerValue)).toBe(2);
    expect(r.onTheLine.booleanValue).toBe(false);
    expect(Number(r.gloryBefore.doubleValue ?? r.gloryBefore.integerValue)).toBe(148);
    expect(Number(r.gloryAfter.doubleValue ?? r.gloryAfter.integerValue)).toBe(208);
  });

  it("a loss under the floor puts you on the line, and the next loss drops you", async () => {
    const ctx = await setUp();
    await setRank(ctx.jake.uid, 152, 2, false);

    // losing 10 tokens costs 25 x 0.2 = 5 glory: 152 -> 147, under Gladiator's 150
    await playOne(ctx, 10, "yes");
    expect(await rankOf(ctx.jake.uid)).toEqual({ glory: 147, rankTier: 2, onTheLine: true });

    // another 5: 147 -> 142, and since he was on the line he drops to Recruit
    const callId = await playOne(ctx, 10, "yes");
    expect(await rankOf(ctx.jake.uid)).toEqual({ glory: 142, rankTier: 1, onTheLine: false });
    const r = (await readDoc(`predictions/${callId}/positions/${ctx.jake.uid}`)).fields.rankResult.mapValue.fields;
    expect([Number(r.before.integerValue), Number(r.after.integerValue)]).toEqual([2, 1]);
  });

  it("a win clears the line", async () => {
    const ctx = await setUp();
    await setRank(ctx.jake.uid, 147, 2, true);
    await playOne(ctx, 10, "no"); // jake wins 50 x 1.2 x 0.2 = 12: 147 -> 159
    expect(await rankOf(ctx.jake.uid)).toEqual({ glory: 159, rankTier: 2, onTheLine: false });
  });

  it("a voided call leaves your rank alone", async () => {
    const ctx = await setUp();
    await setRank(ctx.jake.uid, 147, 2, true);
    await callFunction("takeSide", ctx.jake.token, { predictionId: ctx.callId, side: "no", stake: 10 });
    // maya never settles it, so the sweep voids it 48 hours after the deadline
    await setDeadline(ctx.callId, Date.now() - 49 * 60 * 60 * 1000);
    await callFunction("runSweep", ctx.maya.token, {});
    expect(await rankOf(ctx.jake.uid)).toEqual({ glory: 147, rankTier: 2, onTheLine: true });
  });
});

// ---------- leaving and removing ----------

async function callStatus(callId: string) {
  const f = (await readDoc(`predictions/${callId}`)).fields;
  return { status: f.status.stringValue, voidReason: f.voidReason?.stringValue ?? null, text: f.text.stringValue };
}

describe("leaving and removing", { timeout: 60000 }, () => {
  it("leaving takes you off both lists and voids your calls and calls about you, refunding everyone", async () => {
    const ctx = await setUp(); // maya made the arena and a call backing YES with 10, jake joined
    const base = { arenaId: ctx.arenaId, deadline: Date.now() + DAY };

    // a call jake made (maya backs NO on it), one maya made about jake, and jake on maya's first call
    const byJake = (await callFunction("createCall", ctx.jake.token, { ...base, text: "It rains", subjectLabel: "weather", side: "yes", stake: 10 })).result.id;
    await callFunction("takeSide", ctx.maya.token, { predictionId: byJake, side: "no", stake: 10 });
    const aboutJake = (await callFunction("createCall", ctx.maya.token, { ...base, text: "Jake oversleeps", subjectId: ctx.jake.uid, side: "yes", stake: 10 })).result.id;
    await callFunction("takeSide", ctx.jake.token, { predictionId: ctx.callId, side: "no", stake: 5 });
    expect(await tokensOf(ctx.maya.uid)).toBe(20);
    expect(await tokensOf(ctx.jake.uid)).toBe(35);

    const res = await callFunction("leaveArena", ctx.jake.token, { arenaId: ctx.arenaId });
    expect(res).toEqual({ result: { voided: 2 } });

    expect(await membersOf(ctx.arenaId)).toEqual([ctx.maya.uid]);
    expect(await arenaIdsOf(ctx.jake.uid)).toEqual([]);

    // his call is voided (text kept), the one about him is voided with the text wiped
    expect(await callStatus(byJake)).toEqual({ status: "void", voidReason: "member_left", text: "It rains" });
    expect(await callStatus(aboutJake)).toEqual({ status: "void", voidReason: "member_left", text: "" });
    // maya's own call is untouched, and jake's pick on it stays
    expect((await callStatus(ctx.callId)).status).toBe("open");
    expect(await readDoc(`predictions/${ctx.callId}/positions/${ctx.jake.uid}`)).not.toBeNull();

    // refunds: maya gets her 10 on each voided call back, jake his 10 on his own call
    expect(await tokensOf(ctx.maya.uid)).toBe(40);
    expect(await tokensOf(ctx.jake.uid)).toBe(45);
    // and nobody gets a missed settle for it
    const missed = (uid: string) => readDoc(`users/${uid}`).then((d) => Number(d.fields.missedResolves.integerValue));
    expect(await missed(ctx.maya.uid)).toBe(0);
    expect(await missed(ctx.jake.uid)).toBe(0);
  });

  it("if the owner leaves, the arena goes to whoever's been in longest", async () => {
    const ctx = await setUp();
    await callFunction("leaveArena", ctx.maya.token, { arenaId: ctx.arenaId });
    expect((await readDoc(`arenas/${ctx.arenaId}`)).fields.ownerId.stringValue).toBe(ctx.jake.uid);
  });

  it("the owner can remove someone, and they can't rejoin with the invite link", async () => {
    const ctx = await setUp();
    expect(await callFunction("removeMember", ctx.maya.token, { arenaId: ctx.arenaId, uid: ctx.jake.uid })).toEqual({ result: { voided: 0 } });
    expect(await membersOf(ctx.arenaId)).toEqual([ctx.maya.uid]);
    expect(await arenaIdsOf(ctx.jake.uid)).toEqual([]);
    expect(await callFunction("joinArena", ctx.jake.token, { code: ctx.inviteCode })).toEqual({ error: "You were removed from this arena" });
  });

  it("only the owner can remove people, and not themselves", async () => {
    const ctx = await setUp();
    expect(await callFunction("removeMember", ctx.jake.token, { arenaId: ctx.arenaId, uid: ctx.maya.uid })).toEqual({
      error: "Only the person who made the arena can remove people",
    });
    expect(await callFunction("removeMember", ctx.maya.token, { arenaId: ctx.arenaId, uid: ctx.maya.uid })).toEqual({
      error: "To take yourself out, leave the arena instead",
    });
    expect(await membersOf(ctx.arenaId)).toEqual([ctx.maya.uid, ctx.jake.uid]);
  });

  it("you can't leave an arena you're not in", async () => {
    const ctx = await setUp();
    const sam = await newPlayer("Sam");
    expect(await callFunction("leaveArena", sam.token, { arenaId: ctx.arenaId })).toEqual({ error: "You're not in this arena" });
    expect(await callFunction("leaveArena", null, { arenaId: ctx.arenaId })).toEqual({ error: "Sign in first" });
  });
});

// ---------- posting with no tokens ----------

describe("out of tokens", { timeout: 30000 }, () => {
  async function setTokens(uid: string, tokens: number) {
    await fetch(`${FIRESTORE}/users/${uid}?updateMask.fieldPaths=tokens`, {
      method: "PATCH",
      headers: ADMIN,
      body: JSON.stringify({ fields: { tokens: { integerValue: String(tokens) } } }),
    });
  }

  it("you can still post a call and back it with no stake", async () => {
    const ctx = await setUp();
    await setTokens(ctx.jake.uid, 0);
    const res = await callFunction("createCall", ctx.jake.token, {
      arenaId: ctx.arenaId,
      text: "Broke but confident",
      subjectLabel: "test",
      deadline: Date.now() + DAY,
      side: "yes",
      stake: 0,
    });
    expect(res.result.id).toBeTruthy();
    const pick = await readDoc(`predictions/${res.result.id}/positions/${ctx.jake.uid}`);
    expect(Number(pick.fields.stake.integerValue)).toBe(0);
    expect(await tokensOf(ctx.jake.uid)).toBe(0);
  });

  it("a 0 stake is only for the creator's own pick, nobody else's", async () => {
    const ctx = await setUp();
    const res = await callFunction("takeSide", ctx.jake.token, { predictionId: ctx.callId, side: "no", stake: 0 });
    expect(res).toEqual({ error: "Stake has to be at least 1 token" });
  });

  it("the creator still can't put in tokens they don't have", async () => {
    const ctx = await setUp();
    await setTokens(ctx.jake.uid, 0);
    const res = await callFunction("createCall", ctx.jake.token, {
      arenaId: ctx.arenaId,
      text: "Broke",
      subjectLabel: "test",
      deadline: Date.now() + DAY,
      side: "yes",
      stake: 5,
    });
    expect(res).toEqual({ error: "You don't have enough tokens" });
  });
});
