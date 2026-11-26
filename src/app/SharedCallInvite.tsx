import { picksCloseText } from "@/format";
import { Face } from "./ui/Avatar";
import AvatarStack from "./ui/AvatarStack";
import SplitBar from "./ui/SplitBar";
import SignInButton from "./SignInButton";
import InviteSteps from "./InviteSteps";

// what previewInvite sends back for a call
export type InvitePreview = {
  arena: { name: string; memberCount: number };
  call: {
    id: string;
    text: string;
    status: string;
    createdAt: number;
    deadline: number;
    subjectLabel: string | null;
    creator: Face & { name: string };
    subject: (Face & { name: string }) | null;
    yes: Face[];
    no: Face[];
  } | null;
};

// a shared call link, opened by someone who's signed out (probably from a group chat).
// shows the call and who's on which side, then "Join [arena] with Google"
export default function SharedCallInvite({ preview }: { preview: InvitePreview }) {
  const { arena, call } = preview;
  const people = `${arena.memberCount} ${arena.memberCount === 1 ? "person" : "people"}`;
  const first = (f: Face) => f.name.split(" ")[0];

  // one line to pull them in
  let hook = "";
  if (call) {
    const { yes, no } = call;
    if (yes.length + no.length === 0) hook = "Nobody's picked a side yet. Be first.";
    else if (no.length === 1 && yes.length > 1) hook = `${first(no[0])} is the only one saying no. Think they're right?`;
    else if (yes.length === 1 && no.length > 1) hook = `${first(yes[0])} is the only one saying yes. Think they're right?`;
    else hook = `${yes.length} say yes, ${no.length} say no. Where are you?`;
  }

  // the half way point, when picks close (same math as the app uses)
  const closeAt = call ? call.createdAt + Math.floor((call.deadline - call.createdAt) / 2) : 0;

  return (
    <main className="invite">
      <h1 className="wordmark">Colosseum</h1>
      <p className="arena-tag">
        {arena.name} arena · {people}
      </p>

      {call && (
        <>
          <div className="invite-who">
            <AvatarStack faces={[call.creator, ...(call.subject ? [call.subject] : [])]} size={34} />
            <span>
              {first(call.creator)} made a call{call.subject ? ` about ${first(call.subject)}` : ""}
            </span>
          </div>

          <div className="card invite-call">
            <p className="invite-call-text">{call.text}</p>
            <SplitBar yesCount={call.yes.length} noCount={call.no.length} />
            <div className="call-people">
              <AvatarStack faces={call.yes} size={26} ring="var(--cream)" />
              <AvatarStack faces={call.no} size={26} ring="var(--cream)" />
            </div>
            {call.status === "open" && <p className="invite-call-closes">{picksCloseText(closeAt, Date.now())}</p>}
          </div>

          <p className="invite-hook">{hook}</p>
        </>
      )}

      <SignInButton label={`Join ${arena.name} with Google`} />
      <InviteSteps />
    </main>
  );
}
