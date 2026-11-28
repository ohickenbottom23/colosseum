import { hasNoTakers, settle } from "./lib/resolve";
import { Position, Prediction, Side } from "./lib/types";

// "3 days", "5 hours", etc. until a time, or null if it already passed
export function timeUntil(time: number, now: number): string | null {
  const ms = time - now;
  if (ms <= 0) return null;

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return days === 1 ? "1 day" : `${days} days`;
  if (hours >= 1) return hours === 1 ? "1 hour" : `${hours} hours`;
  return minutes <= 1 ? "1 minute" : `${minutes} minutes`;
}

// "3 days left", or "Deadline passed"
export function timeLeft(deadline: number, now: number): string {
  const left = timeUntil(deadline, now);
  return left ? `${left} left` : "Deadline passed";
}

// "Picks close in 2 days", or "Picks closed"
export function picksCloseText(closeAt: number, now: number): string {
  const left = timeUntil(closeAt, now);
  return left ? `Picks close in ${left}` : "Picks closed";
}

// glory is kept to one decimal, but don't show ".0"
export function formatGlory(glory: number): string {
  return String(Math.round(glory * 10) / 10);
}

// a token change as profit: "+20 tokens", "−10 tokens", "+1 token". never "45 tokens back"
export function tokenProfit(n: number): string {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n)} ${Math.abs(n) === 1 ? "token" : "tokens"}`;
}

// how a finished call went for you, in plain words. tokens are shown as profit (what you got
// minus what you put in), so a refund is "no tokens won or lost"
export function resultLine(mine: { stake: number; result?: { tokenChange: number; gloryChange: number; won: boolean } }, voided: boolean): string {
  const result = mine.result;
  if (!result) return "";
  const profit = result.tokenChange - mine.stake;
  // the only time a voided call gives you less back is when you took down a call about yourself
  if (voided && profit < 0) return `You took it down, so you lost what you had on it: ${tokenProfit(profit)}`;
  if (voided) return "No tokens won or lost";
  if (mine.stake === 0) return result.won ? "You were right, with nothing on it" : "You were wrong, with nothing on it";
  if (result.won) return `You were right. +${formatGlory(result.gloryChange)} Glory, ${tokenProfit(profit)}`;
  return `You were wrong. −${formatGlory(-result.gloryChange)} Glory, ${tokenProfit(profit)}`;
}

// why a call didn't count
export function voidReasonText(reason: string | null, creatorName: string): string {
  if (reason === "no_takers") return "Nobody else joined, so it didn't count.";
  if (reason === "not_resolved") return `${creatorName} didn't settle it in time.`;
  if (reason === "subject_killed") return "The person it was about took it down.";
  if (reason === "member_left") return "Someone it depended on left the arena.";
  return "It didn't count.";
}

// a call's text, or a note if the person it was about took it down (we wipe the text then)
export const REMOVED_TEXT = "Removed by the person it was about";
export function callText(text: string): string {
  return text || REMOVED_TEXT;
}

// the time line on a home card for an open call:
// "Picks close in 2 days", then "Picks closed · resolves in 23 hours", then "Deadline passed"
export function cardTimeText(closeAt: number, deadline: number, now: number): string {
  if (now < closeAt) return picksCloseText(closeAt, now);
  const left = timeUntil(deadline, now);
  return left ? `Picks closed · resolves in ${left}` : "Deadline passed";
}

// invite links. a call link carries the arena's invite code, so opening it also lets you join
export function arenaInviteUrl(origin: string, inviteCode: string): string {
  return `${origin}/join/${inviteCode}`;
}
export function callInviteUrl(origin: string, callId: string, inviteCode: string): string {
  return `${origin}/call/${callId}?i=${inviteCode}`;
}

// a server error's message for the screen. the Firebase SDK tacks the HTTP status
// on the end ("That invite link doesn't work [404]"), so take that off
export function errorText(err: unknown, fallback = "Something went wrong"): string {
  if (!(err instanceof Error) || !err.message) return fallback;
  return err.message.replace(/\s*\[\d{3}\]$/, "");
}

// "2d left", "5h left", "20m left" for tight spots like card corners
export function shortLeft(time: number, now: number): string {
  const ms = time - now;
  if (ms <= 0) return "done";
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d left`;
  if (hours >= 1) return `${hours}h left`;
  return `${Math.max(minutes, 1)}m left`;
}

// "today", "tomorrow", "Friday" if it's within the next week, otherwise "Dec 12"
export function dayText(time: number, now: number): string {
  const d = new Date(time);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(today.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "today";
  if (d.toDateString() === tomorrow.toDateString()) return "tomorrow";
  if (time - now < 6 * 24 * 60 * 60 * 1000) return d.toLocaleDateString("en-US", { weekday: "long" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// "Sunday, Nov 29": the exact day, for when a call settles
export function fullDay(time: number): string {
  return new Date(time).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

// "Thursday at 9pm"
export function dayAndTime(time: number, now: number): string {
  const d = new Date(time);
  const hour = d.getHours() % 12 || 12;
  const minutes = d.getMinutes();
  const ampm = d.getHours() < 12 ? "am" : "pm";
  const clock = minutes === 0 ? `${hour}${ampm}` : `${hour}:${String(minutes).padStart(2, "0")}${ampm}`;
  return `${dayText(time, now)} at ${clock}`;
}

// the confirm line before settling, saying what it does to everyone's tokens:
// "Riley loses 10 tokens, you get +5 tokens." people with nothing on it are left out
export function settleSummary(call: Prediction, positions: Position[], outcome: Side, myUid: string, nameOf: (uid: string) => string): string {
  if (hasNoTakers(call, positions)) return "Nobody else picked a side, so it won't count. No tokens won or lost.";

  const tokens = (n: number) => `${n} ${n === 1 ? "token" : "tokens"}`;
  const payouts = settle(positions, outcome)
    .filter((p) => (positions.find((x) => x.uid === p.uid)?.stake ?? 0) > 0)
    // people losing tokens first, then people getting them back, you last in each
    .sort((a, b) => Number(a.won) - Number(b.won) || Number(a.uid === myUid) - Number(b.uid === myUid));

  const parts = payouts.map((p) => {
    const you = p.uid === myUid;
    const name = you ? "you" : nameOf(p.uid).split(" ")[0];
    const stake = positions.find((x) => x.uid === p.uid)!.stake;
    if (!p.won) return `${name} ${you ? "lose" : "loses"} ${tokens(stake)}`;
    // winners show what they come out ahead, not what comes back
    const profit = p.tokenChange - stake;
    if (profit === 0) return `${name} ${you ? "break" : "breaks"} even`;
    return `${name} ${you ? "get" : "gets"} ${tokenProfit(profit)}`;
  });

  if (parts.length === 0) return "Nobody has tokens on it, so only Glory changes.";
  // a long list gets cut short
  const shown = parts.length > 4 ? [...parts.slice(0, 3), `${parts.length - 3} more`] : parts;
  const line = shown.join(", ");
  return line.charAt(0).toUpperCase() + line.slice(1) + ".";
}

// "You, Sam, Maya": a list of people with you first
export function namesYouFirst(uids: string[], myUid: string, nameOf: (uid: string) => string): string {
  return [...uids]
    .sort((a, b) => Number(b === myUid) - Number(a === myUid))
    .map((u) => (u === myUid ? "You" : nameOf(u).split(" ")[0]))
    .join(", ");
}
