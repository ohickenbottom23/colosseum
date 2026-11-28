"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { errorText, timeLeft } from "@/format";
import { canDispute, canVote, votingEndsAt } from "@/lib/disputes";
import { DISPUTE_WINDOW_MS } from "@/lib/constants";
import { Position, Prediction, Side } from "@/lib/types";

// on the call page after it's settled: dispute the result, vote on a dispute,
// or see how a vote came out. both steps ask first, since neither can be undone
export default function DisputeBox({
  call,
  positions,
  memberIds,
  myUid,
  nameOf,
  startOpen = false,
}: {
  call: Prediction;
  positions: Position[];
  memberIds: string[]; // everyone in the arena gets a vote
  myUid: string;
  nameOf: (uid: string) => string;
  startOpen?: boolean; // came from "Dispute it" on the result screen
}) {
  const [confirming, setConfirming] = useState(startOpen);
  const [vote, setVote] = useState<Side | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const now = Date.now();
  const pickedASide = positions.some((p) => p.uid === myUid);
  const firstName = (uid: string) => (uid === myUid ? "You" : nameOf(uid).split(" ")[0]);

  async function send(name: "disputeCall" | "voteOnDispute", data: object) {
    setError("");
    setWorking(true);
    try {
      await httpsCallable(functions, name)({ predictionId: call.id, ...data });
      setConfirming(false);
      setVote(null);
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
    }
    setWorking(false);
  }

  // how a finished vote came out (a tie shows as "didn't count" above this)
  if (call.status === "resolved" && call.disputeResult === "upheld") {
    return <p className="muted dispute-note">Disputed, and the vote kept it as {call.outcome?.toUpperCase()}.</p>;
  }
  if (call.status === "resolved" && call.disputeResult === "flipped") {
    return <p className="muted dispute-note">Disputed, and the vote changed it to {call.outcome?.toUpperCase()}.</p>;
  }

  // a vote is going on
  if (call.status === "disputed") {
    const votes = call.votes ?? {};
    const myVote = votes[myUid];
    const voteProblem = canVote(call, myUid, memberIds.includes(myUid), now);
    return (
      <div className="panel dispute">
        <p className="label">Disputed</p>
        <p>
          {firstName(call.disputedBy ?? "")} said it went the other way. Everyone in the arena votes on what really
          happened. It takes a majority to change it, and a tie keeps {firstName(call.creatorId) === "You" ? "your" : `${firstName(call.creatorId)}'s`}{" "}
          result.
        </p>

        {!voteProblem && !vote && (
          <div className="chips">
            <button type="button" className="chip big yes" onClick={() => setVote("yes")}>Yes</button>
            <button type="button" className="chip big no" onClick={() => setVote("no")}>No</button>
          </div>
        )}
        {!voteProblem && vote && (
          <div className="form">
            <p>
              Vote that it really was <strong>{vote.toUpperCase()}</strong>? You can&apos;t change your vote.
            </p>
            <button onClick={() => send("voteOnDispute", { side: vote })} disabled={working}>
              {working ? "Voting..." : `Vote ${vote.toUpperCase()}`}
            </button>
            <button className="secondary" onClick={() => setVote(null)} disabled={working}>
              Go back
            </button>
          </div>
        )}
        {myVote && (
          <p>
            <strong>You voted {myVote.toUpperCase()}</strong>
            {/* the creator's vote is counted for them, the way they settled it */}
            {call.creatorId === myUid && call.disputedBy !== myUid && " (how you settled it)"}
          </p>
        )}

        <p className="muted small">
          {Object.keys(votes).length} of {memberIds.length} voted · {timeLeft(votingEndsAt(call), now)}
        </p>
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  // settled, and you can still dispute it
  if (canDispute(call, myUid, pickedASide, now)) return null;
  return (
    <div className="dispute-start">
      {!confirming ? (
        <p>
          Think that&apos;s wrong?{" "}
          <button type="button" className="link-button" onClick={() => setConfirming(true)}>
            Dispute it
          </button>{" "}
          <span className="muted">· {timeLeft((call.resolvedAt ?? 0) + DISPUTE_WINDOW_MS, now)}</span>
        </p>
      ) : (
        <div className="form">
          <p>
            Dispute this result? Everyone in the arena gets 24 hours to vote on what really happened. It takes a majority
            to change it, and a tie keeps the result as it is. A call can only be disputed once.
          </p>
          <button onClick={() => send("disputeCall", {})} disabled={working}>
            {working ? "Starting the vote..." : "Start the vote"}
          </button>
          <button className="secondary" onClick={() => setConfirming(false)} disabled={working}>
            Go back
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
