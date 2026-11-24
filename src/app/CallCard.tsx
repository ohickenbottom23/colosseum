import Link from "next/link";
import { callText, cardTimeText } from "@/format";
import { picksCloseAt } from "@/lib/resolve";
import { Prediction } from "@/lib/types";

// one call in a list on the home screen
export default function CallCard({
  call,
  nameOf,
  note,
  now,
}: {
  call: Prediction;
  nameOf: (uid: string) => string;
  note?: string; // an extra gold line, like "You picked NO"
  now: number;
}) {
  const about = call.subjectId ? nameOf(call.subjectId) : call.subjectLabel;
  // while picks are open that's the time that matters, after that it's the deadline
  const closeAt = picksCloseAt(call);
  const when = cardTimeText(closeAt, call.deadline, now);

  return (
    <li>
      <Link href={`/call/${call.id}`} className="call">
        <p className={call.text ? "call-text" : "call-text removed"}>{callText(call.text)}</p>
        <p className="call-meta">
          About {about} · by {nameOf(call.creatorId)}
          {call.status === "open" && <> · {when}</>}
        </p>
        {note && <p className="call-mine">{note}</p>}
      </Link>
    </li>
  );
}
