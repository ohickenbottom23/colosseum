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
