"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import { useAuthUser, usePlayer, usePlayers } from "@/hooks";
import { timeLeft } from "@/format";
import { canTakeSide } from "@/lib/resolve";
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

  return (
    <main>
      <Link href="/" className="back">← Back</Link>

      <p className="call-big">{call.text}</p>
      <p className="call-meta">
        About {about} · by {nameOf(call.creatorId)} · {timeLeft(call.deadline, now)}
      </p>

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

      {mine ? (
        <p className="picked">
          You picked <strong>{mine.side.toUpperCase()}</strong> with {mine.stake} tokens.
        </p>
      ) : !canStillPick ? (
        <p className="muted">This call isn&apos;t taking sides anymore.</p>
      ) : !player ? (
        <p>Loading...</p>
      ) : player.tokens === 0 ? (
        <p className="muted">You&apos;re out of tokens for now.</p>
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
    </main>
  );
}
