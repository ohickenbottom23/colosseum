import Link from "next/link";
import { callText, cardTimeText } from "@/format";
import { picksCloseAt } from "@/lib/resolve";
import { Prediction } from "@/lib/types";
import Avatar, { Face } from "./ui/Avatar";

// one call in a list on the home screen
export default function CallCard({
  call,
  nameOf,
  faceFor,
  arenaName,
  note,
  now,
}: {
  call: Prediction;
  nameOf: (uid: string) => string;
  faceFor: (uid: string) => Face;
  arenaName: string;
  note?: string; // an extra bold line, like "You picked NO"
  now: number;
}) {
  const about = call.subjectId ? nameOf(call.subjectId) : call.subjectLabel;
  // while picks are open that's the time that matters, after that it's the deadline
  const closeAt = picksCloseAt(call);
  const when = cardTimeText(closeAt, call.deadline, now);

  return (
    <li>
      <Link href={`/call/${call.id}`} className="call">
        <div className="call-top">
          {/* the face of who it's about, when it's about a person */}
          {call.subjectId && <Avatar face={faceFor(call.subjectId)} size={40} />}
          <div className="call-body">
            <p className={call.text ? "call-text" : "call-text removed"}>{callText(call.text)}</p>
            <p className="call-meta">
              {arenaName && <>{arenaName} · </>}About {about} · by {nameOf(call.creatorId)}
              {call.status === "open" && <> · {when}</>}
            </p>
            {note && <p className="call-mine">{note}</p>}
          </div>
        </div>
      </Link>
    </li>
  );
}
