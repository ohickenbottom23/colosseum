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

// joining twice is fine (it just does nothing), so this only blocks a full arena,
// someone who's already in too many, or someone the owner removed
export function canJoinArena(arena: Pick<Arena, "memberIds" | "removedIds">, uid: string, myArenaIds: string[]): string | null {
  if (isMember(arena, uid)) return null;
  if (arena.removedIds?.includes(uid)) return "You were removed from this arena";
  if (myArenaIds.length >= MAX_ARENAS_PER_PLAYER) return "You're in too many arenas already";
  if (arena.memberIds.length >= MAX_ARENA_MEMBERS) return "This arena is full";
  return null;
}

// anyone can leave an arena they're in
export function canLeaveArena(arena: Pick<Arena, "memberIds">, uid: string): string | null {
  if (!isMember(arena, uid)) return "You're not in this arena";
  return null;
}

// only the owner can remove people, and not themselves (they leave instead)
export function canRemoveMember(arena: Pick<Arena, "memberIds" | "ownerId">, byUid: string, targetUid: string): string | null {
  if (byUid !== arena.ownerId) return "Only the person who made the arena can remove people";
  if (targetUid === byUid) return "To take yourself out, leave the arena instead";
  if (!isMember(arena, targetUid)) return "They're not in this arena";
  return null;
}

// who owns the arena after someone leaves: the same owner, unless it was the owner who left.
// then it goes to whoever's been in it longest. null when nobody's left
export function ownerAfterLeaving(arena: Pick<Arena, "memberIds" | "ownerId">, leavingUid: string): string | null {
  const rest = arena.memberIds.filter((m) => m !== leavingUid);
  if (rest.length === 0) return null;
  return arena.ownerId === leavingUid ? rest[0] : arena.ownerId;
}
