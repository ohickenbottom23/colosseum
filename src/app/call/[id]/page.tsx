"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import Landing from "../../Landing";
import SharedCallInvite, { InvitePreview } from "../../SharedCallInvite";
import ShareButton from "../../ShareButton";
import TakeDown from "../../TakeDown";
import TrashTalk from "../../TrashTalk";
import DisputeBox from "../../DisputeBox";
import ResultSummary from "../../ResultSummary";
import SplitBar from "../../ui/SplitBar";
import AvatarStack from "../../ui/AvatarStack";
import Avatar, { faceOf } from "../../ui/Avatar";
import { BackIcon } from "../../ui/Icons";
import { subjectFace } from "../../CallCard";
import { useAuthUser, usePlayer, usePlayers } from "@/hooks";
import { callInviteUrl, callText, dayText, formatGlory, picksCloseText, resultLine, settleSummary, timeLeft, voidReasonText, errorText } from "@/format";
import { canDelete, canResolve, canTakeSide, picksCloseAt, previewIfRight } from "@/lib/resolve";
import { DAILY_TOKENS, RESOLVE_WINDOW_MS } from "@/lib/constants";
import { formatMultiplier, rankOutlook, sideMultiplier, tierForGlory } from "@/lib/ranks";
import { Arena, Position, Prediction, Side } from "@/lib/types";


export default function CallPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const inviteCode = params.get("i"); // shared links carry the arena's invite code
  const sideFromLink = params.get("side"); // "Prove them wrong" on home picks the side for you
  const justPosted = params.get("share") === "1"; // came from posting, and the share sheet didn't open
  const disputeFromLink = params.get("dispute") === "1"; // "Dispute it" on the result screen
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

  const [side, setSide] = useState<Side | null>(sideFromLink === "yes" || sideFromLink === "no" ? sideFromLink : null);
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
  if (!loading && !authUser && invitePreview) return <SharedCallInvite preview={invitePreview} />;
  // signed out and the call can't be previewed (an old or broken link): the plain landing
  if (!loading && !authUser) return <Landing tagline="A friend sent you a call. Sign in to see it and pick a side." />;
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

  // what each side returns. once you've typed a stake it counts yours, like the real thing would
  const myStake = validStake ? { uid: authUser.uid, stake: amount } : undefined;
  const returnOf = (s: Side) => {
    const m = sideMultiplier(positions, s, myStake);
    return m ? `${formatMultiplier(m)} return` : "";
  };
  const myMultiplier = side && myStake ? sideMultiplier(positions, side, myStake) : null;

  // quick stake buttons: 10, 25, 50 if you have that many, and everything you've got
  const stakeChoices = player ? [...new Set([10, 25, 50].filter((n) => n < player.tokens).concat(player.tokens))] : [];

  // would this pick rank you up if you're right, or drop you if you're wrong?
  const outlook =
    preview && player
      ? rankOutlook(
          { glory: player.glory, rankTier: player.rankTier ?? tierForGlory(player.glory), onTheLine: player.onTheLine ?? false },
          amount,
          preview.gloryChange
        )
      : null;
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
      <div className="top-bar">
        <Link href="/" className="icon-link" aria-label="Back">
          <BackIcon />
        </Link>
        {call.text && arena && (
          <ShareButton
            url={callInviteUrl(window.location.origin, call.id, arena.inviteCode)}
            text={`${call.text}. Pick a side:`}
            className="share-top"
            icon
          />
        )}
      </div>

      {/* who it's about, who made it, and where */}
      <div className="call-who">
        <Avatar face={subjectFace(call, (u) => faceOf(u, players))} size={48} />
        <div>
          <p className="call-who-about">About {about}</p>
          <p className="call-who-by">
            {nameOf(call.creatorId)} made this call{arena && <> in {arena.name}</>}
          </p>
        </div>
      </div>

      <p className={call.text ? "call-big" : "call-big removed"}>{callText(call.text)}</p>
      {call.status === "open" && (
        <div className="call-when">
          <span className="closes">{picksCloseText(closeAt, now)}</span>
          <span className="settles">
            {now < call.deadline ? `Settles ${dayText(call.deadline, now)}` : timeLeft(call.deadline, now)}
          </span>
        </div>
      )}

      {/* just posted, and the share sheet couldn't open on its own */}
      {justPosted && call.text && arena && (
        <div className="panel just-posted">
          <p>Your call is up. Send it to the group chat so people pick a side.</p>
          <ShareButton
            url={callInviteUrl(window.location.origin, call.id, arena.inviteCode)}
            text={`${call.text}. Pick a side:`}
            label="Share to the group chat"
            className="main"
            icon
          />
        </div>
      )}

      {/* how it ended */}
      {(call.status === "resolved" || call.status === "disputed") && (
        <ResultSummary
          call={call}
          positions={positions}
          arena={arena}
          myUid={authUser.uid}
          nameOf={nameOf}
          faceFor={(u) => faceOf(u, players)}
        />
      )}
      {call.status === "void" && (
        <div className="result">
          <h3>Didn&apos;t count</h3>
          <p>
            {voidReasonText(call.voidReason, nameOf(call.creatorId))}{" "}
            {call.voidReason === "subject_killed" ? "Nobody else won or lost tokens." : "Nobody won or lost tokens."}
          </p>
          {mine?.result && call.voidReason === "subject_killed" && <p>{resultLine(mine, true)}.</p>}
        </div>
      )}

      {/* dispute a settled call, vote on one, or how the vote went */}
      {(call.status === "resolved" || call.status === "disputed") && (
        <DisputeBox
          call={call}
          positions={positions}
          memberIds={arena?.memberIds ?? []}
          myUid={authUser.uid}
          nameOf={nameOf}
          startOpen={disputeFromLink}
        />
      )}

      {/* who's on each side. stakes stay private */}
      <div className="panel sides">
        <SplitBar
          big
          yesCount={yes.length}
          noCount={no.length}
          yesTokens={yes.reduce((sum, p) => sum + p.stake, 0)}
          noTokens={no.reduce((sum, p) => sum + p.stake, 0)}
          yesMultiplier={sideMultiplier(positions, "yes")}
          noMultiplier={sideMultiplier(positions, "no")}
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
                {/* nothing is saved until they confirm, and it says exactly what it'll do */}
                <p className="settle-confirm">
                  <strong>Settle as {outcome.toUpperCase()}?</strong>{" "}
                  {settleSummary(call, positions, outcome, authUser.uid, nameOf)}
                </p>
                <p className="muted settle-note">
                  Glory updates right away. Anyone who picked a side can dispute it for 24 hours.
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
        <p className="muted">Waiting on {nameOf(call.creatorId)} to settle.</p>
      )}

      {mine ? (
        call.status === "open" && (
          <p className="picked">
            You picked <strong>{mine.side.toUpperCase()}</strong> {mine.stake === 0 ? "with no stake" : `with ${mine.stake} tokens`}.
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
            <span>Your side</span>
            <div className="chips">
              <button type="button" className={side === "yes" ? "chip big yes on" : "chip big yes"} onClick={() => setSide("yes")}>
                Yes
                {returnOf("yes") && <span className="sub">{returnOf("yes")}</span>}
              </button>
              <button type="button" className={side === "no" ? "chip big no on" : "chip big no"} onClick={() => setSide("no")}>
                No
                {returnOf("no") && <span className="sub">{returnOf("no")}</span>}
              </button>
            </div>
          </div>

          <div className="field">
            <span>How sure are you? · {player.tokens} tokens</span>
            <div className="stake-chips">
              {stakeChoices.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={stake === String(n) ? "chip on" : "chip"}
                  onClick={() => setStake(String(n))}
                >
                  {n === player.tokens ? `All ${n}` : n}
                </button>
              ))}
            </div>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={player.tokens}
              step={1}
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              placeholder="Or type an amount"
              aria-label="Tokens"
            />
          </div>

          {preview && (
            <div className="estimate">
              <p className="estimate-label">If you&apos;re right</p>
              <div className="estimate-grid">
                <div>
                  <span className="big-number">{myMultiplier ? formatMultiplier(myMultiplier) : "1.0x"}</span>
                  <span className="estimate-unit">Return</span>
                </div>
                <div>
                  {/* profit: what you get back on top of your own stake */}
                  <span className="big-number">+{preview.tokenChange - amount}</span>
                  <span className="estimate-unit">Tokens</span>
                </div>
                <div>
                  <span className="big-number glory">+{formatGlory(preview.gloryChange)}</span>
                  <span className="estimate-unit">Glory</span>
                </div>
              </div>
              {outlook?.upTo && <p className="outlook up">Ranks you up to {outlook.upTo}</p>}
              {outlook?.dropTo && <p className="outlook drop">Lose this and you drop to {outlook.dropTo}</p>}
              <p className="small-left">Estimate. It changes as more people pick a side.</p>
            </div>
          )}

          {error && <p className="error">{error}</p>}

          <button className="main" onClick={backIt} disabled={!side || !stake || saving}>
            {saving ? "Saving..." : !side ? "Pick a side" : validStake ? `Back ${side.toUpperCase()} with ${amount}` : `Back ${side.toUpperCase()}`}
          </button>
          <p className="muted small">You can&apos;t switch sides once you pick.</p>
        </div>
      )}
      <TrashTalk callId={call.id} myUid={authUser.uid} faceFor={(u) => faceOf(u, players)} open={!!call.text} />

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
