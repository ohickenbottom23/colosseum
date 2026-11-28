import { MAX_COMMENT } from "./constants";
import { Comment, ReactionType } from "./types";

// the quick reactions, in the order they show up. tapping one posts it in the thread
export const REACTIONS: { type: ReactionType; label: string }[] = [
  { type: "noshot", label: "No shot" },
  { type: "lockit", label: "Lock it" },
  { type: "cap", label: "Cap" },
];

export function isReactionType(type: unknown): type is ReactionType {
  return REACTIONS.some((r) => r.type === type);
}

export function reactionLabel(type: ReactionType): string {
  return REACTIONS.find((r) => r.type === type)?.label ?? "";
}

// the same quick reaction in a row at the end of the thread (the latest few messages)
function trailingRun(messages: Comment[], type: ReactionType): Comment[] {
  const run: Comment[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].reaction === type; i--) run.push(messages[i]);
  return run;
}

// null means you can post it. you can't post the same quick reaction twice in a row:
// if the thread is already on a run of it and you're in that run, it's blocked until something else is said.
// messages are oldest first
export function canQuickReact(messages: Comment[], uid: string, type: ReactionType): string | null {
  if (trailingRun(messages, type).some((m) => m.uid === uid)) return `You already said ${reactionLabel(type)}`;
  return null;
}

export type TalkLine =
  | { kind: "comment"; message: Comment }
  | { kind: "reaction"; type: ReactionType; messages: Comment[] };

// the thread as it shows on screen: typed comments one per line, and the same quick reaction
// from several people in a row merged into one line ("Riley, Ava and 2 others: No shot")
export function talkLines(messages: Comment[]): TalkLine[] {
  const lines: TalkLine[] = [];
  for (const m of messages) {
    const last = lines[lines.length - 1];
    if (!m.reaction) lines.push({ kind: "comment", message: m });
    else if (last?.kind === "reaction" && last.type === m.reaction) last.messages.push(m);
    else lines.push({ kind: "reaction", type: m.reaction, messages: [m] });
  }
  return lines;
}

// who's in a merged line, each person once, in the order they posted
export function lineUids(messages: Comment[]): string[] {
  return [...new Set(messages.map((m) => m.uid))];
}

// "Riley", "Riley and Ava", "Riley, Ava and Sam", "Riley, Ava and 2 others"
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

// null means the comment is fine, otherwise the message to show
export function validateComment(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Write something first";
  if (trimmed.length > MAX_COMMENT) return `Keep it under ${MAX_COMMENT} characters`;
  return null;
}
