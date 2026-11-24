// checks that firestore.rules stops people from cheating.
// needs the firestore emulator, so run it with: npm run test:rules
import { readFileSync } from "fs";
import { describe, it, beforeAll, beforeEach, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collectionGroup, doc, getDoc, getDocs, query, where, setDoc, updateDoc, deleteDoc, setLogLevel } from "firebase/firestore";

// the denied writes are supposed to fail, so don't print a warning for each one
setLogLevel("error");

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-colosseum",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

// start every test with just maya's record in the database
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/maya"), { uid: "maya", glory: 100, tokens: 50, wins: 0, calls: 0 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

// a database connection as if you were signed in as this person (or signed out)
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

describe("users", () => {
  it("signed in players can see other players", async () => {
    await assertSucceeds(getDoc(doc(as("jake"), "users/maya")));
  });

  it("signed out people can't see anything", async () => {
    await assertFails(getDoc(doc(signedOut(), "users/maya")));
  });

  it("you can't give yourself glory or tokens", async () => {
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { glory: 9999 }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { tokens: 9999 }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { wins: 50, calls: 50 }));
  });

  it("you can't change your own timezone or grant date to get extra daily tokens", async () => {
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { timeZone: "Pacific/Auckland" }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { lastGrantDate: "2000-01-01" }));
  });

  it("you can't make your own player record", async () => {
    await assertFails(setDoc(doc(as("jake"), "users/jake"), { uid: "jake", glory: 9999, tokens: 9999 }));
  });

  it("you can't mess with someone else's record", async () => {
    await assertFails(updateDoc(doc(as("jake"), "users/maya"), { glory: 100 }));
    await assertFails(deleteDoc(doc(as("jake"), "users/maya")));
  });

  it("you can't delete your own record to reset it", async () => {
    await assertFails(deleteDoc(doc(as("maya"), "users/maya")));
  });
});

describe("predictions", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "predictions/p1"), { text: "Jake skips class", creatorId: "maya", status: "open" });
    });
  });

  it("signed in players can see calls", async () => {
    await assertSucceeds(getDoc(doc(as("jake"), "predictions/p1")));
  });

  it("signed out people can't see calls", async () => {
    await assertFails(getDoc(doc(signedOut(), "predictions/p1")));
  });

  it("you can't make a call directly, it has to go through the server", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p2"), { text: "hi", creatorId: "maya", status: "open" }));
  });

  it("not even the creator can edit or delete a call directly", async () => {
    await assertFails(updateDoc(doc(as("maya"), "predictions/p1"), { status: "resolved", outcome: "yes" }));
    await assertFails(deleteDoc(doc(as("maya"), "predictions/p1")));
  });
});

describe("positions", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "predictions/p1"), { text: "Jake skips class", creatorId: "maya", status: "open" });
      await setDoc(doc(ctx.firestore(), "predictions/p1/positions/jake"), { uid: "jake", predictionId: "p1", side: "no", stake: 10 });
    });
  });

  it("signed in players can see who picked which side", async () => {
    await assertSucceeds(getDoc(doc(as("maya"), "predictions/p1/positions/jake")));
  });

  it("you can find all your positions across calls", async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as("jake"), "positions"), where("uid", "==", "jake"))));
  });

  it("signed out people can't see positions", async () => {
    await assertFails(getDoc(doc(signedOut(), "predictions/p1/positions/jake")));
  });

  it("you can't pick a side directly and skip paying tokens", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/positions/maya"), { uid: "maya", predictionId: "p1", side: "yes", stake: 10 }));
  });

  it("you can't sneak in a pick after picks close by writing to Firestore yourself", async () => {
    // posted 2 days ago, deadline tomorrow, so picks closed half a day ago
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "predictions/late"), {
        text: "Late call",
        creatorId: "maya",
        status: "open",
        createdAt: now - 2 * day,
        deadline: now + day,
      });
    });
    await assertFails(
      setDoc(doc(as("jake"), "predictions/late/positions/jake"), {
        uid: "jake",
        predictionId: "late",
        side: "no",
        stake: 10,
        createdAt: now,
      })
    );
  });

  it("you can't switch sides or change your stake", async () => {
    await assertFails(updateDoc(doc(as("jake"), "predictions/p1/positions/jake"), { side: "yes" }));
    await assertFails(updateDoc(doc(as("jake"), "predictions/p1/positions/jake"), { stake: 1 }));
  });

  it("you can't delete your position to get out of it", async () => {
    await assertFails(deleteDoc(doc(as("jake"), "predictions/p1/positions/jake")));
  });
});

describe("everything else", () => {
  it("is locked until we build it", async () => {
    await assertFails(setDoc(doc(as("maya"), "groups/g1"), { name: "hi" }));
    await assertFails(getDoc(doc(as("maya"), "groups/g1")));
  });
});
