// "3 days left", "5 hours left", etc
export function timeLeft(deadline: number, now: number): string {
  const ms = deadline - now;
  if (ms <= 0) return "Deadline passed";

  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days >= 1) return days === 1 ? "1 day left" : `${days} days left`;
  if (hours >= 1) return hours === 1 ? "1 hour left" : `${hours} hours left`;
  return minutes <= 1 ? "1 minute left" : `${minutes} minutes left`;
}

// glory is kept to one decimal, but don't show ".0"
export function formatGlory(glory: number): string {
  return String(Math.round(glory * 10) / 10);
}

// how a finished call went for you, in plain words
export function resultLine(result: { tokenChange: number; gloryChange: number; won: boolean }, voided: boolean): string {
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
