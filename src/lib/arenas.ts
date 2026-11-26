import { Arena } from "./types";
import { MAX_ARENA_MEMBERS, MAX_ARENA_NAME, MAX_ARENAS_PER_PLAYER } from "./constants";

// null means the name is fine, otherwise the message to show
export function validateArenaName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Give your arena a name";
  if (trimmed.length > MAX_ARENA_NAME) return `Keep the name under ${MAX_ARENA_NAME} characters`;
  return null;
}

export function isMember(arena: Pick<Arena, "memberIds">, uid: string): boolean {
  return arena.memberIds.includes(uid);
}

export function canMakeArena(myArenaIds: string[]): string | null {
  if (myArenaIds.length >= MAX_ARENAS_PER_PLAYER) return "You're in too many arenas already";
  return null;
}

// joining twice is fine (it just does nothing), so this only blocks a full arena
// or someone who's already in too many
export function canJoinArena(arena: Pick<Arena, "memberIds">, uid: string, myArenaIds: string[]): string | null {
  if (isMember(arena, uid)) return null;
  if (myArenaIds.length >= MAX_ARENAS_PER_PLAYER) return "You're in too many arenas already";
  if (arena.memberIds.length >= MAX_ARENA_MEMBERS) return "This arena is full";
  return null;
}
