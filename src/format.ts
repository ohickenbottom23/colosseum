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

// how a finished call went for you, in plain words
export function resultLine(result: { tokenChange: number; gloryChange: number; won: boolean }, voided: boolean): string {
  // the only time a voided call gives 0 back is when you took down a call about yourself
  if (voided && result.tokenChange === 0) return "You took it down, so your tokens stayed in";
  if (voided) return `You got your ${result.tokenChange} tokens back`;
  if (result.won) return `You were right. +${formatGlory(result.gloryChange)} Glory, ${result.tokenChange} tokens back`;
  return `You were wrong. −${formatGlory(-result.gloryChange)} Glory`;
}

// why a call didn't count
export function voidReasonText(reason: string | null, creatorName: string): string {
  if (reason === "no_takers") return "Nobody else joined, so it didn't count.";
  if (reason === "not_resolved") return `${creatorName} didn't settle it in time.`;
  if (reason === "subject_killed") return "The person it was about took it down.";
  if (reason === "tied_vote") return "The vote came out even.";
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

// "Thursday at 9pm"
export function dayAndTime(time: number, now: number): string {
  const d = new Date(time);
  const hour = d.getHours() % 12 || 12;
  const minutes = d.getMinutes();
  const ampm = d.getHours() < 12 ? "am" : "pm";
  const clock = minutes === 0 ? `${hour}${ampm}` : `${hour}:${String(minutes).padStart(2, "0")}${ampm}`;
  return `${dayText(time, now)} at ${clock}`;
}
