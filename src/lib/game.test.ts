import { describe, it, expect } from "vitest";
import { Position, Prediction, User } from "./types";
import {
  stakeFactor,
  contrarianScore,
  gloryForWin,
  gloryForLoss,
  applyGlory,
  leaderboardScore,
  rankPlayers,
} from "./glory";
import { dailyGrant, splitPot, isValidTimeZone, localDate, pickTimeZone } from "./tokens";
import {
  canCreate,
  canTakeSide,
  picksCloseAt,
  hasNoTakers,
  resolveWindowExpired,
  settle,
  refundAll,
  tallyVotes,
  canResolve,
  applyPayout,
  sweepDecision,
  canDelete,
  deletePayouts,
  previewIfRight,
} from "./resolve";
import { deadlineFromPreset, validateNewCall, NewCall } from "./calls";
import { validateArenaName, isMember, canJoinArena, canMakeArena } from "./arenas";
import { REACTIONS, countReactions, tapReaction, validateComment, isReactionType } from "./trashTalk";
import { tierForGlory, rankName, progressToNext, nextRankState, rankOutlook, sideMultiplier, formatMultiplier } from "./ranks";

// little helpers so tests are shorter
const pos = (uid: string, side: "yes" | "no", stake: number): Position => ({
  uid,
  predictionId: "p1",
  arenaId: "a1",
  side,
  stake,
  createdAt: 0,
});

const DAY = 24 * 60 * 60 * 1000;

const makePrediction = (overrides: Partial<Prediction> = {}): Prediction => ({
  id: "p1",
  text: "Owen hits the gym 4 times this week",
  creatorId: "maya",
  subjectId: "owen",
  subjectLabel: null,
  arenaId: "a1",
  deadline: 10 * DAY,
  status: "open",
  outcome: null,
  voidReason: null,
  createdAt: 0,
  resolvedAt: null,
  ...overrides,
});

const makeUser = (overrides: Partial<User> = {}): User => ({
  uid: "jake",
  displayName: "Jake",
  photoURL: null,
  glory: 100,
  tokens: 50,
  wins: 0,
  calls: 0,
  missedResolves: 0,
  arenaIds: ["a1"],
  lastGrantDate: "2026-11-19",
  timeZone: "America/Chicago",
  timeZoneChangedAt: 0,
  rankTier: 1,
  onTheLine: false,
  createdAt: 0,
  ...overrides,
});

describe("glory", () => {
  it("stake factor is 1 at a full day of tokens and caps at 2", () => {
    expect(stakeFactor(50)).toBe(1);
    expect(stakeFactor(25)).toBe(0.5);
    expect(stakeFactor(500)).toBe(2);
  });

  it("contrarian is 1 when you're alone and 0 when everyone agrees", () => {
    const alone = [pos("a", "yes", 10), pos("b", "no", 10), pos("c", "no", 10), pos("d", "no", 10)];
    expect(contrarianScore("a", "yes", alone)).toBe(1);

    const unanimous = [pos("a", "yes", 10), pos("b", "yes", 10)];
    expect(contrarianScore("a", "yes", unanimous)).toBe(0);
  });

  it("being right alone pays way more than being right with the crowd", () => {
    expect(gloryForWin(50, 1)).toBe(60);
    expect(gloryForWin(50, 0)).toBe(10);
  });

  it("a 10 token win moves glory a real amount", () => {
    // 10 tokens is a stake factor of 0.2
    expect(gloryForWin(10, 0)).toBe(2); // with the crowd
    expect(gloryForWin(10, 0.5)).toBe(7); // half against you
    expect(gloryForWin(10, 1)).toBe(12); // alone
    expect(gloryForLoss(10)).toBe(5);
  });

  it("losing costs less than winning gives", () => {
    expect(gloryForLoss(50)).toBe(25);
    expect(gloryForLoss(50)).toBeLessThan(gloryForWin(50, 0.5));
  });

  it("tiny stakes still cost something when you lose", () => {
    expect(gloryForLoss(4)).toBeGreaterThan(0);
    expect(gloryForLoss(1)).toBeGreaterThan(0);
  });

  it("glory never drops below the floor", () => {
    expect(applyGlory(102, -5)).toBe(100);
    expect(applyGlory(100, -5)).toBe(100);
    expect(applyGlory(100, 12)).toBe(112);
  });

  it("leaderboard puts a proven player above a lucky new one", () => {
    const newGuy = leaderboardScore({ glory: 102, wins: 1, calls: 1 });
    const veteran = leaderboardScore({ glory: 140, wins: 35, calls: 50 });
    expect(veteran).toBeGreaterThan(newGuy);
  });
});

describe("tokens", () => {
  it("daily grant only happens once a day", () => {
    expect(dailyGrant(20, "2026-11-20", "2026-11-20")).toBe(20);
    expect(dailyGrant(20, "2026-11-19", "2026-11-20")).toBe(70);
  });

  it("daily grant stops at the cap", () => {
    expect(dailyGrant(180, "2026-11-19", "2026-11-20")).toBe(200);
    expect(dailyGrant(300, "2026-11-19", "2026-11-20")).toBe(300);
  });

  it("winners split the losers pot by how much they staked", () => {
    const positions = [pos("a", "yes", 10), pos("b", "yes", 30), pos("c", "no", 20), pos("d", "no", 20)];
    const returns = splitPot(positions, "yes");
    expect(returns.get("a")).toBe(20);
    expect(returns.get("b")).toBe(60);
    expect(returns.get("c")).toBe(0);
    expect(returns.get("d")).toBe(0);
  });

  it("if nobody picked the right side everybody loses their stake", () => {
    const positions = [pos("a", "no", 10), pos("b", "no", 30)];
    const returns = splitPot(positions, "yes");
    expect(returns.get("a")).toBe(0);
    expect(returns.get("b")).toBe(0);
  });

  it("never pays out more than was put in", () => {
    const positions = [pos("a", "yes", 1), pos("b", "yes", 1), pos("c", "yes", 1), pos("d", "no", 10)];
    const returns = splitPot(positions, "yes");
    const paidOut = [...returns.values()].reduce((s, x) => s + x, 0);
    expect(paidOut).toBeLessThanOrEqual(13);
  });
});

describe("creating and joining", () => {
  it("you can't make a call about yourself", () => {
    expect(canCreate("owen", "owen")).toBe(false);
    expect(canCreate("maya", "owen")).toBe(true);
    expect(canCreate("maya", null)).toBe(true);
  });

  it("blocks bad joins", () => {
    const p = makePrediction();
    const u = makeUser();
    expect(canTakeSide(p, u, 10, false, DAY)).toBeNull();
    expect(canTakeSide(p, u, 10, true, DAY)).toBe("You already picked a side");
    expect(canTakeSide(p, u, 0, false, DAY)).toBe("Stake has to be at least 1 token");
    expect(canTakeSide(p, u, 2.5, false, DAY)).toBe("Stake has to be at least 1 token");
    expect(canTakeSide(p, u, 51, false, DAY)).toBe("You don't have enough tokens");
    expect(canTakeSide(p, u, 10, false, 11 * DAY)).toBe("Picks are closed for this call");
  });

  it("picks close halfway between posting and the deadline", () => {
    // posted at 0, deadline at 10 days, so picks close at 5 days
    const p = makePrediction();
    const u = makeUser();
    expect(picksCloseAt(p)).toBe(5 * DAY);
    expect(canTakeSide(p, u, 10, false, 5 * DAY - 1)).toBeNull();
    expect(canTakeSide(p, u, 10, false, 5 * DAY)).toBe("Picks are closed for this call");
    expect(canTakeSide(p, u, 10, false, 8 * DAY)).toBe("Picks are closed for this call");
  });

  it("halfway is measured from when the call was posted", () => {
    // posted at day 4, deadline at day 10, so picks close at day 7
    const p = makePrediction({ createdAt: 4 * DAY });
    expect(picksCloseAt(p)).toBe(7 * DAY);
    expect(canTakeSide(p, makeUser(), 10, false, 6 * DAY)).toBeNull();
    expect(canTakeSide(p, makeUser(), 10, false, 7 * DAY)).toBe("Picks are closed for this call");
  });

  it("the resolve window still starts at the deadline, not when picks close", () => {
    const p = makePrediction();
    expect(resolveWindowExpired(p, 5 * DAY + 49 * 60 * 60 * 1000)).toBe(false);
    expect(canResolve(p, "maya", 6 * DAY)).toBe("You can settle this after the deadline");
  });

  it("the subject can take a side on a call about them", () => {
    const p = makePrediction();
    const owen = makeUser({ uid: "owen" });
    expect(canTakeSide(p, owen, 10, false, DAY)).toBeNull();
  });
});

describe("void rules", () => {
  it("voids when only the creator played", () => {
    const p = makePrediction();
    expect(hasNoTakers(p, [])).toBe(true);
    expect(hasNoTakers(p, [pos("maya", "yes", 10)])).toBe(true);
    expect(hasNoTakers(p, [pos("maya", "yes", 10), pos("jake", "no", 10)])).toBe(false);
  });

  it("one taker is enough even if the creator sat out", () => {
    const p = makePrediction();
    expect(hasNoTakers(p, [pos("jake", "no", 10)])).toBe(false);
  });

  it("resolve window closes 48 hours after the deadline", () => {
    const p = makePrediction({ status: "closed" });
    expect(resolveWindowExpired(p, 10 * DAY + 47 * 60 * 60 * 1000)).toBe(false);
    expect(resolveWindowExpired(p, 10 * DAY + 49 * 60 * 60 * 1000)).toBe(true);
  });

  it("refunds give everyone their stake back with no glory change", () => {
    const payouts = refundAll([pos("a", "yes", 10), pos("b", "no", 25)]);
    expect(payouts.map((x) => x.tokenChange)).toEqual([10, 25]);
    expect(payouts.every((x) => x.gloryChange === 0)).toBe(true);
  });
});

describe("full settle", () => {
  it("contrarian winner gets the biggest glory bump", () => {
    const positions = [pos("owen", "yes", 50), pos("maya", "no", 50), pos("jake", "no", 50), pos("sam", "no", 50)];
    const payouts = settle(positions, "yes");
    const owen = payouts.find((x) => x.uid === "owen")!;
    const maya = payouts.find((x) => x.uid === "maya")!;

    expect(owen.won).toBe(true);
    expect(owen.gloryChange).toBe(60);
    expect(owen.tokenChange).toBe(200);
    expect(maya.won).toBe(false);
    expect(maya.gloryChange).toBe(-25);
    expect(maya.tokenChange).toBe(0);
  });
});

describe("disputes", () => {
  it("majority wins, tie voids", () => {
    expect(tallyVotes(["yes", "yes", "no"])).toBe("yes");
    expect(tallyVotes(["no", "no", "yes"])).toBe("no");
    expect(tallyVotes(["yes", "no"])).toBe("void");
  });
});

describe("deadlines", () => {
  // Wednesday Nov 25 2026, 3pm local time
  const wed = new Date(2026, 10, 25, 15, 0);

  it("tonight is 11:59pm today", () => {
    expect(deadlineFromPreset("tonight", wed)).toBe(new Date(2026, 10, 25, 23, 59).getTime());
  });

  it("this week ends Sunday night", () => {
    expect(deadlineFromPreset("week", wed)).toBe(new Date(2026, 10, 29, 23, 59).getTime());
  });

  it("on a Sunday, this week is tonight", () => {
    const sun = new Date(2026, 10, 29, 10, 0);
    expect(deadlineFromPreset("week", sun)).toBe(new Date(2026, 10, 29, 23, 59).getTime());
  });

  it("this month ends on the last day, even across the year", () => {
    expect(deadlineFromPreset("month", wed)).toBe(new Date(2026, 10, 30, 23, 59).getTime());
    const dec = new Date(2026, 11, 3, 9, 0);
    expect(deadlineFromPreset("month", dec)).toBe(new Date(2026, 11, 31, 23, 59).getTime());
  });

  it("custom is 11:59pm on the picked date", () => {
    expect(deadlineFromPreset("custom", wed, "2026-12-05")).toBe(new Date(2026, 11, 5, 23, 59).getTime());
  });
});

describe("making a call", () => {
  const now = 1000 * DAY;
  const good: NewCall = { text: "Owen hits the gym 4 times", subjectId: "owen", subjectLabel: null, deadline: now + DAY };

  it("a normal call is fine", () => {
    expect(validateNewCall(good, "maya", now)).toBeNull();
    expect(validateNewCall({ ...good, subjectId: null, subjectLabel: "the weather" }, "maya", now)).toBeNull();
  });

  it("needs some text, but not an essay", () => {
    expect(validateNewCall({ ...good, text: "   " }, "maya", now)).toBe("Write your call first");
    expect(validateNewCall({ ...good, text: "x".repeat(201) }, "maya", now)).toBe("Keep it under 200 characters");
  });

  it("has to be about exactly one thing", () => {
    expect(validateNewCall({ ...good, subjectId: null }, "maya", now)).toBe("Pick who or what it's about");
    expect(validateNewCall({ ...good, subjectLabel: "the weather" }, "maya", now)).toBe("Pick who or what it's about");
    expect(validateNewCall({ ...good, subjectId: null, subjectLabel: "  " }, "maya", now)).toBe("Pick who or what it's about");
  });

  it("you can't make a call about yourself", () => {
    expect(validateNewCall(good, "owen", now)).toBe("You can't make a call about yourself");
  });

  it("deadline has to be a little in the future, but not too far", () => {
    expect(validateNewCall({ ...good, deadline: now - DAY }, "maya", now)).toBe("The deadline has to be at least 10 minutes away");
    expect(validateNewCall({ ...good, deadline: now + 5 * 60 * 1000 }, "maya", now)).toBe("The deadline has to be at least 10 minutes away");
    expect(validateNewCall({ ...good, deadline: now + 400 * DAY }, "maya", now)).toBe("The deadline can't be more than a year away");
    expect(validateNewCall({ ...good, deadline: NaN }, "maya", now)).toBe("Pick a deadline");
  });
});

describe("settling a call", () => {
  const HOUR = 60 * 60 * 1000;
  const p = makePrediction(); // maya made it, deadline at 10 days

  it("only the creator can settle, and only after the deadline", () => {
    expect(canResolve(p, "maya", 10 * DAY + HOUR)).toBeNull();
    expect(canResolve(p, "jake", 10 * DAY + HOUR)).toBe("Only the person who made the call can settle it");
    expect(canResolve(p, "maya", 9 * DAY)).toBe("You can settle this after the deadline");
  });

  it("can't settle twice or after the 48 hours", () => {
    expect(canResolve({ ...p, status: "resolved" }, "maya", 10 * DAY + HOUR)).toBe("This call is already settled");
    expect(canResolve({ ...p, status: "void" }, "maya", 10 * DAY + HOUR)).toBe("This call is already settled");
    expect(canResolve(p, "maya", 10 * DAY + 49 * HOUR)).toBe("Too late, the 48 hours to settle this are up");
  });

  it("a win adds tokens, glory, a win, and a played call", () => {
    const after = applyPayout({ tokens: 10, glory: 100, wins: 2, calls: 5 }, { uid: "a", tokenChange: 40, gloryChange: 12, won: true });
    expect(after).toEqual({ tokens: 50, glory: 112, wins: 3, calls: 6 });
  });

  it("a loss counts as a played call and glory stops at the floor", () => {
    const after = applyPayout({ tokens: 10, glory: 102, wins: 2, calls: 5 }, { uid: "a", tokenChange: 0, gloryChange: -5, won: false });
    expect(after).toEqual({ tokens: 10, glory: 100, wins: 2, calls: 6 });
  });

  it("a refund gives tokens back but doesn't count as a played call", () => {
    const after = applyPayout({ tokens: 10, glory: 100, wins: 2, calls: 5 }, { uid: "a", tokenChange: 25, gloryChange: 0, won: false }, false);
    expect(after).toEqual({ tokens: 35, glory: 100, wins: 2, calls: 5 });
  });
});

describe("voiding on its own", () => {
  const HOUR = 60 * 60 * 1000;
  const p = makePrediction(); // maya made it, deadline at 10 days
  const joined = [pos("maya", "yes", 10), pos("jake", "no", 10)];

  it("leaves calls alone before the deadline", () => {
    expect(sweepDecision(p, [], 9 * DAY)).toBeNull();
  });

  it("voids right at the deadline if nobody but the creator joined", () => {
    expect(sweepDecision(p, [pos("maya", "yes", 10)], 10 * DAY + HOUR)).toBe("no_takers");
    expect(sweepDecision(p, [], 10 * DAY + HOUR)).toBe("no_takers");
  });

  it("gives the creator 48 hours, then voids", () => {
    expect(sweepDecision(p, joined, 10 * DAY + 47 * HOUR)).toBeNull();
    expect(sweepDecision(p, joined, 10 * DAY + 49 * HOUR)).toBe("not_resolved");
  });

  it("leaves settled calls alone", () => {
    expect(sweepDecision({ ...p, status: "resolved" }, joined, 10 * DAY + 49 * HOUR)).toBeNull();
  });
});

describe("timezones for the daily grant", () => {
  const WEEK = 7 * DAY;

  it("the same moment can be a different day in different places", () => {
    const t = Date.UTC(2026, 10, 24, 3, 0); // 3am UTC on Nov 24 is 9pm Nov 23 in Chicago
    expect(localDate(t, "UTC")).toBe("2026-11-24");
    expect(localDate(t, "America/Chicago")).toBe("2026-11-23");
  });

  it("handles daylight saving", () => {
    // 5:30am UTC on July 1 is 12:30am in Chicago in summer (it'd still be June 30 on winter time)
    expect(localDate(Date.UTC(2026, 6, 1, 5, 30), "America/Chicago")).toBe("2026-07-01");
  });

  it("knows real timezones from fake ones", () => {
    expect(isValidTimeZone("America/Chicago")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
  });

  it("new players get their phone's timezone, or Central if it's missing or fake", () => {
    expect(pickTimeZone(null, "America/New_York", 0, 0)).toEqual({ timeZone: "America/New_York", changed: true });
    expect(pickTimeZone(null, undefined, 0, 0)).toEqual({ timeZone: "America/Chicago", changed: true });
    expect(pickTimeZone(null, "Mars/Base", 0, 0)).toEqual({ timeZone: "America/Chicago", changed: true });
  });

  it("keeps the saved one if the phone matches or sends junk", () => {
    expect(pickTimeZone("America/Denver", "America/Denver", 0, WEEK * 2)).toEqual({ timeZone: "America/Denver", changed: false });
    expect(pickTimeZone("America/Denver", "Mars/Base", 0, WEEK * 2)).toEqual({ timeZone: "America/Denver", changed: false });
  });

  it("only lets you switch once a week", () => {
    const changedAt = 10 * DAY;
    expect(pickTimeZone("America/Denver", "Pacific/Auckland", changedAt, changedAt + DAY)).toEqual({ timeZone: "America/Denver", changed: false });
    expect(pickTimeZone("America/Denver", "Pacific/Auckland", changedAt, changedAt + WEEK)).toEqual({ timeZone: "Pacific/Auckland", changed: true });
  });
});

describe("leaderboard order", () => {
  it("a proven player ranks above a lucky new one", () => {
    const lucky = makeUser({ uid: "lucky", glory: 112, wins: 1, calls: 1 }); // 112 * 6/11 = 61
    const proven = makeUser({ uid: "proven", glory: 140, wins: 30, calls: 40 }); // 140 * 35/50 = 98
    const { ranked } = rankPlayers([lucky, proven]);
    expect(ranked.map((r) => r.user.uid)).toEqual(["proven", "lucky"]);
    expect(ranked.map((r) => r.score)).toEqual([98, 61]);
  });

  it("people who haven't played go at the bottom, even below people who played and lost", () => {
    const fresh = makeUser({ uid: "fresh", glory: 100, wins: 0, calls: 0 }); // would score 50
    const lost = makeUser({ uid: "lost", glory: 100, wins: 0, calls: 10 }); // scores 25
    const { ranked, notPlayed } = rankPlayers([fresh, lost]);
    expect(ranked.map((r) => r.user.uid)).toEqual(["lost"]);
    expect(ranked[0].rank).toBe(1);
    expect(notPlayed.map((u) => u.uid)).toEqual(["fresh"]);
  });

  it("ties on score go to more glory, then more calls", () => {
    // all three score 50
    const played = makeUser({ uid: "played", glory: 100, wins: 5, calls: 10 });
    const richer = makeUser({ uid: "richer", glory: 125, wins: 3, calls: 10 }); // 125 * 8/20 = 50
    const more = makeUser({ uid: "more", glory: 100, wins: 15, calls: 30 }); // 100 * 20/40 = 50
    const { ranked } = rankPlayers([played, more, richer]);
    expect(ranked.map((r) => r.user.uid)).toEqual(["richer", "more", "played"]);
  });

  it("tied scores share a rank", () => {
    const a = makeUser({ uid: "a", glory: 140, wins: 30, calls: 40 }); // 98
    const b = makeUser({ uid: "b", glory: 100, wins: 15, calls: 30 }); // 50
    const c = makeUser({ uid: "c", glory: 100, wins: 5, calls: 10 }); // 50
    const d = makeUser({ uid: "d", glory: 100, wins: 0, calls: 10 }); // 25
    expect(rankPlayers([d, c, b, a]).ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
  });

  it("an empty leaderboard is fine", () => {
    expect(rankPlayers([])).toEqual({ ranked: [], notPlayed: [] });
  });
});

describe("the subject taking a call down", () => {
  const p = makePrediction(); // maya made it, it's about owen

  it("only the person it's about can take it down", () => {
    expect(canDelete(p, "owen")).toBeNull();
    expect(canDelete(p, "maya")).toBe("Only the person this call is about can take it down");
    expect(canDelete(p, "jake")).toBe("Only the person this call is about can take it down");
  });

  it("calls about a label like the weather can't be taken down", () => {
    const weather = makePrediction({ subjectId: null, subjectLabel: "the weather" });
    expect(canDelete(weather, "owen")).toBe("Only the person this call is about can take it down");
    expect(canDelete(weather, "maya")).toBe("Only the person this call is about can take it down");
  });

  it("can't take down a call that's already over", () => {
    expect(canDelete({ ...p, status: "resolved" }, "owen")).toBe("This call is already over");
    expect(canDelete({ ...p, status: "void" }, "owen")).toBe("This call is already over");
  });

  it("everyone gets their stake back except the subject", () => {
    const payouts = deletePayouts([pos("owen", "no", 30), pos("maya", "yes", 10), pos("jake", "no", 25)], "owen");
    expect(payouts.map((x) => [x.uid, x.tokenChange])).toEqual([["owen", 0], ["maya", 10], ["jake", 25]]);
    expect(payouts.every((x) => x.gloryChange === 0 && !x.won)).toBe(true);
  });
});

describe("what you'd get if you're right", () => {
  const picks = [pos("maya", "yes", 10), pos("jake", "no", 30)];

  it("matches what settling would really pay you", () => {
    const preview = previewIfRight(picks, "owen", "yes", 20);
    const real = settle([...picks, pos("owen", "yes", 20)], "yes").find((x) => x.uid === "owen")!;
    expect(preview).toEqual(real);
    // stake back plus 2/3 of jake's 30, and glory for being half against the crowd
    expect(preview.tokenChange).toBe(40);
    expect(preview.gloryChange).toBe(14);
  });

  it("going against everyone pays more glory than going with them", () => {
    const withCrowd = previewIfRight(picks, "owen", "no", 20);
    const alone = previewIfRight([pos("maya", "yes", 10), pos("jake", "yes", 30)], "owen", "no", 20);
    expect(alone.gloryChange).toBeGreaterThan(withCrowd.gloryChange);
  });

  it("with nobody on the other side, you just get your stake back", () => {
    expect(previewIfRight([pos("maya", "yes", 10)], "owen", "yes", 20).tokenChange).toBe(20);
  });
});

describe("arenas", () => {
  it("needs a name, but not a long one", () => {
    expect(validateArenaName("Third Floor")).toBeNull();
    expect(validateArenaName("   ")).toBe("Give your arena a name");
    expect(validateArenaName("x".repeat(31))).toBe("Keep the name under 30 characters");
  });

  it("knows who's in it", () => {
    const arena = { memberIds: ["maya", "jake"] };
    expect(isMember(arena, "maya")).toBe(true);
    expect(isMember(arena, "sam")).toBe(false);
  });

  it("joining twice is fine, joining a full arena isn't", () => {
    expect(canJoinArena({ memberIds: ["maya"] }, "maya", ["a1"])).toBeNull();
    expect(canJoinArena({ memberIds: ["maya"] }, "jake", [])).toBeNull();
    const full = { memberIds: Array.from({ length: 50 }, (_, i) => `p${i}`) };
    expect(canJoinArena(full, "jake", [])).toBe("This arena is full");
    expect(canJoinArena(full, "p3", ["a1"])).toBeNull();
  });

  it("you can be in up to 30 arenas", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `a${i}`);
    expect(canMakeArena(thirty.slice(1))).toBeNull();
    expect(canMakeArena(thirty)).toBe("You're in too many arenas already");
    expect(canJoinArena({ memberIds: ["maya"] }, "jake", thirty)).toBe("You're in too many arenas already");
  });
});

describe("ranks", () => {
  it("each rank starts at its floor", () => {
    expect(tierForGlory(100)).toBe(1);
    expect(tierForGlory(149.9)).toBe(1);
    expect(tierForGlory(150)).toBe(2);
    expect(tierForGlory(250)).toBe(3);
    expect(tierForGlory(400)).toBe(4);
    expect(tierForGlory(600)).toBe(5);
    expect(tierForGlory(5000)).toBe(5);
    expect(rankName(2)).toBe("Gladiator");
  });

  it("knows how far you are from the next rank", () => {
    expect(progressToNext(148, 1)).toEqual({ nextName: "Gladiator", toGo: 2, progress: 0.96 });
    expect(progressToNext(173, 2).nextName).toBe("Centurion");
    expect(progressToNext(173, 2).toGo).toBe(77);
    expect(progressToNext(700, 5)).toEqual({ nextName: null, toGo: 0, progress: 1 });
    // under your rank's floor (on the line) counts as no progress
    expect(progressToNext(146, 2).progress).toBe(0);
  });
});

describe("rank changes after a settled call", () => {
  const recruit = { rankTier: 1, onTheLine: false };
  const gladiator = { rankTier: 2, onTheLine: false };
  const gladiatorOnTheLine = { rankTier: 2, onTheLine: true };

  it("climbing past a floor ranks you up right away, even skipping a rank", () => {
    expect(nextRankState(recruit, 151, true)).toEqual({ rankTier: 2, onTheLine: false, change: "up" });
    expect(nextRankState(recruit, 260, true)).toEqual({ rankTier: 3, onTheLine: false, change: "up" });
  });

  it("a loss that takes you under your floor puts you on the line, but you keep the rank", () => {
    expect(nextRankState(gladiator, 146, false)).toEqual({ rankTier: 2, onTheLine: true, change: "line" });
  });

  it("a loss that keeps you over your floor changes nothing", () => {
    expect(nextRankState(gladiator, 160, false)).toEqual({ rankTier: 2, onTheLine: false, change: null });
  });

  it("the next loss while on the line drops you", () => {
    expect(nextRankState(gladiatorOnTheLine, 128, false)).toEqual({ rankTier: 1, onTheLine: false, change: "down" });
  });

  it("a big drop can skip ranks, you land in the rank your glory is in", () => {
    expect(nextRankState({ rankTier: 4, onTheLine: true }, 240, false)).toEqual({ rankTier: 2, onTheLine: false, change: "down" });
  });

  it("a win clears the line, even if you're still under the floor", () => {
    expect(nextRankState(gladiatorOnTheLine, 149, true)).toEqual({ rankTier: 2, onTheLine: false, change: "cleared" });
    expect(nextRankState(gladiatorOnTheLine, 155, true)).toEqual({ rankTier: 2, onTheLine: false, change: "cleared" });
  });

  it("after a win clears it, the next loss under the floor puts you back on the line instead of dropping you", () => {
    const cleared = nextRankState(gladiatorOnTheLine, 149, true);
    expect(nextRankState(cleared, 144, false).change).toBe("line");
  });

  it("recruits can never be on the line, since glory can't go under 100", () => {
    expect(nextRankState(recruit, 100, false)).toEqual({ rankTier: 1, onTheLine: false, change: null });
  });

  it("the If you're right box knows when you'd rank up or drop", () => {
    // 148 glory, a 50 token win worth 10 would take you to 158: Gladiator
    expect(rankOutlook({ glory: 148, rankTier: 1, onTheLine: false }, 50, 10)).toEqual({ upTo: "Gladiator", dropTo: null });
    // on the line at 146, losing 50 tokens costs 25 glory: you'd drop to Recruit
    expect(rankOutlook({ glory: 146, rankTier: 2, onTheLine: true }, 50, 14)).toEqual({ upTo: null, dropTo: "Recruit" });
    // nothing changes either way
    expect(rankOutlook({ glory: 200, rankTier: 2, onTheLine: false }, 10, 2)).toEqual({ upTo: null, dropTo: null });
  });
});

describe("multipliers", () => {
  const picks = [pos("a", "yes", 30), pos("b", "yes", 20), pos("c", "no", 10)];

  it("is the whole pot over what's on that side", () => {
    expect(sideMultiplier(picks, "yes")).toBe(60 / 50);
    expect(sideMultiplier(picks, "no")).toBe(6);
    expect(formatMultiplier(60 / 50)).toBe("1.2x");
  });

  it("counts your stake when you preview a pick", () => {
    // adding 10 to no: pot 70, no side 20
    expect(sideMultiplier(picks, "no", { uid: "me", stake: 10 })).toBe(3.5);
    // adding 25 to yes: pot 85, yes side 75
    expect(sideMultiplier(picks, "yes", { uid: "me", stake: 25 })).toBeCloseTo(85 / 75);
  });

  it("nobody on a side yet means no multiplier, and alone on a side is 1.0x", () => {
    expect(sideMultiplier([pos("a", "yes", 10)], "no")).toBeNull();
    expect(sideMultiplier([pos("a", "yes", 10)], "yes")).toBe(1);
  });

  it("matches what settling really pays, give or take a token of rounding", () => {
    const cases = [
      { picks, me: 10, side: "no" as const },
      { picks, me: 25, side: "yes" as const },
      { picks: [pos("a", "no", 7), pos("b", "yes", 3), pos("c", "no", 11)], me: 13, side: "yes" as const },
      { picks: [pos("a", "no", 50)], me: 1, side: "yes" as const },
    ];
    for (const c of cases) {
      const m = sideMultiplier(c.picks, c.side, { uid: "me", stake: c.me })!;
      const real = settle([...c.picks, pos("me", c.side, c.me)], c.side).find((x) => x.uid === "me")!.tokenChange;
      expect(real).toBeLessThanOrEqual(c.me * m);
      expect(real).toBeGreaterThan(c.me * m - 1);
    }
  });
});

describe("trash talk", () => {
  it("has the three preset reactions", () => {
    expect(REACTIONS.map((r) => r.label)).toEqual(["No shot", "Lock it", "Cap"]);
    expect(isReactionType("cap")).toBe(true);
    expect(isReactionType("fire")).toBe(false);
  });

  it("counts reactions by type", () => {
    const reactions = [
      { uid: "a", type: "noshot" as const },
      { uid: "b", type: "noshot" as const },
      { uid: "c", type: "cap" as const },
    ];
    expect(countReactions(reactions)).toEqual({ noshot: 2, lockit: 0, cap: 1 });
    expect(countReactions([])).toEqual({ noshot: 0, lockit: 0, cap: 0 });
  });

  it("tapping picks, switches, or takes back your reaction", () => {
    expect(tapReaction(null, "cap")).toBe("cap");
    expect(tapReaction("cap", "lockit")).toBe("lockit");
    expect(tapReaction("cap", "cap")).toBeNull();
  });

  it("comments need some text, up to 200 characters", () => {
    expect(validateComment("he hasn't seen an 8am since September")).toBeNull();
    expect(validateComment("   ")).toBe("Write something first");
    expect(validateComment("x".repeat(200))).toBeNull();
    expect(validateComment("x".repeat(201))).toBe("Keep it under 200 characters");
    // spaces around it don't count
    expect(validateComment("  " + "x".repeat(200) + "  ")).toBeNull();
  });
});
