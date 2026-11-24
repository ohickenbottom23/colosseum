import { Payout, Position, Prediction, Side, User, VoidReason } from "./types";
import { RESOLVE_WINDOW_MS } from "./constants";
import { contrarianScore, gloryForWin, gloryForLoss, applyGlory } from "./glory";
import { splitPot } from "./tokens";

// ---------- checks for creating and joining ----------

export function canCreate(creatorId: string, subjectId: string | null): boolean {
  // you can't make a call about yourself
  return subjectId !== creatorId;
}

export function canTakeSide(
  prediction: Prediction,
  user: User,
  stake: number,
  alreadyHasPosition: boolean,
  now: number
): string | null {
  if (prediction.status !== "open") return "This call isn't open anymore";
  if (now >= prediction.deadline) return "The deadline already passed";
  if (alreadyHasPosition) return "You already picked a side";
  if (!Number.isInteger(stake) || stake < 1) return "Stake has to be at least 1 token";
  if (stake > user.tokens) return "You don't have enough tokens";
  return null; // null means it's fine
}

// ---------- void rules ----------

// if nobody besides the creator joined, the call doesn't count
export function hasNoTakers(prediction: Prediction, positions: Position[]): boolean {
  return positions.every((p) => p.uid === prediction.creatorId);
}

export function resolveWindowExpired(prediction: Prediction, now: number): boolean {
  if (prediction.status === "resolved" || prediction.status === "void") return false;
  return now > prediction.deadline + RESOLVE_WINDOW_MS;
}

// what should happen to an open call nobody has settled. null means leave it alone
export function sweepDecision(prediction: Prediction, positions: Position[], now: number): VoidReason | null {
  if (prediction.status !== "open") return null;
  if (now < prediction.deadline) return null;
  // nothing to settle if nobody else joined, so void it right at the deadline
  if (hasNoTakers(prediction, positions)) return "no_takers";
  if (resolveWindowExpired(prediction, now)) return "not_resolved";
  return null;
}

// ---------- settling ----------

export function canResolve(prediction: Prediction, uid: string, now: number): string | null {
  if (uid !== prediction.creatorId) return "Only the person who made the call can settle it";
  if (prediction.status !== "open") return "This call is already settled";
  if (now < prediction.deadline) return "You can settle this after the deadline";
  if (resolveWindowExpired(prediction, now)) return "Too late, the 48 hours to settle this are up";
  return null;
}

type Stats = Pick<User, "tokens" | "glory" | "wins" | "calls">;

// a player's numbers after a call ends. refunds give tokens back but don't count as a played call
export function applyPayout(user: Stats, payout: Payout, counted = true): Stats {
  return {
    tokens: user.tokens + payout.tokenChange,
    glory: applyGlory(user.glory, payout.gloryChange),
    wins: user.wins + (counted && payout.won ? 1 : 0),
    calls: user.calls + (counted ? 1 : 0),
  };
}

export function refundAll(positions: Position[]): Payout[] {
  return positions.map((p) => ({
    uid: p.uid,
    tokenChange: p.stake,
    gloryChange: 0,
    won: false,
  }));
}

export function settle(positions: Position[], outcome: Side): Payout[] {
  const tokenReturns = splitPot(positions, outcome);

  return positions.map((p) => {
    const won = p.side === outcome;
    let gloryChange;

    if (won) {
      const contrarian = contrarianScore(p.uid, p.side, positions);
      gloryChange = gloryForWin(p.stake, contrarian);
    } else {
      gloryChange = -gloryForLoss(p.stake);
    }

    return {
      uid: p.uid,
      tokenChange: tokenReturns.get(p.uid) ?? 0,
      gloryChange,
      won,
    };
  });
}

// ---------- the subject taking a call down ----------

// only the person a call is about can take it down, and only before it's settled
export function canDelete(prediction: Prediction, uid: string): string | null {
  if (!prediction.subjectId || prediction.subjectId !== uid) return "Only the person this call is about can take it down";
  if (prediction.status !== "open") return "This call is already over";
  return null;
}

// everyone gets their stake back except the subject. otherwise you could back a side
// on a call about yourself, see you're losing, and take it down to get out free
export function deletePayouts(positions: Position[], subjectId: string): Payout[] {
  return refundAll(positions).map((p) => (p.uid === subjectId ? { ...p, tokenChange: 0 } : p));
}

// ---------- disputes ----------

// participants vote on what actually happened. tie = void
export function tallyVotes(votes: Side[]): Side | "void" {
  const yes = votes.filter((v) => v === "yes").length;
  const no = votes.length - yes;
  if (yes > no) return "yes";
  if (no > yes) return "no";
  return "void";
}
