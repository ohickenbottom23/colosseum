// Firestore layout
// users/{uid}
// arenas/{arenaId}
// predictions/{predictionId}
// predictions/{predictionId}/positions/{uid}

export type Side = "yes" | "no";

export type PredictionStatus =
  | "open" // taking sides
  | "closed" // deadline passed, waiting on creator
  | "disputed" // someone flagged the result, participants voting
  | "resolved"
  | "void";

export type VoidReason =
  | "no_takers" // nobody but the creator joined
  | "not_resolved" // creator missed the 48 hour window
  | "subject_killed" // the person it was about deleted it
  | "member_left"; // the person who made it, or the person it was about, left the arena

export interface User {
  uid: string;
  displayName: string;
  photoURL: string | null;
  glory: number;
  tokens: number;
  wins: number;
  calls: number; // resolved calls they took a side on
  missedResolves: number; // reliability hit for letting calls void
  overruled: number; // calls they settled that a dispute vote overturned
  arenaIds: string[]; // arenas they're in. only Cloud Functions change this, the rules read it
  lastGrantDate: string; // "2026-11-20" in their timezone, for the daily token grant
  timeZone: string; // like "America/Chicago", decides when their day starts
  timeZoneChangedAt: number; // so they can only switch once a week
  rankTier: number; // 1 Recruit to 5 Legend. only the settle function changes it
  onTheLine: boolean; // under their rank's floor. one more settled loss drops them
  createdAt: number;
}

// a group of friends. every call belongs to one arena, and only its members can see it
export interface Arena {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  inviteCode: string; // goes in invite links. any member can share it
  createdAt: number;
  removedIds?: string[]; // people the owner removed. they can't rejoin with the invite link
  lastCallAt?: number; // when the newest call was posted here, so we can tell which arena is busiest
}

export interface Prediction {
  id: string;
  text: string;
  creatorId: string;
  subjectId: string | null; // uid if it's about a person, null if it's about anything else
  subjectLabel: string | null; // what to show when subjectId is null, like "the weather"
  arenaId: string; // the arena it was posted to
  deadline: number;
  status: PredictionStatus;
  outcome: Side | null;
  voidReason: VoidReason | null;
  createdAt: number;
  resolvedAt: number | null;
  // disputes. a call can be disputed once, in the 24 hours after it's settled
  disputedBy?: string;
  disputedAt?: number;
  votes?: Record<string, Side>; // uid -> what they say really happened. anyone in the arena can vote
  disputeResult?: "upheld" | "flipped"; // how the vote came out (a tie keeps the creator's result)
}

export interface Position {
  uid: string;
  predictionId: string; // so we can find all of someone's positions in one query
  arenaId: string; // copied from the call so the rules can check membership cheaply
  side: Side;
  stake: number;
  createdAt: number;
  result?: Payout; // filled in when the call is settled or voided
  rankResult?: RankResult; // filled in when the call is settled (not voided), for the result screen
}

// what happened to someone's rank when a call they were in got settled
export interface RankResult {
  before: number; // tier before
  after: number; // tier after
  onTheLine: boolean; // after
  onTheLineBefore?: boolean; // so a dispute can put it back (missing on older results)
  gloryBefore: number; // so the result screen shows the real change (the floor can make it smaller)
  gloryAfter: number;
}

// what happens to one player when a call settles
export interface Payout {
  uid: string;
  tokenChange: number; // what they get back, 0 if they lost
  gloryChange: number;
  won: boolean;
}

// trash talk. the one thing the app writes straight to Firestore, since it never touches
// glory or tokens. the rules still check who you are and that you're in the arena
export type ReactionType = "noshot" | "lockit" | "cap";

// predictions/{id}/comments/{commentId}: one message in the thread. either a typed comment,
// or a quick reaction (reaction set, text empty)
export interface Comment {
  id: string;
  uid: string;
  text: string;
  reaction?: ReactionType;
  createdAt: number; // millis, from the server's clock
  edited: boolean;
}

// previews/{callId}: what anyone with a shared call link can see before signing in.
// written only by Cloud Functions, only while the call is open, and with only these fields
export interface PreviewFace {
  uid: string; // so a face with no photo gets its usual color
  name: string; // first name only
  photoURL: string | null;
}

export interface PublicPreview {
  arenaName: string;
  text: string;
  subject: PreviewFace | null; // the person it's about
  subjectLabel: string | null; // or the thing it's about, like "the weather"
  yes: { faces: PreviewFace[]; multiplier: number | null };
  no: { faces: PreviewFace[]; multiplier: number | null };
  reactions: number;
  comments: number;
}
