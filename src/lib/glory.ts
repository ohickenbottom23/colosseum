import { Position, Side, User } from "./types";
import {
  WIN_BASE,
  LOSS_BASE,
  CROWD_MIN,
  DAILY_TOKENS,
  MAX_STAKE_FACTOR,
  GLORY_FLOOR,
  SMOOTH_WINS,
  SMOOTH_CALLS,
} from "./constants";

// staking a full day of tokens = 1, capped so huge stakes don't run away
export function stakeFactor(stake: number): number {
  return Math.min(stake / DAILY_TOKENS, MAX_STAKE_FACTOR);
}

// 0 if everyone else agreed with you, 1 if everyone else was on the other side
export function contrarianScore(uid: string, side: Side, positions: Position[]): number {
  const others = positions.filter((p) => p.uid !== uid);
  if (others.length === 0) return 0;

  const against = others.filter((p) => p.side !== side).length;
  return against / others.length;
}

// keep one decimal so small stakes still win and lose a little
// (rounding to whole numbers let stakes under 5 lose nothing)
function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function gloryForWin(stake: number, contrarian: number): number {
  return round1(WIN_BASE * (CROWD_MIN + contrarian) * stakeFactor(stake));
}

export function gloryForLoss(stake: number): number {
  return round1(LOSS_BASE * stakeFactor(stake));
}

export function applyGlory(current: number, change: number): number {
  return Math.max(GLORY_FLOOR, round1(current + change));
}

export function leaderboardScore(user: Pick<User, "glory" | "wins" | "calls">): number {
  const accuracy = (user.wins + SMOOTH_WINS) / (user.calls + SMOOTH_CALLS);
  return Math.round(user.glory * accuracy);
}

export interface Ranked {
  user: User;
  score: number;
  rank: number; // tied players share a rank, like 1, 2, 2, 4
}

// everyone in leaderboard order. ties go to more glory, then more calls played
export function rankPlayers(users: User[]): Ranked[] {
  const scored = users.map((user) => ({ user, score: leaderboardScore(user) }));
  scored.sort((a, b) => b.score - a.score || b.user.glory - a.user.glory || b.user.calls - a.user.calls);

  return scored.map((row, i) => {
    // same score as someone above you means you share their rank
    const first = scored.findIndex((other) => other.score === row.score);
    return { ...row, rank: first + 1 };
  });
}
