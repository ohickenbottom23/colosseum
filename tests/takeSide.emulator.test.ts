// calls the real takeSide Cloud Function on the emulators, the same way the app does,
// to prove a pick after the halfway point gets turned down.
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

// call a Cloud Function like the app does. returns the result, or the error message
async function callFunction(name: string, token: string, data: object) {
  const res = await fetch(`${FUNCTIONS}/${name}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
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

// a creator, a call with a deadline tomorrow, and a second player ready to pick
async function setUp() {
  const maya = await signIn("Maya");
  const jake = await signIn("Jake");
  await callFunction("ensureUser", maya.token, { timeZone: "America/Chicago" });
  await callFunction("ensureUser", jake.token, { timeZone: "America/Chicago" });
  const made = await callFunction("createCall", maya.token, {
    text: "It snows this weekend",
    subjectLabel: "the weather",
    deadline: Date.now() + DAY,
    side: "yes",
    stake: 10,
  });
  return { maya, jake, callId: made.result.id as string };
}

describe("picking a side through takeSide", { timeout: 30000 }, () => {
  it("works before the halfway point (so the next test fails for the right reason)", async () => {
    const { jake, callId } = await setUp();
    const res = await callFunction("takeSide", jake.token, { predictionId: callId, side: "no", stake: 10 });
    expect(res).toEqual({ result: { ok: true } });
    expect(await tokensOf(jake.uid)).toBe(40);
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
});
