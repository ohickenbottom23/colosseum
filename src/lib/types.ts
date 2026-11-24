// Firestore layout
// users/{uid}
// groups/{groupId}
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
  | "tied_vote"; // dispute vote came out even

export interface User {
  uid: string;
  displayName: string;
  photoURL: string | null;
  glory: number;
  tokens: number;
  wins: number;
  calls: number; // resolved calls they took a side on
  missedResolves: number; // reliability hit for letting calls void
  friendIds: string[];
  lastGrantDate: string; // "2026-11-20", for the daily token grant
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  ownerId: string;
  memberIds: string[];
  inviteCode: string;
  createdAt: number;
}

export interface Prediction {
  id: string;
  text: string;
  creatorId: string;
  subjectId: string | null; // uid if it's about a person, null if it's about anything else
  subjectLabel: string | null; // what to show when subjectId is null, like "the weather"
  groupId: string | null; // null means all of the creator's friends can see it
  deadline: number;
  status: PredictionStatus;
  outcome: Side | null;
  voidReason: VoidReason | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface Position {
  uid: string;
  side: Side;
  stake: number;
  createdAt: number;
}

// what happens to one player when a call settles
export interface Payout {
  uid: string;
  tokenChange: number; // what they get back, 0 if they lost
  gloryChange: number;
  won: boolean;
}
