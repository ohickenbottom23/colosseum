"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import { useAuthUser, usePlayer, usePlayers } from "@/hooks";
import { callText, resultLine, timeLeft, voidReasonText } from "@/format";
import { canDelete, canResolve, canTakeSide } from "@/lib/resolve";
import { DAILY_TOKENS, RESOLVE_WINDOW_MS } from "@/lib/constants";
import { Position, Prediction, Side } from "@/lib/types";

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { authUser, loading } = useAuthUser();
  const uid = authUser?.uid ?? null;
  const players = usePlayers(!!authUser);
  const player = usePlayer(uid);

  const [call, setCall] = useState<Prediction | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);

  const [side, setSide] = useState<Side | null>(null);
  const [stake, setStake] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // settling, for the creator after the deadline
  const [outcome, setOutcome] = useState<Side | null>(null);
  const [settleError, setSettleError] = useState("");
  const [settling, setSettling] = useState(false);

  // taking it down, for the person it's about
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // this page is only for signed in players
  useEffect(() => {
    if (!loading && !authUser) router.replace("/");
  }, [loading, authUser, router]);

  // the call itself
  useEffect(() => {
    if (!authUser) return;
    return onSnapshot(
      doc(db, "predictions", id),
      (snap) => {
        setCall(snap.exists() ? (snap.data() as Prediction) : null);
        setNotFound(!snap.exists());
      },
      () => setNotFound(true)
    );
  }, [authUser, id]);

  // everyone who picked a side
  useEffect(() => {
    if (!authUser) return;
    return onSnapshot(
      collection(db, "predictions", id, "positions"),
      (snap) => setPositions(snap.docs.map((d) => d.data() as Position)),
      () => setPositions([])
    );
  }, [authUser, id]);

  if (notFound) {
    return (
      <main>
        <Link href="/" className="back">← Back</Link>
        <p>That call doesn&apos;t exist anymore.</p>
      </main>
    );
  }
  if (!authUser || !call) return <main><p>Loading...</p></main>;

  const nameOf = (u: string) => players.find((p) => p.uid === u)?.displayName ?? "Someone";
  const about = call.subjectId ? nameOf(call.subjectId) : call.subjectLabel;
  const now = Date.now();
  const mine = positions.find((p) => p.uid === authUser.uid);
  const yes = positions.filter((p) => p.side === "yes");
  const no = positions.filter((p) => p.side === "no");
  const canStillPick = call.status === "open" && now < call.deadline;
  const isCreator = call.creatorId === authUser.uid;
  const waitingOnResult = call.status === "open" && now >= call.deadline;
  // null means the creator can settle it right now
  const settleProblem = canResolve(call, authUser.uid, now);

  async function backIt() {
    if (!player || !call || !side) return;
    setError("");
    const amount = Number(stake);

    // check here for a quick answer. the server checks again for real
    const problem = canTakeSide(call, player, amount, false, Date.now());
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    try {
      await httpsCallable(functions, "takeSide")({ predictionId: call.id, side, stake: amount });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setSaving(false);
  }

  async function takeDown() {
    if (!call) return;
    setDeleteError("");
    setDeleting(true);
    try {
      await httpsCallable(functions, "deleteCall")({ predictionId: call.id });
      router.push("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong");
      setDeleting(false);
    }
  }

  async function settleIt() {
    if (!call || !outcome) return;
    setSettleError("");
    setSettling(true);
    try {
      await httpsCallable(functions, "resolveCall")({ predictionId: call.id, outcome });
    } catch (err) {
      setSettleError(err instanceof Error ? err.message : "Something went wrong");
    }
    setSettling(false);
    setOutcome(null);
  }

  return (
    <main>
      <Link href="/" className="back">← Back</Link>

      <p className={call.text ? "call-big" : "call-big removed"}>{callText(call.text)}</p>
      <p className="call-meta">
        About {about} · by {nameOf(call.creatorId)}
        {call.status === "open" && <> · {timeLeft(call.deadline, now)}</>}
      </p>

      {/* how it ended */}
      {call.status === "resolved" && (
        <div className="result">
          <h3>Result: {call.outcome?.toUpperCase()}</h3>
          {mine?.result && <p>{resultLine(mine.result, false)}</p>}
        </div>
      )}
      {call.status === "void" && (
        <div className="result">
          <h3>Didn&apos;t count</h3>
          <p>
            {voidReasonText(call.voidReason, nameOf(call.creatorId))}{" "}
            {call.voidReason === "subject_killed" ? "Everyone else got their tokens back." : "Everyone got their tokens back."}
          </p>
          {mine?.result && <p>{resultLine(mine.result, true)}.</p>}
        </div>
      )}

      {/* who's on each side. stakes stay private */}
      <div className="sides">
        <div className="side-list">
          <h3>Yes · {yes.length}</h3>
          {yes.map((p) => <p key={p.uid}>{nameOf(p.uid)}</p>)}
        </div>
        <div className="side-list">
          <h3>No · {no.length}</h3>
          {no.map((p) => <p key={p.uid}>{nameOf(p.uid)}</p>)}
        </div>
      </div>

      {/* the creator settles it after the deadline */}
      {waitingOnResult && isCreator && !settleProblem && (
        <div className="form settle">
          <div className="field">
            <span>What happened? {timeLeft(call.deadline + RESOLVE_WINDOW_MS, now)} to settle</span>
            {!outcome ? (
              <div className="chips">
                <button type="button" className="chip big" onClick={() => setOutcome("yes")}>Yes</button>
                <button type="button" className="chip big" onClick={() => setOutcome("no")}>No</button>
              </div>
            ) : (
              <>
                <p>
                  Settle this as <strong>{outcome.toUpperCase()}</strong>? Glory and tokens update for everyone right
                  away, and you can&apos;t undo it.
                </p>
                <button onClick={settleIt} disabled={settling}>
                  {settling ? "Settling..." : `Settle as ${outcome.toUpperCase()}`}
                </button>
                <button className="secondary" onClick={() => setOutcome(null)} disabled={settling}>
                  Go back
                </button>
              </>
            )}
          </div>
          {settleError && <p className="error">{settleError}</p>}
        </div>
      )}

      {waitingOnResult && isCreator && settleProblem && (
        <p className="muted">The time to settle this is up. It won&apos;t count, and everyone gets their tokens back.</p>
      )}

      {waitingOnResult && !isCreator && (
        <p className="muted">Waiting on {nameOf(call.creatorId)} to say what happened.</p>
      )}

      {mine ? (
        call.status === "open" && (
          <p className="picked">
            You picked <strong>{mine.side.toUpperCase()}</strong> with {mine.stake} tokens.
          </p>
        )
      ) : !canStillPick ? (
        call.status === "open" && !waitingOnResult && <p className="muted">This call isn&apos;t taking sides anymore.</p>
      ) : !player ? (
        <p>Loading...</p>
      ) : player.tokens === 0 ? (
        <p className="muted">You&apos;re out of tokens. You get {DAILY_TOKENS} more tomorrow.</p>
      ) : (
        <div className="form">
          <div className="field">
            <span>Pick a side</span>
            <div className="chips">
              <button type="button" className={side === "yes" ? "chip big on" : "chip big"} onClick={() => setSide("yes")}>
                Yes
              </button>
              <button type="button" className={side === "no" ? "chip big on" : "chip big"} onClick={() => setSide("no")}>
                No
              </button>
            </div>
          </div>

          <div className="field">
            <span>How many tokens? You have {player.tokens}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={player.tokens}
              step={1}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="10"
            />
            <div className="chips">
              {[10, 25].filter((n) => n < player.tokens).map((n) => (
                <button key={n} type="button" className="chip" onClick={() => setStake(String(n))}>
                  {n}
                </button>
              ))}
              <button type="button" className="chip" onClick={() => setStake(String(player.tokens))}>
                Max ({player.tokens})
              </button>
            </div>
          </div>

          {error && <p className="error">{error}</p>}

          <button onClick={backIt} disabled={!side || !stake || saving}>
            {saving ? "Saving..." : side ? `Back ${side.toUpperCase()}` : "Back it"}
          </button>
          <p className="muted small">You can&apos;t switch sides once you pick.</p>
        </div>
      )}
      {/* the person it's about can always take it down until it's settled */}
      {!canDelete(call, authUser.uid) && (
        <div className="takedown">
          {!confirmDelete ? (
            <button type="button" className="link-button" onClick={() => setConfirmDelete(true)}>
              This call is about you. Take it down
            </button>
          ) : (
            <div className="form">
              <p>
                This removes the call for everyone and gives everyone their tokens back
                {mine ? ", except your own " + mine.stake : ""}. You can&apos;t undo it.
              </p>
              <button onClick={takeDown} disabled={deleting}>{deleting ? "Taking it down..." : "Take it down"}</button>
              <button className="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Keep it up
              </button>
            </div>
          )}
          {deleteError && <p className="error">{deleteError}</p>}
        </div>
      )}
    </main>
  );
}
