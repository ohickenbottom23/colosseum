import { Payout, Position, Prediction, RankResult, Side } from "./types";
import { DISPUTE_WINDOW_MS, VOTE_WINDOW_MS } from "./constants";
import { applyGlory } from "./glory";
import { Player, playerAfter, refundAll, settle, tallyVotes } from "./resolve";

// anyone who picked a side can dispute a settled call, for 24 hours after it's settled.
// a call only gets one dispute
export function canDispute(call: Prediction, uid: string, pickedASide: boolean, now: number): string | null {
  if (!pickedASide) return "Only people who picked a side can dispute it";
  if (call.status === "disputed") return "This call is already being disputed";
  if (call.status !== "resolved") return "Only a settled call can be disputed";
  if (call.disputedAt) return "This call was already disputed once";
  if (now > (call.resolvedAt ?? 0) + DISPUTE_WINDOW_MS) return "The 24 hours to dispute this are up";
  return null;
}

// the votes a dispute starts with: the creator settled it one way, and whoever disputed it
// says the other. (if the creator disputes their own result, they're saying the other way)
export function openingVotes(call: Prediction, disputerUid: string): Record<string, Side> {
  const other: Side = call.outcome === "yes" ? "no" : "yes";
  return { [call.creatorId]: call.outcome as Side, [disputerUid]: other };
}

export function votingEndsAt(call: Prediction): number {
  return (call.disputedAt ?? 0) + VOTE_WINDOW_MS;
}

export function canVote(call: Prediction, uid: string, pickedASide: boolean, now: number): string | null {
  if (call.status !== "disputed") return "There's no vote on this call";
  if (!pickedASide) return "Only people who picked a side can vote";
  if (call.votes?.[uid]) return "You already voted";
  if (now > votingEndsAt(call)) return "Voting is over";
  return null;
}

// the vote ends once everyone who picked a side has voted, or the 24 hours are up
export function voteIsOver(call: Prediction, positions: Position[], now: number): boolean {
  if (call.status !== "disputed") return false;
  const votes = call.votes ?? {};
  return positions.every((p) => votes[p.uid]) || now > votingEndsAt(call);
}

// how a finished vote comes out: the result stands, it flips, or a tie voids the call
export function disputeResult(call: Prediction): "upheld" | "flipped" | "void" {
  const tally = tallyVotes(Object.values(call.votes ?? {}));
  if (tally === "void") return "void";
  return tally === call.outcome ? "upheld" : "flipped";
}

// everyone's new payouts after a vote changes the result
export function payoutsAfterVote(positions: Position[], call: Prediction, result: "flipped" | "void"): Payout[] {
  if (result === "void") return refundAll(positions);
  return settle(positions, call.outcome === "yes" ? "no" : "yes");
}

// take back what the first result did to someone, then apply the new one.
// counted = false for a tied vote, which just refunds stakes like any voided call
export function redoResult(
  user: Player,
  old: { result: Payout; rankResult: RankResult },
  newPayout: Payout,
  counted: boolean
): { player: Player; rankResult: RankResult | null } {
  // glory goes back by what really moved (the floor can make that less than the payout said)
  const gloryMoved = old.rankResult.gloryAfter - old.rankResult.gloryBefore;
  // rank goes back too, unless something else has moved it since
  const rankUntouched = user.rankTier === old.rankResult.after && user.onTheLine === old.rankResult.onTheLine;

  const undone: Player = {
    tokens: user.tokens - old.result.tokenChange,
    glory: applyGlory(user.glory, -gloryMoved),
    wins: user.wins - (old.result.won ? 1 : 0),
    calls: user.calls - 1,
    rankTier: rankUntouched ? old.rankResult.before : user.rankTier,
    onTheLine: rankUntouched ? old.rankResult.onTheLineBefore ?? false : user.onTheLine,
  };

  const redone = playerAfter(undone, newPayout, counted);
  // tokens they already spent can't come back, so it stops at 0
  return { ...redone, player: { ...redone.player, tokens: Math.max(0, redone.player.tokens) } };
}
