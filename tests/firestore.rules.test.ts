// checks that firestore.rules stops people from cheating and keeps arenas private.
// needs the firestore emulator, so run it with: npm run test:rules
import { readFileSync } from "fs";
import { describe, it, beforeAll, beforeEach, afterAll } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  addDoc,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  setLogLevel,
  updateDoc,
  where,
} from "firebase/firestore";

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

// two arenas: maya and jake are in "third", sam is alone in "roommates".
// each has one open call, and jake and sam have each picked a side on their arena's call
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const player = (uid: string, arenaIds: string[]) => ({ uid, glory: 100, tokens: 50, wins: 0, calls: 0, arenaIds });
    await setDoc(doc(db, "users/maya"), player("maya", ["third"]));
    await setDoc(doc(db, "users/jake"), player("jake", ["third"]));
    await setDoc(doc(db, "users/sam"), player("sam", ["roommates"]));
    await setDoc(doc(db, "arenas/third"), { id: "third", name: "Third Floor", memberIds: ["maya", "jake"], inviteCode: "abc" });
    await setDoc(doc(db, "arenas/roommates"), { id: "roommates", name: "Roommates", memberIds: ["sam"], inviteCode: "xyz" });
    await setDoc(doc(db, "predictions/p1"), { text: "Jake skips class", creatorId: "maya", status: "open", arenaId: "third" });
    await setDoc(doc(db, "predictions/p2"), { text: "Sam does laundry", creatorId: "sam", status: "open", arenaId: "roommates" });
    await setDoc(doc(db, "predictions/p1/positions/jake"), { uid: "jake", predictionId: "p1", arenaId: "third", side: "no", stake: 10 });
    await setDoc(doc(db, "predictions/p2/positions/sam"), { uid: "sam", predictionId: "p2", arenaId: "roommates", side: "yes", stake: 10 });
  });
});

afterAll(async () => {
  await env.cleanup();
});

// a database connection as if you were signed in as this person (or signed out)
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const signedOut = () => env.unauthenticatedContext().firestore();

describe("users", () => {
  it("you can see yourself and the players in your arenas", async () => {
    await assertSucceeds(getDoc(doc(as("jake"), "users/maya")));
    await assertSucceeds(getDoc(doc(as("sam"), "users/sam")));
    // what the app asks for: everyone in your arenas
    await assertSucceeds(getDocs(query(collection(as("maya"), "users"), where("arenaIds", "array-contains-any", ["third"]))));
  });

  it("you can't see players who aren't in any of your arenas", async () => {
    await assertFails(getDoc(doc(as("maya"), "users/sam")));
    // a stranger who just signed in (no arenas) can't see anyone but themselves
    await assertFails(getDoc(doc(as("newbie"), "users/maya")));
  });

  it("you can't list every player, or another arena's players", async () => {
    await assertFails(getDocs(collection(as("maya"), "users")));
    await assertFails(getDocs(query(collection(as("maya"), "users"), where("arenaIds", "array-contains-any", ["roommates"]))));
    await assertFails(getDocs(query(collection(as("maya"), "users"), where("arenaIds", "array-contains-any", ["third", "roommates"]))));
  });

  it("signed out people can't see anything", async () => {
    await assertFails(getDoc(doc(signedOut(), "users/maya")));
  });

  it("you can't give yourself glory or tokens", async () => {
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { glory: 9999 }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { tokens: 9999 }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { wins: 50, calls: 50 }));
    // being overruled on a dispute is on your record, and you can't wipe it
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { overruled: 0, missedResolves: 0 }));
  });

  it("you can't change your own timezone or grant date to get extra daily tokens", async () => {
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { timeZone: "Pacific/Auckland" }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { lastGrantDate: "2000-01-01" }));
  });

  it("you can't promote yourself or get off the line", async () => {
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { rankTier: 5 }));
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { onTheLine: false }));
  });

  it("you can't get into an arena by adding it to your own list", async () => {
    await assertFails(updateDoc(doc(as("maya"), "users/maya"), { arenaIds: arrayUnion("roommates") }));
  });

  it("you can't make your own player record", async () => {
    await assertFails(setDoc(doc(as("newbie"), "users/newbie"), { uid: "newbie", glory: 9999, tokens: 9999, arenaIds: ["third"] }));
  });

  it("you can't mess with someone else's record", async () => {
    await assertFails(updateDoc(doc(as("jake"), "users/maya"), { glory: 100 }));
    await assertFails(deleteDoc(doc(as("jake"), "users/maya")));
  });

  it("you can't delete your own record to reset it", async () => {
    await assertFails(deleteDoc(doc(as("maya"), "users/maya")));
  });
});

describe("seen result screens", () => {
  it("you can mark a result as seen and read your own list", async () => {
    await assertSucceeds(setDoc(doc(as("maya"), "users/maya/seen/p1"), { seenAt: 1 }));
    await assertSucceeds(getDocs(collection(as("maya"), "users/maya/seen")));
  });

  it("you can't read or write someone else's", async () => {
    await assertFails(setDoc(doc(as("jake"), "users/maya/seen/p1"), { seenAt: 1 }));
    await assertFails(getDocs(collection(as("jake"), "users/maya/seen")));
    await assertFails(getDocs(collection(signedOut(), "users/maya/seen")));
  });
});

describe("arenas", () => {
  it("members can see their arena", async () => {
    await assertSucceeds(getDoc(doc(as("jake"), "arenas/third")));
  });

  it("you can't see an arena you're not in", async () => {
    await assertFails(getDoc(doc(as("sam"), "arenas/third")));
    await assertFails(getDoc(doc(signedOut(), "arenas/third")));
  });

  it("you can list the arenas you're in", async () => {
    await assertSucceeds(getDocs(query(collection(as("maya"), "arenas"), where("memberIds", "array-contains", "maya"))));
  });

  it("you can't list arenas you're not in", async () => {
    await assertFails(getDocs(query(collection(as("sam"), "arenas"), where("memberIds", "array-contains", "maya"))));
    await assertFails(getDocs(collection(as("sam"), "arenas")));
  });

  it("you can't add yourself to an arena or make one directly", async () => {
    await assertFails(updateDoc(doc(as("sam"), "arenas/third"), { memberIds: arrayUnion("sam") }));
    await assertFails(setDoc(doc(as("sam"), "arenas/mine"), { name: "Mine", memberIds: ["sam"], inviteCode: "q" }));
  });

  it("you can't remove someone or take over an arena directly", async () => {
    await assertFails(updateDoc(doc(as("maya"), "arenas/third"), { memberIds: ["maya"] }));
    await assertFails(updateDoc(doc(as("jake"), "arenas/third"), { ownerId: "jake" }));
  });

  it("members can't rename the arena or change its invite code directly", async () => {
    await assertFails(updateDoc(doc(as("maya"), "arenas/third"), { name: "Maya's" }));
    await assertFails(updateDoc(doc(as("maya"), "arenas/third"), { inviteCode: "new" }));
  });
});

describe("predictions", () => {
  it("members can see calls in their arena", async () => {
    await assertSucceeds(getDoc(doc(as("jake"), "predictions/p1")));
  });

  it("you can't see a call in an arena you're not in", async () => {
    await assertFails(getDoc(doc(as("sam"), "predictions/p1")));
  });

  it("signed out people can't see calls", async () => {
    await assertFails(getDoc(doc(signedOut(), "predictions/p1")));
  });

  it("home can load open calls from all your arenas at once", async () => {
    const q = query(collection(as("maya"), "predictions"), where("arenaId", "in", ["third"]), where("status", "==", "open"));
    await assertSucceeds(getDocs(q));
  });

  it("you can't sneak another arena into that list", async () => {
    const q = query(collection(as("maya"), "predictions"), where("arenaId", "in", ["third", "roommates"]));
    await assertFails(getDocs(q));
  });

  it("you can't load calls without saying which arenas", async () => {
    await assertFails(getDocs(query(collection(as("maya"), "predictions"), where("status", "==", "open"))));
    await assertFails(getDocs(collection(as("maya"), "predictions")));
  });

  it("you can't make a call directly, it has to go through the server", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p3"), { text: "hi", creatorId: "maya", status: "open", arenaId: "third" }));
  });

  it("not even the creator can edit or delete a call directly", async () => {
    await assertFails(updateDoc(doc(as("maya"), "predictions/p1"), { status: "resolved", outcome: "yes" }));
    await assertFails(deleteDoc(doc(as("maya"), "predictions/p1")));
  });

  it("disputes and votes go through the server too, nobody can stuff the ballot", async () => {
    await assertFails(updateDoc(doc(as("maya"), "predictions/p1"), { status: "disputed", disputedAt: Date.now() }));
    await assertFails(updateDoc(doc(as("maya"), "predictions/p1"), { "votes.maya": "yes" }));
  });

  it("you can't move a call into another arena", async () => {
    await assertFails(updateDoc(doc(as("maya"), "predictions/p1"), { arenaId: "roommates" }));
  });
});

describe("positions", () => {
  it("members can see who picked which side", async () => {
    await assertSucceeds(getDoc(doc(as("maya"), "predictions/p1/positions/jake")));
    await assertSucceeds(getDocs(collection(as("maya"), "predictions/p1/positions")));
  });

  it("you can't see sides on a call in an arena you're not in", async () => {
    await assertFails(getDoc(doc(as("sam"), "predictions/p1/positions/jake")));
    await assertFails(getDocs(collection(as("sam"), "predictions/p1/positions")));
  });

  it("you can find all your own positions across calls", async () => {
    await assertSucceeds(getDocs(query(collectionGroup(as("jake"), "positions"), where("uid", "==", "jake"))));
  });

  it("you can't search for someone else's positions across calls", async () => {
    await assertFails(getDocs(query(collectionGroup(as("sam"), "positions"), where("uid", "==", "jake"))));
    await assertFails(getDocs(collectionGroup(as("sam"), "positions")));
  });

  it("signed out people can't see positions", async () => {
    await assertFails(getDoc(doc(signedOut(), "predictions/p1/positions/jake")));
  });

  it("you can't pick a side directly and skip paying tokens", async () => {
    await assertFails(
      setDoc(doc(as("maya"), "predictions/p1/positions/maya"), { uid: "maya", predictionId: "p1", arenaId: "third", side: "yes", stake: 10 })
    );
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
        arenaId: "third",
        createdAt: now - 2 * day,
        deadline: now + day,
      });
    });
    await assertFails(
      setDoc(doc(as("jake"), "predictions/late/positions/jake"), {
        uid: "jake",
        predictionId: "late",
        arenaId: "third",
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

describe("trash talk", () => {
  // what the app sends: who, what, and the server's clock. a quick reaction is a message with no text
  const reaction = (uid: string, type: string) => ({ uid, text: "", reaction: type, createdAt: serverTimestamp(), edited: false });
  const comment = (uid: string, text: string) => ({ uid, text, createdAt: serverTimestamp(), edited: false });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "predictions/p1/comments/r1"), { uid: "jake", text: "", reaction: "cap", createdAt: new Date(), edited: false });
      await setDoc(doc(db, "predictions/p1/comments/c1"), { uid: "jake", text: "screenshot this", createdAt: new Date(), edited: false });
      // a call the person it was about took down (the text gets wiped)
      await setDoc(doc(db, "predictions/gone"), { text: "", creatorId: "maya", status: "void", arenaId: "third" });
    });
  });

  it("members can post quick reactions in the thread and delete their own", async () => {
    await assertSucceeds(setDoc(doc(as("maya"), "predictions/p1/comments/r2"), reaction("maya", "noshot")));
    await assertSucceeds(deleteDoc(doc(as("maya"), "predictions/p1/comments/r2")));
    await assertFails(deleteDoc(doc(as("maya"), "predictions/p1/comments/r1")));
    await assertSucceeds(deleteDoc(doc(as("jake"), "predictions/p1/comments/r1")));
  });

  // exactly what TrashTalk.tsx sends when you tap a quick reaction: a new message with an auto id
  it("tapping a quick reaction on an open call posts it to the thread", async () => {
    const thread = collection(as("maya"), "predictions/p1/comments");
    for (const type of ["noshot", "lockit", "cap"]) {
      await assertSucceeds(addDoc(thread, { uid: "maya", text: "", reaction: type, createdAt: serverTimestamp(), edited: false }));
    }
    // the old shape (one reaction per person, "type" instead of "reaction") doesn't go through
    await assertFails(addDoc(thread, { uid: "maya", type: "lockit", createdAt: serverTimestamp() }));
  });

  it("members can see the thread", async () => {
    await assertSucceeds(getDocs(collection(as("maya"), "predictions/p1/comments")));
  });

  it("people outside the arena can't see or add to it", async () => {
    await assertFails(getDocs(collection(as("sam"), "predictions/p1/comments")));
    await assertFails(setDoc(doc(as("sam"), "predictions/p1/comments/r2"), reaction("sam", "cap")));
    await assertFails(setDoc(doc(as("sam"), "predictions/p1/comments/c2"), comment("sam", "hi")));
    await assertFails(getDocs(collection(signedOut(), "predictions/p1/comments")));
  });

  it("you can't react as someone else", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/r2"), reaction("jake", "noshot")));
  });

  it("only the three quick reactions, with no text and nothing extra on them", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/r2"), reaction("maya", "fire")));
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/r2"), { ...reaction("maya", "cap"), text: "and more" }));
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/r2"), { ...reaction("maya", "cap"), glory: 999 }));
  });

  it("a quick reaction can't be edited into something else", async () => {
    await assertFails(updateDoc(doc(as("jake"), "predictions/p1/comments/r1"), { text: "sneaky edit", edited: true }));
  });

  it("the old one-reaction-per-person spot is closed", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/reactions/maya"), { uid: "maya", type: "cap", createdAt: serverTimestamp() }));
  });

  it("you can't backdate a reaction or comment", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/r2"), { ...reaction("maya", "cap"), createdAt: new Date(2000, 0, 1) }));
    await assertFails(
      setDoc(doc(as("maya"), "predictions/p1/comments/c2"), { uid: "maya", text: "hi", createdAt: new Date(2000, 0, 1), edited: false })
    );
  });

  it("comments have to be 1 to 200 characters", async () => {
    await assertSucceeds(setDoc(doc(as("maya"), "predictions/p1/comments/c2"), comment("maya", "he hasn't seen an 8am since September")));
    await assertSucceeds(setDoc(doc(as("maya"), "predictions/p1/comments/c3"), comment("maya", "x".repeat(200))));
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/c4"), comment("maya", "x".repeat(201))));
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/c5"), comment("maya", "")));
  });

  it("you can't comment as someone else", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/p1/comments/c2"), comment("jake", "I'm Jake")));
  });

  it("you can edit and delete your own comment, nobody else's", async () => {
    await assertSucceeds(updateDoc(doc(as("jake"), "predictions/p1/comments/c1"), { text: "screenshot this. I'm locked in", edited: true }));
    await assertFails(updateDoc(doc(as("maya"), "predictions/p1/comments/c1"), { text: "Jake is wrong", edited: true }));
    await assertFails(deleteDoc(doc(as("maya"), "predictions/p1/comments/c1")));
    await assertSucceeds(deleteDoc(doc(as("jake"), "predictions/p1/comments/c1")));
  });

  it("editing can only change the text, and not past 200 characters", async () => {
    await assertFails(updateDoc(doc(as("jake"), "predictions/p1/comments/c1"), { uid: "maya", edited: true }));
    await assertFails(updateDoc(doc(as("jake"), "predictions/p1/comments/c1"), { text: "x".repeat(201), edited: true }));
    await assertFails(updateDoc(doc(as("jake"), "predictions/p1/comments/c1"), { createdAt: new Date(), edited: true }));
  });

  it("nobody can react or comment on a call the subject took down", async () => {
    await assertFails(setDoc(doc(as("maya"), "predictions/gone/comments/r1"), reaction("maya", "cap")));
    await assertFails(setDoc(doc(as("maya"), "predictions/gone/comments/c1"), comment("maya", "lol")));
  });
});

describe("public previews of shared calls", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "previews/p1"), { arenaName: "Third Floor", text: "Jake skips class" });
    });
  });

  it("a signed-out person can read a call's preview, but not the call itself", async () => {
    await assertSucceeds(getDoc(doc(signedOut(), "previews/p1")));
    await assertFails(getDoc(doc(signedOut(), "predictions/p1")));
    await assertFails(getDocs(collection(signedOut(), "predictions/p1/positions")));
    await assertFails(getDocs(collection(signedOut(), "predictions/p1/comments")));
  });

  it("nobody can list every preview to go looking for calls", async () => {
    await assertFails(getDocs(collection(signedOut(), "previews")));
    await assertFails(getDocs(collection(as("maya"), "previews")));
  });

  it("only Cloud Functions write previews", async () => {
    await assertFails(setDoc(doc(signedOut(), "previews/p2"), { arenaName: "Fake", text: "made up" }));
    await assertFails(setDoc(doc(as("maya"), "previews/p1"), { arenaName: "Third Floor", text: "edited" }));
    await assertFails(deleteDoc(doc(as("maya"), "previews/p1")));
  });
});

describe("everything else", () => {
  it("is locked until we build it", async () => {
    await assertFails(setDoc(doc(as("maya"), "groups/g1"), { name: "hi" }));
    await assertFails(getDoc(doc(as("maya"), "groups/g1")));
  });
});
