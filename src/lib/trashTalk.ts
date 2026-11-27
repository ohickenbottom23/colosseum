import { MAX_COMMENT } from "./constants";
import { Reaction, ReactionType } from "./types";

// the preset reactions, in the order they show up
export const REACTIONS: { type: ReactionType; label: string }[] = [
  { type: "noshot", label: "No shot" },
  { type: "lockit", label: "Lock it" },
  { type: "cap", label: "Cap" },
];

export function isReactionType(type: unknown): type is ReactionType {
  return REACTIONS.some((r) => r.type === type);
}

// how many of each reaction a call has
export function countReactions(reactions: Reaction[]): Record<ReactionType, number> {
  const counts: Record<ReactionType, number> = { noshot: 0, lockit: 0, cap: 0 };
  for (const r of reactions) if (isReactionType(r.type)) counts[r.type]++;
  return counts;
}

// tapping a reaction: picks it, or switches to it, or takes yours back off if it's the same one.
// returns what your reaction should be after the tap (null = none)
export function tapReaction(current: ReactionType | null, tapped: ReactionType): ReactionType | null {
  return current === tapped ? null : tapped;
}

// null means the comment is fine, otherwise the message to show
export function validateComment(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "Write something first";
  if (trimmed.length > MAX_COMMENT) return `Keep it under ${MAX_COMMENT} characters`;
  return null;
}
