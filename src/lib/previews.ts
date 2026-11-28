import { Comment, Position, Prediction, PublicPreview, User } from "./types";
import { sideMultiplier } from "./ranks";

// a person on the public preview: first name and photo only. the uid is just there so a face
// with no photo gets the same color it has in the app
function previewFace(uid: string, users: Map<string, Pick<User, "displayName" | "photoURL">>) {
  const user = users.get(uid);
  return { uid, name: user?.displayName.split(" ")[0] ?? "Someone", photoURL: user?.photoURL ?? null };
}

// the public preview of a call, for people who open a shared link before signing in.
// only what the shared-link screen shows: no stakes, no creator, no invite code, nothing anyone said.
// null means it shouldn't have one: it's settled, voided, being disputed, or the subject took it down
export function buildPreview(
  call: Prediction,
  arenaName: string,
  positions: Position[],
  users: Map<string, Pick<User, "displayName" | "photoURL">>,
  thread: Pick<Comment, "reaction">[]
): PublicPreview | null {
  if (call.status !== "open" || !call.text) return null;

  const side = (s: "yes" | "no") => ({
    faces: positions.filter((p) => p.side === s).map((p) => previewFace(p.uid, users)),
    multiplier: sideMultiplier(positions, s),
  });

  return {
    arenaName,
    text: call.text,
    subject: call.subjectId ? previewFace(call.subjectId, users) : null,
    subjectLabel: call.subjectId ? null : call.subjectLabel,
    yes: side("yes"),
    no: side("no"),
    reactions: thread.filter((m) => m.reaction).length,
    comments: thread.filter((m) => !m.reaction).length,
  };
}
