import Link from "next/link";
import { timeLeft } from "@/format";
import { Position, Prediction } from "@/lib/types";

// one call in a list on the home screen
export default function CallCard({
  call,
  nameOf,
  mine,
  now,
}: {
  call: Prediction;
  nameOf: (uid: string) => string;
  mine?: Position;
  now: number;
}) {
  const about = call.subjectId ? nameOf(call.subjectId) : call.subjectLabel;

  return (
    <li>
      <Link href={`/call/${call.id}`} className="call">
        <p className="call-text">{call.text}</p>
        <p className="call-meta">
          About {about} · by {nameOf(call.creatorId)} · {timeLeft(call.deadline, now)}
        </p>
        {mine && <p className="call-mine">You picked {mine.side.toUpperCase()}</p>}
      </Link>
    </li>
  );
}
