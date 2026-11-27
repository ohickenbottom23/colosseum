import Link from "next/link";
import { shortLeft } from "@/format";
import { picksCloseAt } from "@/lib/resolve";
import { sideMultiplier } from "@/lib/ranks";
import { Position, Prediction, Side } from "@/lib/types";
import Avatar, { Face } from "./ui/Avatar";
import SplitBar from "./ui/SplitBar";
import TakeDown from "./TakeDown";

// an open call about you, at the top of home. you can jump in against it, or take it down
export default function CalledOutCard({
  call,
  positions,
  myUid,
  nameOf,
  faceFor,
  now,
}: {
  call: Prediction;
  positions: Position[];
  myUid: string;
  nameOf: (uid: string) => string;
  faceFor: (uid: string) => Face;
  now: number;
}) {
  const mine = positions.find((p) => p.uid === myUid);
  const creatorSide = positions.find((p) => p.uid === call.creatorId)?.side;
  // "prove them wrong" means taking the other side from whoever made the call
  const against: Side = creatorSide === "yes" ? "no" : "yes";
  const canPick = !mine && now < picksCloseAt(call);
  // what to say when you can't pick: your side, and once the deadline's up, who it's waiting on
  const waiting = now >= call.deadline ? ` Waiting on ${nameOf(call.creatorId).split(" ")[0]} to settle.` : "";
  const status = mine ? `You picked ${mine.side.toUpperCase()}.${waiting}` : `Picks are closed.${waiting}`;
  const yes = positions.filter((p) => p.side === "yes");
  const no = positions.filter((p) => p.side === "no");
  const sum = (list: Position[]) => list.reduce((total, p) => total + p.stake, 0);

  return (
    <li className="call called-out">
      <Link href={`/call/${call.id}`} className="plain-link">
        <div className="called-out-top">
          <Avatar face={faceFor(call.creatorId)} size={34} />
          <div className="call-body">
            <p className="label called-out-label">Called out</p>
            <p className="called-out-who">{nameOf(call.creatorId)} made a call about you</p>
          </div>
          <span className="called-out-left">{shortLeft(call.deadline, now)}</span>
        </div>
        <p className="called-out-text">{call.text}</p>
        <SplitBar
          yesCount={yes.length}
          noCount={no.length}
          yesTokens={sum(yes)}
          noTokens={sum(no)}
          yesMultiplier={sideMultiplier(positions, "yes")}
          noMultiplier={sideMultiplier(positions, "no")}
        />
      </Link>

      <div className="card-actions">
        {canPick ? (
          <Link href={`/call/${call.id}?side=${against}`} className="card-button">
            Prove them wrong
          </Link>
        ) : (
          <p className="call-mine">{status}</p>
        )}
        <TakeDown callId={call.id} myStake={mine?.stake ?? null} label="Take it down" />
      </div>
    </li>
  );
}
