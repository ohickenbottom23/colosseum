import { PublicPreview } from "@/lib/types";
import Avatar from "./ui/Avatar";
import AvatarStack from "./ui/AvatarStack";
import SplitBar from "./ui/SplitBar";
import SignInButton from "./SignInButton";
import InviteSteps from "./InviteSteps";

// a shared call link, opened by someone who's signed out (probably from a group chat).
// shows the call from its public preview (previews/{callId}), then "Join [arena] with Google".
// if the call has no preview anymore (it's settled), it's just the arena
export default function SharedCallInvite({
  arenaName,
  preview,
  canJoin,
}: {
  arenaName: string;
  preview: PublicPreview | null;
  canJoin: boolean; // the link has the arena's invite code, so signing in joins it
}) {
  // one line to pull them in
  let hook = "Your friends are making calls about each other. Get in and pick a side.";
  if (preview) {
    const { yes, no } = preview;
    if (yes.faces.length + no.faces.length === 0) hook = "Nobody's picked a side yet. Be first.";
    else if (no.faces.length === 1 && yes.faces.length > 1) hook = `${no.faces[0].name} is the only one saying no. Think they're right?`;
    else if (yes.faces.length === 1 && no.faces.length > 1) hook = `${yes.faces[0].name} is the only one saying yes. Think they're right?`;
    else {
      const says = (n: number) => `${n} ${n === 1 ? "says" : "say"}`;
      hook = `${says(yes.faces.length)} yes, ${says(no.faces.length)} no. Where are you?`;
    }
  }

  // the split bar sizes each side by its share of the pot, which is 1 / its multiplier
  const share = (m: number | null) => (m ? 1 / m : 0);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <main className="invite">
      <h1 className="wordmark">Colosseum</h1>
      <p className="arena-tag">{arenaName} arena</p>

      {preview && (
        <>
          <div className="invite-who">
            {preview.subject ? (
              <>
                <Avatar face={preview.subject} size={34} />
                <span>A call about {preview.subject.name}</span>
              </>
            ) : (
              <>
                <Avatar face={{ uid: `label:${preview.subjectLabel}`, name: preview.subjectLabel ?? "?", photoURL: null }} size={34} />
                <span>A call about {preview.subjectLabel}</span>
              </>
            )}
          </div>

          <div className="card invite-call">
            <p className="invite-call-text">{preview.text}</p>
            <SplitBar
              yesCount={preview.yes.faces.length}
              noCount={preview.no.faces.length}
              yesTokens={share(preview.yes.multiplier)}
              noTokens={share(preview.no.multiplier)}
              yesMultiplier={preview.yes.multiplier}
              noMultiplier={preview.no.multiplier}
            />
            <div className="call-people">
              <AvatarStack faces={preview.yes.faces} size={26} ring="var(--cream)" />
              <AvatarStack faces={preview.no.faces} size={26} ring="var(--cream)" />
            </div>
            <div className="invite-call-foot">
              <span>
                <strong>{plural(preview.reactions, "reaction")}</strong> · <strong>{plural(preview.comments, "comment")}</strong>
              </span>
            </div>
          </div>
        </>
      )}

      <p className="invite-hook">{hook}</p>
      <SignInButton label={canJoin ? `Join ${arenaName} with Google` : "Sign in with Google"} />
      <InviteSteps />
    </main>
  );
}
