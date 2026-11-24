import { describe, it, expect } from "vitest";
import { Position, Prediction, User } from "./types";
import {
  stakeFactor,
  contrarianScore,
  gloryForWin,
  gloryForLoss,
  applyGlory,
  leaderboardScore,
} from "./glory";
import { dailyGrant, splitPot } from "./tokens";
import {
  canCreate,
  canTakeSide,
  hasNoTakers,
  resolveWindowExpired,
  settle,
  refundAll,
  tallyVotes,
} from "./resolve";
import { deadlineFromPreset, validateNewCall, NewCall } from "./calls";

// little helpers so tests are shorter
const pos = (uid: string, side: "yes" | "no", stake: number): Position => ({
  uid,
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
  groupId: null,
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
  friendIds: [],
  lastGrantDate: "2026-11-19",
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
    expect(gloryForWin(50, 1)).toBe(12);
    expect(gloryForWin(50, 0)).toBe(2);
  });

  it("losing costs less than winning gives", () => {
    expect(gloryForLoss(50)).toBe(5);
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
    expect(canTakeSide(p, u, 10, false, 11 * DAY)).toBe("The deadline already passed");
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
    expect(owen.gloryChange).toBe(12);
    expect(owen.tokenChange).toBe(200);
    expect(maya.won).toBe(false);
    expect(maya.gloryChange).toBe(-5);
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
