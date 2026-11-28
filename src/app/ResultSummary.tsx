import Link from "next/link";
import { callInviteUrl, formatGlory, namesYouFirst } from "@/format";
import { Arena, Position, Prediction } from "@/lib/types";
import ShareButton from "./ShareButton";
import AvatarStack from "./ui/AvatarStack";
import { Face } from "./ui/Avatar";

// a settled call on the call page: a smaller version of the result screen.
// the result, who called it and who missed, what it did to your glory, and sharing it
export default function ResultSummary({
  call,
  positions,
  arena,
  myUid,
  nameOf,
  faceFor,
}: {
  call: Prediction;
  positions: Position[];
  arena: Arena | null;
  myUid: string;
  nameOf: (uid: string) => string;
  faceFor: (uid: string) => Face;
}) {
  const mine = positions.find((p) => p.uid === myUid);
  const right = positions.filter((p) => p.side === call.outcome);
  const wrong = positions.filter((p) => p.side !== call.outcome);
  const won = mine?.result?.won;

  // what it did to you, from what the server saved (the glory floor can make it less than the payout)
  const rank = mine?.rankResult;
  const gloryChange = rank ? Math.round((rank.gloryAfter - rank.gloryBefore) * 10) / 10 : null;
  const tokenLine = !mine?.result
    ? ""
    : mine.stake === 0
      ? "No tokens on this one"
      : won
        ? `+${mine.result.tokenChange - mine.stake} tokens`
        : `−${mine.stake} tokens`;

  return (
    <div className="result result-summary">
      <p className="label result-summary-label">
        {call.status === "disputed" ? "Disputed" : "Settled"} · <span className={`side-pill ${call.outcome}`}>{call.outcome?.toUpperCase()}</span>
      </p>
      {/* the same headline as the result screen, or just the result if you weren't in it */}
      <h3>{!mine ? `Result: ${call.outcome?.toUpperCase()}` : won ? "Called it." : "Not this time."}</h3>

      {gloryChange !== null && (
        <p className="result-summary-mine">
          <span className="big-number glory">
            {gloryChange >= 0 ? "+" : "−"}
            {formatGlory(Math.abs(gloryChange))}
          </span>{" "}
          <span className="estimate-unit">Glory</span>
          <span className="result-summary-tokens">{tokenLine}</span>
        </p>
      )}

      <div className="result-who small">
        <AvatarStack faces={right.map((p) => faceFor(p.uid))} size={26} max={4} ring="var(--cream)" />
        <strong>Called it</strong>
        <span className="result-names">{right.length ? namesYouFirst(right.map((p) => p.uid), myUid, nameOf) : "Nobody"}</span>
      </div>
      {wrong.length > 0 && (
        <div className="result-who small">
          <AvatarStack faces={wrong.map((p) => faceFor(p.uid))} size={26} max={4} ring="var(--cream)" />
          <strong>Missed</strong>
          <span className="result-names">{namesYouFirst(wrong.map((p) => p.uid), myUid, nameOf)}</span>
        </div>
      )}

      <div className="result-summary-actions">
        {arena && call.text && (
          <ShareButton
            url={callInviteUrl(window.location.origin, call.id, arena.inviteCode)}
            text={won ? `Called it: ${call.text}` : `${call.text}. Settled.`}
            label="Share result"
            className="main"
            icon
          />
        )}
        {rank && (
          <Link href={`/result/${call.id}`} className="card-link">
            See the full result
          </Link>
        )}
      </div>
    </div>
  );
}
