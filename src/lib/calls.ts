import { MAX_CALL_TEXT, MAX_LABEL, MIN_DEADLINE_MS, MAX_DEADLINE_MS } from "./constants";
import { canCreate } from "./resolve";

export type DeadlinePreset = "tonight" | "week" | "month" | "custom";

// 11:59pm on that day, in whatever timezone the Date is in (the phone's local time)
function endOfDay(year: number, month: number, day: number): number {
  return new Date(year, month, day, 23, 59, 0, 0).getTime();
}

// customDate is "2026-12-05" from a date input, only used for "custom"
export function deadlineFromPreset(preset: DeadlinePreset, now: Date, customDate = ""): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  if (preset === "tonight") return endOfDay(y, m, d);

  if (preset === "week") {
    // weeks end Sunday night. getDay() is 0 on Sunday
    const daysLeft = (7 - now.getDay()) % 7;
    return endOfDay(y, m, d + daysLeft);
  }

  // day 0 of next month is the last day of this month
  if (preset === "month") return endOfDay(y, m + 1, 0);

  const [cy, cm, cd] = customDate.split("-").map(Number);
  return endOfDay(cy, cm - 1, cd);
}

export interface NewCall {
  text: string;
  subjectId: string | null; // a player
  subjectLabel: string | null; // or something else, like "the weather"
  deadline: number;
}

// null means it's fine, otherwise the message to show
export function validateNewCall(call: NewCall, creatorId: string, now: number): string | null {
  const text = call.text.trim();
  if (text.length === 0) return "Write your call first";
  if (text.length > MAX_CALL_TEXT) return `Keep it under ${MAX_CALL_TEXT} characters`;

  // has to be about exactly one thing: a player or a label
  const label = call.subjectLabel?.trim() ?? "";
  const hasPerson = !!call.subjectId;
  const hasLabel = label.length > 0;
  if (hasPerson === hasLabel) return "Pick who or what it's about";
  if (label.length > MAX_LABEL) return `Keep the subject under ${MAX_LABEL} characters`;
  if (!canCreate(creatorId, call.subjectId)) return "You can't make a call about yourself";

  if (!Number.isFinite(call.deadline)) return "Pick a deadline";
  if (call.deadline < now + MIN_DEADLINE_MS) return "The deadline has to be at least 10 minutes away";
  if (call.deadline > now + MAX_DEADLINE_MS) return "The deadline can't be more than a year away";

  return null;
}
