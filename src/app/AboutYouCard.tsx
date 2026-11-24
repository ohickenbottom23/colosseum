import Link from "next/link";
import { cardTimeText } from "@/format";
import { picksCloseAt } from "@/lib/resolve";
import { Position, Prediction } from "@/lib/types";
import TakeDown from "./TakeDown";

// a call about you on the home screen, with the option to take it down right there
export default function AboutYouCard({
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
  const closeAt = picksCloseAt(call);
  const when = cardTimeText(closeAt, call.deadline, now);

  return (
    <li className="call">
      <Link href={`/call/${call.id}`} className="plain-link">
        <p className="call-text">{call.text}</p>
        <p className="call-meta">
          by {nameOf(call.creatorId)} · {when}
        </p>
        {mine && <p className="call-mine">You picked {mine.side.toUpperCase()}</p>}
      </Link>
      <TakeDown callId={call.id} myStake={mine?.stake ?? null} label="Take it down" />
    </li>
  );
}
