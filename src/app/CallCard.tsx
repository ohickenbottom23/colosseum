import Link from "next/link";
import { callText, timeLeft } from "@/format";
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

  return (
    <li>
      <Link href={`/call/${call.id}`} className="call">
        <p className={call.text ? "call-text" : "call-text removed"}>{callText(call.text)}</p>
        <p className="call-meta">
          About {about} · by {nameOf(call.creatorId)}
          {call.status === "open" && <> · {timeLeft(call.deadline, now)}</>}
        </p>
        {note && <p className="call-mine">{note}</p>}
      </Link>
    </li>
  );
}
