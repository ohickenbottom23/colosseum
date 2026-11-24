import { Position, Side } from "./types";
import { DAILY_TOKENS, TOKEN_CAP } from "./constants";

// adds 50 once a day, but won't push you over the cap
export function dailyGrant(tokens: number, lastGrantDate: string, today: string): number {
  if (lastGrantDate === today) return tokens;
  if (tokens >= TOKEN_CAP) return tokens;
  return Math.min(tokens + DAILY_TOKENS, TOKEN_CAP);
}

// stakes come out of your balance when you take a side,
// so this returns what each person gets back at the end.
// winners get their stake back plus a share of the losers pot, based on how much they put in.
export function splitPot(positions: Position[], outcome: Side): Map<string, number> {
  const winners = positions.filter((p) => p.side === outcome);
  const losers = positions.filter((p) => p.side !== outcome);

  const pot = losers.reduce((sum, p) => sum + p.stake, 0);
  const winnerTotal = winners.reduce((sum, p) => sum + p.stake, 0);

  const returns = new Map<string, number>();

  for (const p of losers) {
    returns.set(p.uid, 0);
  }

  // if nobody won, the pot just goes away
  for (const p of winners) {
    const share = Math.floor((pot * p.stake) / winnerTotal);
    returns.set(p.uid, p.stake + share);
  }

  return returns;
}
