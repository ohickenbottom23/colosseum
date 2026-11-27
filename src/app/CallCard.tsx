import Link from "next/link";
import { callText, cardTimeText } from "@/format";
import { picksCloseAt } from "@/lib/resolve";
import { sideMultiplier } from "@/lib/ranks";
import { Position, Prediction, Reaction } from "@/lib/types";
import { countReactions, REACTIONS } from "@/lib/trashTalk";
import { CommentIcon } from "./ui/Icons";
import Avatar, { Face } from "./ui/Avatar";
import AvatarStack from "./ui/AvatarStack";
import SplitBar from "./ui/SplitBar";

// a face for whatever the call is about: the person, or the label ("the weather") as initials
export function subjectFace(call: Prediction, faceFor: (uid: string) => Face): Face {
  if (call.subjectId) return faceFor(call.subjectId);
  return { uid: `label:${call.subjectLabel}`, name: call.subjectLabel ?? "?", photoURL: null };
}

// one call in a list on the home screen
export default function CallCard({
  call,
  positions,
  nameOf,
  faceFor,
  arenaName,
  note,
  now,
  reactions = [],
  commentCount = 0,
}: {
  call: Prediction;
  positions: Position[];
  nameOf: (uid: string) => string;
  faceFor: (uid: string) => Face;
  arenaName: string;
  note?: string; // an extra bold line, like "You picked NO"
  now: number;
  reactions?: Reaction[];
  commentCount?: number;
}) {
  const counts = countReactions(reactions);
  const hasTalk = reactions.length > 0 || commentCount > 0;
  const when = cardTimeText(picksCloseAt(call), call.deadline, now);
  const yes = positions.filter((p) => p.side === "yes");
  const no = positions.filter((p) => p.side === "no");
  const sum = (list: Position[]) => list.reduce((total, p) => total + p.stake, 0);

  return (
    <li>
      <Link href={`/call/${call.id}`} className="call">
        <div className="call-top">
          <Avatar face={subjectFace(call, faceFor)} size={40} />
          <div className="call-body">
            <p className={call.text ? "call-text" : "call-text removed"}>{callText(call.text)}</p>
            <p className="call-meta">
              {nameOf(call.creatorId)}
              {arenaName && <> · {arenaName}</>}
              {call.status === "open" && <> · {when.charAt(0).toLowerCase() + when.slice(1)}</>}
            </p>
          </div>
        </div>

        {/* removed calls don't show who picked what */}
        {call.text && (
          <>
            <SplitBar
              yesCount={yes.length}
              noCount={no.length}
              yesTokens={sum(yes)}
              noTokens={sum(no)}
              yesMultiplier={sideMultiplier(positions, "yes")}
              noMultiplier={sideMultiplier(positions, "no")}
            />
            <div className="call-people">
              <AvatarStack faces={yes.map((p) => faceFor(p.uid))} size={24} max={5} ring="var(--cream)" />
              {no.length > 0 && (
                <span className="call-people-no">
                  <span>NO {no.length}</span>
                  <AvatarStack faces={no.map((p) => faceFor(p.uid))} size={24} max={4} ring="var(--cream)" />
                </span>
              )}
            </div>
          </>
        )}

        {/* trash talk at a glance: reaction counts and how many comments */}
        {call.text && hasTalk && (
          <div className="call-talk">
            {REACTIONS.filter((r) => counts[r.type] > 0).map((r) => (
              <span key={r.type} className="talk-pill">
                {r.label} {counts[r.type]}
              </span>
            ))}
            {commentCount > 0 && (
              <span className="talk-comments">
                <CommentIcon /> {commentCount}
              </span>
            )}
          </div>
        )}

        {note && <p className="call-mine">{note}</p>}
      </Link>
    </li>
  );
}
