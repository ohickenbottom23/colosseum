"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import SignInButton from "../../SignInButton";
import ShareButton from "../../ShareButton";
import TakeDown from "../../TakeDown";
import SplitBar from "../../ui/SplitBar";
import AvatarStack from "../../ui/AvatarStack";
import { faceOf } from "../../ui/Avatar";
import { useAuthUser, usePlayer, usePlayers } from "@/hooks";
import { callInviteUrl, callText, formatGlory, picksCloseText, resultLine, timeLeft, voidReasonText, errorText } from "@/format";
import { canDelete, canResolve, canTakeSide, picksCloseAt, previewIfRight } from "@/lib/resolve";
import { DAILY_TOKENS, RESOLVE_WINDOW_MS } from "@/lib/constants";
import { Arena, Position, Prediction, Side } from "@/lib/types";

// the bits of previewInvite's answer this page uses
type InvitePreview = { arena: { name: string; memberCount: number }; call: { text: string } | null };

export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const inviteCode = useSearchParams().get("i"); // shared links carry the arena's invite code
  const { authUser, loading, ready } = useAuthUser();
  const uid = authUser?.uid ?? null;
  const players = usePlayers(!!authUser);
  const player = usePlayer(uid);

  // with an invite code we join the arena first, then load the call
  const [joined, setJoined] = useState(!inviteCode);
  const [joinError, setJoinError] = useState("");
  // what a signed out person sees from a shared link, before they join
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [arena, setArena] = useState<Arena | null>(null);

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


  // signed out with an invite: show the arena and the call so they know what they're joining
  useEffect(() => {
    if (loading || authUser || !inviteCode) return;
    httpsCallable<{ code: string; callId: string }, InvitePreview>(functions, "previewInvite")({ code: inviteCode, callId: id })
      .then((res) => setInvitePreview(res.data))
      .catch(() => setInvitePreview(null));
  }, [loading, authUser, inviteCode, id]);

  // signed in with an invite: join the arena (does nothing if you're already in it), then drop
  // the code from the address bar so a refresh doesn't do it again
  useEffect(() => {
    if (!authUser || !ready || !inviteCode || joined) return;
    httpsCallable(functions, "joinArena")({ code: inviteCode })
      .then(() => router.replace(`/call/${id}`))
      .catch((err) => setJoinError(errorText(err, "Couldn't join the arena")))
      .finally(() => setJoined(true));
  }, [authUser, ready, inviteCode, joined, id, router]);

  // the call itself
  useEffect(() => {
    if (!authUser || !joined) return;
    return onSnapshot(
      doc(db, "predictions", id),
      (snap) => {
        setCall(snap.exists() ? (snap.data() as Prediction) : null);
        setNotFound(!snap.exists());
      },
      () => setNotFound(true)
    );
  }, [authUser, id, joined]);

  // the arena it's in, for its name and the invite code in share links
  const callArenaId = call?.arenaId ?? null;
  useEffect(() => {
    if (!callArenaId) return;
    return onSnapshot(
      doc(db, "arenas", callArenaId),
      (snap) => setArena(snap.exists() ? (snap.data() as Arena) : null),
      () => setArena(null)
    );
  }, [callArenaId]);

  // everyone who picked a side
  useEffect(() => {
    if (!authUser || !joined) return;
    return onSnapshot(
      collection(db, "predictions", id, "positions"),
      (snap) => setPositions(snap.docs.map((d) => d.data() as Position)),
      () => setPositions([])
    );
  }, [authUser, id, joined]);

  if (notFound) {
    return (
      <main>
        <Link href="/" className="back">← Back</Link>
        {joinError && <p className="error">{joinError}</p>}
        <p>This call doesn&apos;t exist, or it&apos;s in an arena you&apos;re not in. Ask a friend in it for an invite link.</p>
      </main>
    );
  }
  // opened a shared link while signed out. sign in right here so they stay on this call
  if (!loading && !authUser) {
    return (
      <main>
        <h1 className="wordmark">Colosseum</h1>
        {invitePreview ? (
          <>
            <p className="muted">
              {invitePreview.arena.name} · {invitePreview.arena.memberCount} {invitePreview.arena.memberCount === 1 ? "person" : "people"}
            </p>
            {invitePreview.call?.text && <p className="call-big">{invitePreview.call.text}</p>}
            <p>A friend sent you this call. Join the arena to pick a side.</p>
            <SignInButton label={`Join ${invitePreview.arena.name} with Google`} />
          </>
        ) : (
          <>
            <p>A friend sent you a call. Sign in to see it and pick a side.</p>
            <SignInButton />
          </>
        )}
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
  const closeAt = picksCloseAt(call);
  const canStillPick = call.status === "open" && now < closeAt;

  // what you'd get if you're right, recalculated as you type a stake
  const amount = Number(stake);
  const validStake = !!player && Number.isInteger(amount) && amount >= 1 && amount <= player.tokens;
  const preview = side && validStake ? previewIfRight(positions, authUser.uid, side, amount) : null;
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
      setError(errorText(err, "Something went wrong"));
    }
    setSaving(false);
  }

  async function settleIt() {
    if (!call || !outcome) return;
    setSettleError("");
    setSettling(true);
    try {
      await httpsCallable(functions, "resolveCall")({ predictionId: call.id, outcome });
    } catch (err) {
      setSettleError(errorText(err, "Something went wrong"));
    }
    setSettling(false);
    setOutcome(null);
  }

  return (
    <main>
      <Link href="/" className="back">← Back</Link>

      <p className={call.text ? "call-big" : "call-big removed"}>{callText(call.text)}</p>
      <p className="call-meta">
        {arena && <>{arena.name} · </>}About {about} · by {nameOf(call.creatorId)}
        {call.status === "open" && <> · {timeLeft(call.deadline, now)}</>}
      </p>
      {call.status === "open" && <p className="closes">{picksCloseText(closeAt, now)}</p>}
      {call.text && arena && (
        <ShareButton url={callInviteUrl(window.location.origin, call.id, arena.inviteCode)} text={`${call.text}. Pick a side:`} />
      )}

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
      <div className="panel sides">
        <SplitBar
          big
          yesCount={yes.length}
          noCount={no.length}
          yesTokens={yes.reduce((sum, p) => sum + p.stake, 0)}
          noTokens={no.reduce((sum, p) => sum + p.stake, 0)}
        />
        <div className="side-faces">
          <AvatarStack faces={yes.map((p) => faceOf(p.uid, players))} max={6} />
          <AvatarStack faces={no.map((p) => faceOf(p.uid, players))} max={6} />
        </div>
      </div>

      {/* the creator settles it after the deadline */}
      {waitingOnResult && isCreator && !settleProblem && (
        <div className="form settle">
          <div className="field">
            <span>What happened? {timeLeft(call.deadline + RESOLVE_WINDOW_MS, now)} to settle</span>
            {!outcome ? (
              <div className="chips">
                <button type="button" className="chip big yes" onClick={() => setOutcome("yes")}>Yes</button>
                <button type="button" className="chip big no" onClick={() => setOutcome("no")}>No</button>
              </div>
            ) : (
              <>
                <p>
                  Settle this as <strong>{outcome.toUpperCase()}</strong>? Glory and tokens update for everyone right
                  away, and you can&apos;t undo it.
                </p>
                <button className="main" onClick={settleIt} disabled={settling}>
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
        call.status === "open" && !waitingOnResult && <p className="muted">Picks are closed. The result comes after the deadline.</p>
      ) : !player ? (
        <p>Loading...</p>
      ) : player.tokens === 0 ? (
        <p className="muted">You&apos;re out of tokens. You get {DAILY_TOKENS} more tomorrow.</p>
      ) : (
        <div className="form">
          <div className="field">
            <span>Pick a side</span>
            <div className="chips">
              <button type="button" className={side === "yes" ? "chip big yes on" : "chip big yes"} onClick={() => setSide("yes")}>
                Yes
              </button>
              <button type="button" className={side === "no" ? "chip big no on" : "chip big no"} onClick={() => setSide("no")}>
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

          {preview && (
            <div className="estimate">
              <p>
                If you&apos;re right: about <strong>{preview.tokenChange} tokens back</strong> and{" "}
                <strong>+{formatGlory(preview.gloryChange)} Glory</strong>
              </p>
              <p className="small-left">Estimate. It changes as more people pick a side.</p>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button className="main" onClick={backIt} disabled={!side || !stake || saving}>
            {saving ? "Saving..." : side ? `Back ${side.toUpperCase()}` : "Back it"}
          </button>
          <p className="muted small">You can&apos;t switch sides once you pick.</p>
        </div>
      )}
      {/* the person it's about can always take it down until it's settled */}
      {!canDelete(call, authUser.uid) && (
        <TakeDown
          callId={call.id}
          myStake={mine?.stake ?? null}
          label="This call is about you. Take it down"
          onDone={() => router.push("/")}
        />
      )}
    </main>
  );
}
