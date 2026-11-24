import { Position, Side } from "./types";
import { DAILY_TOKENS, TOKEN_CAP, DEFAULT_TIME_ZONE, TIME_ZONE_CHANGE_COOLDOWN_MS } from "./constants";

// adds 50 once a day, but won't push you over the cap
export function dailyGrant(tokens: number, lastGrantDate: string, today: string): number {
  if (lastGrantDate === today) return tokens;
  if (tokens >= TOKEN_CAP) return tokens;
  return Math.min(tokens + DAILY_TOKENS, TOKEN_CAP);
}

// is this a real timezone name like "America/Chicago"
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// the date in that timezone, like "2026-11-23". handles daylight saving on its own
export function localDate(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

// which timezone to use for someone's daily grant, and whether to save a change.
// trusts the phone the first time, then only lets it change once a week
export function pickTimeZone(
  saved: string | null | undefined,
  fromPhone: unknown,
  changedAt: number,
  now: number
): { timeZone: string; changed: boolean } {
  const phone = isValidTimeZone(fromPhone) ? fromPhone : null;

  // nothing good saved yet (new player)
  if (!isValidTimeZone(saved)) return { timeZone: phone ?? DEFAULT_TIME_ZONE, changed: true };

  if (!phone || phone === saved) return { timeZone: saved, changed: false };
  if (now - changedAt >= TIME_ZONE_CHANGE_COOLDOWN_MS) return { timeZone: phone, changed: true };
  return { timeZone: saved, changed: false };
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
