"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useAuthUser, usePlayers } from "@/hooks";
import { callInviteUrl, formatGlory, namesYouFirst, tokenProfit } from "@/format";
import { formatMultiplier, progressToNext, rankName } from "@/lib/ranks";
import { canDispute } from "@/lib/disputes";
import { Arena, Position, Prediction } from "@/lib/types";
import ShareButton from "../../ShareButton";
import AvatarStack from "../../ui/AvatarStack";
import RankShield from "../../ui/RankShield";
import RankBar from "../../ui/RankBar";
import { faceOf } from "../../ui/Avatar";
import { CloseIcon } from "../../ui/Icons";

// the screen after a call you were in gets settled: did you call it, what it did to your
// glory and rank, and who was right. home sends you here once per settled call
export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { authUser, loading } = useAuthUser();
  const players = usePlayers(!!authUser);
  const [call, setCall] = useState<Prediction | null>(null);
  const [arena, setArena] = useState<Arena | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [filled, setFilled] = useState(false); // false = rank bar still showing where you were before

  useEffect(() => {
    if (!loading && !authUser) router.replace("/");
  }, [loading, authUser, router]);

  useEffect(() => {
    if (!authUser) return;
    // seeing it once is enough, so home won't send you here again for this call
    setDoc(doc(db, "users", authUser.uid, "seen", id), { seenAt: Date.now() }).catch(() => {});
    const stopCall = onSnapshot(doc(db, "predictions", id), (snap) => setCall(snap.exists() ? (snap.data() as Prediction) : null), () => setCall(null));
    const stopPicks = onSnapshot(collection(db, "predictions", id, "positions"), (snap) => setPositions(snap.docs.map((d) => d.data() as Position)), () => setPositions([]));
    return () => {
      stopCall();
      stopPicks();
    };
  }, [authUser, id]);

  // once the result is on screen, let the rank bar move from before to after
  const ready = !!call;
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setFilled(true), 400);
    return () => clearTimeout(t);
  }, [ready]);

  const arenaId = call?.arenaId ?? null;
  useEffect(() => {
    if (!arenaId) return;
    return onSnapshot(doc(db, "arenas", arenaId), (snap) => setArena(snap.exists() ? (snap.data() as Arena) : null), () => setArena(null));
  }, [arenaId]);

  const mine = positions.find((p) => p.uid === authUser?.uid);
  if (!authUser || !call || !mine?.result || !mine.rankResult || (call.status !== "resolved" && call.status !== "disputed")) {
    return (
      <main>
        <p>Loading...</p>
        <Link href="/">Go home</Link>
      </main>
    );
  }

  const won = mine.result.won;
  const rank = mine.rankResult;
  const gloryChange = Math.round((rank.gloryAfter - rank.gloryBefore) * 10) / 10;
  const next = progressToNext(rank.gloryAfter, rank.after);
  const before = progressToNext(rank.gloryBefore, rank.before);
  const nameOf = (u: string) => (u === authUser.uid ? "You" : players.find((p) => p.uid === u)?.displayName.split(" ")[0] ?? "Someone");
  const fullName = (u: string) => players.find((p) => p.uid === u)?.displayName ?? "Someone";

  const right = positions.filter((p) => p.side === call.outcome);
  const wrong = positions.filter((p) => p.side !== call.outcome);
  // "You, Sam" with you first
  const names = (list: Position[]) => namesYouFirst(list.map((p) => p.uid), authUser.uid, fullName);

  // one line about how it went
  const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
  const othersRight = right.filter((p) => p.uid !== authUser.uid).map((p) => nameOf(p.uid));
  let line: string;
  if (won && right.length <= wrong.length) {
    const who = othersRight.length === 0 ? "You" : `You and ${othersRight.join(", ")}`;
    line = `${who} went against ${people(wrong.length)} and were right.`;
  } else if (won) {
    line = `You were right, along with ${othersRight.length} ${othersRight.length === 1 ? "other" : "others"}.`;
  } else {
    line = `${people(right.length)} called it this time. Your next call could be the one.`;
  }

  // what happened to your rank
  let rankLabel = "Your rank";
  if (rank.after > rank.before) rankLabel = "Ranked up";
  else if (rank.after < rank.before) rankLabel = "Dropped to";
  else if (rank.onTheLine) rankLabel = "On the line";

  const profit = mine.result.tokenChange - mine.stake;
  // a 0 token pick (the creator backing their own call with nothing) has no return to show
  const multiplier = mine.stake > 0 ? mine.result.tokenChange / mine.stake : null;

  return (
    <main>
      <div className="title-bar result-top">
        <span className="wordmark-small">Colosseum</span>
        <Link href="/" className="icon-link" aria-label="Close">
          <CloseIcon />
        </Link>
      </div>

      <p className="label">It&apos;s settled</p>
      {won ? <h1 className="called-it">Called it.</h1> : <h1 className="not-this-time">Not this time.</h1>}

      <div className="panel result-call">
        <p className="result-call-text">{call.text}</p>
        <p className="result-call-meta">
          <span className={`side-pill ${call.outcome}`}>{call.outcome?.toUpperCase()}</span>{" "}
          {call.disputeResult === "flipped" ? "Changed by a vote after a dispute" : `Settled by ${nameOf(call.creatorId)}`}
        </p>
      </div>

      <div className="card result-card">
        <div className="result-card-top">
          <div>
            <span className="big-number glory result-glory">
              {gloryChange >= 0 ? "+" : "−"}
              {formatGlory(Math.abs(gloryChange))}
            </span>
            <span className="estimate-unit">Glory</span>
          </div>
          <div className="result-rank">
            <span className="estimate-unit">{rankLabel}</span>
            <RankShield tier={rank.after} size={44} onTheLine={rank.onTheLine} flip={rank.after > rank.before} />
            <span className="result-rank-name">{rankName(rank.after)}</span>
          </div>
        </div>
        <div className="result-bar">
          <RankBar
            tier={filled ? rank.after : rank.before}
            progress={filled ? next.progress : before.progress}
            onTheLine={filled && rank.onTheLine}
          />
        </div>
        <p className="result-card-meta">
          <span>
            <strong>{formatGlory(rank.gloryAfter)} Glory</strong>
            {next.nextName && !rank.onTheLine && <> · {next.toGo} to {next.nextName}</>}
          </span>
          <span>
            {mine.stake === 0 ? (
              <strong>No tokens on this one</strong>
            ) : won ? (
              <>
                <strong>{tokenProfit(profit)}</strong> · <span className="mult">{multiplier ? formatMultiplier(multiplier) : ""}</span>
              </>
            ) : (
              <strong>{tokenProfit(profit)}</strong>
            )}
          </span>
        </p>
      </div>

      <p className="result-line">{line}</p>
      {call.status === "disputed" && <p className="result-line muted">This result is disputed. Everyone who picked a side is voting on it.</p>}

      <div className="result-who">
        <AvatarStack faces={right.map((p) => faceOf(p.uid, players))} size={30} />
        <strong>Called it</strong>
        <span className="result-names">{names(right)}</span>
      </div>
      {wrong.length > 0 && (
        <div className="result-who">
          <AvatarStack faces={wrong.map((p) => faceOf(p.uid, players))} size={30} />
          <strong>Got it wrong</strong>
          <span className="result-names">{names(wrong)}</span>
        </div>
      )}

      <div className="result-actions">
        {arena && (
          <ShareButton
            url={callInviteUrl(window.location.origin, call.id, arena.inviteCode)}
            text={won ? `Called it: ${call.text}` : `${call.text}. Settled.`}
            label="Share to the group chat"
            className="main"
            icon
          />
        )}
        <Link href="/new" className="text-button">
          Make another call
        </Link>
        {!canDispute(call, authUser.uid, true, Date.now()) && (
          <Link href={`/call/${call.id}?dispute=1`} className="text-button quiet">
            Think that&apos;s wrong? Dispute it
          </Link>
        )}
      </div>
    </main>
  );
}
