import { Position, Side, User } from "./types";
import { RANKS } from "./constants";
import { applyGlory, gloryForLoss } from "./glory";

// ---------- ranks ----------

export function rankName(tier: number): string {
  return RANKS[Math.min(Math.max(tier, 1), RANKS.length) - 1].name;
}

export function rankFloor(tier: number): number {
  return RANKS[Math.min(Math.max(tier, 1), RANKS.length) - 1].floor;
}

// the highest rank this much glory reaches
export function tierForGlory(glory: number): number {
  let tier = 1;
  for (const r of RANKS) if (glory >= r.floor) tier = r.tier;
  return tier;
}

// how close you are to the next rank, for the rank bar and "2 to Gladiator".
// legends have nowhere left to go
export function progressToNext(glory: number, tier: number): { nextName: string | null; toGo: number; progress: number } {
  if (tier >= RANKS.length) return { nextName: null, toGo: 0, progress: 1 };
  const floor = rankFloor(tier);
  const next = rankFloor(tier + 1);
  const progress = Math.min(Math.max((glory - floor) / (next - floor), 0), 1);
  return { nextName: rankName(tier + 1), toGo: Math.max(Math.ceil((next - glory) * 10) / 10, 0), progress };
}

export interface RankState {
  rankTier: number;
  onTheLine: boolean;
}

export type RankChange = "up" | "down" | "line" | "cleared" | null;

// where your rank ends up after a settled call (voided calls don't count).
// - climbing past a higher rank's floor ranks you up right away
// - a loss that leaves you under your rank's floor puts you on the line (you keep the rank)
// - a loss while you're already on the line drops you to whatever rank your glory is in
// - a win clears the line, even if you're still a little under the floor
export function nextRankState(state: RankState, gloryAfter: number, won: boolean): RankState & { change: RankChange } {
  const byGlory = tierForGlory(gloryAfter);

  if (byGlory > state.rankTier) return { rankTier: byGlory, onTheLine: false, change: "up" };

  if (won) {
    if (state.onTheLine) return { rankTier: state.rankTier, onTheLine: false, change: "cleared" };
    return { ...state, change: null };
  }

  // a loss
  if (state.onTheLine && byGlory < state.rankTier) return { rankTier: byGlory, onTheLine: false, change: "down" };
  if (gloryAfter < rankFloor(state.rankTier)) return { rankTier: state.rankTier, onTheLine: true, change: state.onTheLine ? null : "line" };
  return { ...state, change: null };
}

// for the "If you're right" box: would winning rank you up, or would losing drop you?
export function rankOutlook(
  user: Pick<User, "glory" | "rankTier" | "onTheLine">,
  stake: number,
  gloryIfRight: number
): { upTo: string | null; dropTo: string | null } {
  const state = { rankTier: user.rankTier, onTheLine: user.onTheLine };
  const ifRight = nextRankState(state, applyGlory(user.glory, gloryIfRight), true);
  const ifWrong = nextRankState(state, applyGlory(user.glory, -gloryForLoss(stake)), false);
  return {
    upTo: ifRight.change === "up" ? rankName(ifRight.rankTier) : null,
    dropTo: ifWrong.change === "down" ? rankName(ifWrong.rankTier) : null,
  };
}

// ---------- multipliers ----------

// what a side returns for each token on it: the whole pot / everything on that side.
// pass "mine" to preview your own pick, which counts your stake in both.
// null when nobody's on that side yet (nothing to divide by)
export function sideMultiplier(positions: Position[], side: Side, mine?: { uid: string; stake: number }): number | null {
  const others = mine ? positions.filter((p) => p.uid !== mine.uid) : positions;
  const pot = others.reduce((sum, p) => sum + p.stake, 0) + (mine?.stake ?? 0);
  const onSide = others.filter((p) => p.side === side).reduce((sum, p) => sum + p.stake, 0) + (mine?.stake ?? 0);
  if (onSide === 0) return null;
  return pot / onSide;
}

// "3.0x return". one decimal is plenty
export function formatMultiplier(m: number): string {
  return `${m.toFixed(1)}x`;
}
