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
