"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { useAuthUser, useCallPositions, useLatestTalk, useMyArenas, useMyPositions, usePlayer, usePlayers, useSeenResults } from "@/hooks";
import { resultLine, timeUntil } from "@/format";
import { Prediction } from "@/lib/types";
import { picksCloseAt } from "@/lib/resolve";
import { canVote } from "@/lib/disputes";
import { RESOLVE_WINDOW_MS } from "@/lib/constants";
import CallCard from "./CallCard";
import CalledOutCard from "./CalledOutCard";
import TabBar from "./TabBar";
import SignInButton from "./SignInButton";
import NewArenaForm from "./NewArenaForm";
import RankStrip from "./RankStrip";
import Avatar, { faceOf } from "./ui/Avatar";

export default function Home() {
  const { authUser, loading, setupError, granted } = useAuthUser();
  const uid = authUser?.uid ?? null;
  const players = usePlayers(!!authUser);
  const player = usePlayer(uid);
  const myPositions = useMyPositions(uid);
  const arenas = useMyArenas(uid);
  const [calls, setCalls] = useState<Prediction[]>([]);
  const [finished, setFinished] = useState<Prediction[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const router = useRouter();
  const seen = useSeenResults(uid);

  // your arenas, from your own record (the rules check against the same list).
  // joined into a string so the effects below only rerun when it really changes
  const arenaKey = (player?.arenaIds ?? []).join(",");

  // open calls from all your arenas, newest first
  useEffect(() => {
    if (!arenaKey) {
      setCalls([]);
      return;
    }
    const q = query(
      collection(db, "predictions"),
      where("arenaId", "in", arenaKey.split(",")),
      where("status", "==", "open"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    return onSnapshot(
      q,
      (snap) => setCalls(snap.docs.map((d) => d.data() as Prediction)),
      () => setCalls([])
    );
  }, [arenaKey]);

  // calls in your arenas that just finished (settled or voided), newest first.
  // open calls have no resolvedAt, so "after 0" leaves them out
  useEffect(() => {
    if (!arenaKey) {
      setFinished([]);
      return;
    }
    const q = query(
      collection(db, "predictions"),
      where("arenaId", "in", arenaKey.split(",")),
      where("resolvedAt", ">", 0),
      orderBy("resolvedAt", "desc"),
      limit(30)
    );
    return onSnapshot(
      q,
      (snap) => setFinished(snap.docs.map((d) => d.data() as Prediction)),
      () => setFinished([])
    );
  }, [arenaKey]);

  // disputed calls in your arenas you haven't voted on yet (everyone in the arena votes). they go at the top
  const needsVote = authUser ? finished.filter((c) => !canVote(c, authUser.uid, true, Date.now())) : [];
  // finished calls you played in or made (only the latest few)
  const recent = authUser
    ? finished.filter((c) => (myPositions.has(c.id) || c.creatorId === authUser.uid) && !needsVote.includes(c)).slice(0, 10)
    : [];

  // a call you were in just got settled and you haven't seen how it went: show the result screen.
  // one at a time, newest first, and only from the last week so old ones don't pile up
  const unseenResult = seen
    ? finished.find((c) => {
        const mine = myPositions.get(c.id);
        return c.status === "resolved" && mine?.rankResult && !seen.has(c.id) && (c.resolvedAt ?? 0) > Date.now() - 7 * 24 * 60 * 60 * 1000;
      })
    : undefined;
  const unseenId = unseenResult?.id;
  useEffect(() => {
    if (unseenId) router.push(`/result/${unseenId}`);
  }, [unseenId, router]);

  // who picked what on every call on this screen, for the split bars and faces
  const onScreen = [...calls, ...needsVote, ...recent].map((c) => c.id);
  const positionsByCall = useCallPositions(onScreen);
  // and the newest trash talk message on each
  const latestTalk = useLatestTalk(onScreen);

  if (loading) return <main><p>Loading...</p></main>;

  if (!authUser) {
    return (
      <main>
        <h1 className="wordmark">Colosseum</h1>
        <p>Call it. Get proven right in front of your friends.</p>
        <SignInButton />
      </main>
    );
  }

  const nameOf = (id: string) => players.find((p) => p.uid === id)?.displayName ?? "Someone";
  const arenaName = (id: string) => arenas.find((a) => a.id === id)?.name ?? "";
  const faceFor = (id: string) => faceOf(id, players);
  const now = Date.now();
  const hasArenas = !!player && player.arenaIds?.length > 0;

  // calls about you come first. being called out is the main reason people open the app
  const aboutMe = calls.filter((c) => c.subjectId === authUser.uid);
  // your own calls past their deadline, waiting for you to say what happened
  const needsResult = calls
    .filter((c) => c.creatorId === authUser.uid && c.deadline <= now && c.subjectId !== authUser.uid)
    .sort((a, b) => a.deadline - b.deadline);
  const shownAbove = new Set([...aboutMe, ...needsResult].map((c) => c.id));

  // everything else that's open: ones still waiting on your side first, then the rest
  const needsSide = (c: Prediction) => !myPositions.has(c.id) && now < picksCloseAt(c);
  const openCalls = calls
    .filter((c) => !shownAbove.has(c.id))
    .sort((a, b) => Number(needsSide(b)) - Number(needsSide(a)) || b.createdAt - a.createdAt);

  // how long you have left to settle one of your calls
  function settleNote(c: Prediction): string {
    const left = timeUntil(c.deadline + RESOLVE_WINDOW_MS, now);
    return left ? `${left} left to settle` : "Time to settle is up";
  }

  // "You picked YES", and once the deadline's up, who it's waiting on
  function openNote(c: Prediction): string | undefined {
    const mine = myPositions.get(c.id);
    const waiting = now >= c.deadline ? `Waiting on ${nameOf(c.creatorId).split(" ")[0]} to settle.` : "";
    if (mine) return `You picked ${mine.side.toUpperCase()}${waiting ? `. ${waiting}` : ""}`;
    return waiting || undefined;
  }

  // what to say under a finished call
  function recentNote(c: Prediction): string {
    const mine = myPositions.get(c.id);
    if (c.status === "disputed") return `Result: ${c.outcome?.toUpperCase()}, but it's disputed. Waiting on the vote`;
    if (c.status === "void") {
      if (mine?.result) return `Didn't count. ${resultLine(mine.result, true)}`;
      if (c.voidReason === "not_resolved" && c.creatorId === authUser?.uid) return "Didn't count. You didn't settle it in time";
      return "Didn't count";
    }
    if (mine?.result) return `Result: ${c.outcome?.toUpperCase()}. ${resultLine(mine.result, false)}`;
    return `Result: ${c.outcome?.toUpperCase()}`;
  }

  const card = (c: Prediction, note?: string, action?: { label: string; href: string; quiet?: boolean }) => (
    <CallCard
      key={c.id}
      call={c}
      positions={positionsByCall[c.id] ?? []}
      nameOf={nameOf}
      faceFor={faceFor}
      arenaName={arenaName(c.arenaId)}
      note={note}
      now={now}
      latest={latestTalk[c.id]}
      action={action}
    />
  );

  return (
    <main className="with-tabs">
      <header className="home-header">
        <h1 className="wordmark small">Colosseum</h1>
        {player && <span className="token-chip">{player.tokens} tokens</span>}
        <div className="me-menu">
          <button type="button" className="me-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Your account">
            <Avatar face={faceFor(authUser.uid)} size={36} />
          </button>
          {menuOpen && (
            <div className="menu panel">
              <p className="menu-name">{player?.displayName}</p>
              <button type="button" className="secondary" onClick={() => signOut(auth)}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {setupError && <p className="error">{setupError}</p>}
      {granted > 0 && <p className="banner">+{granted} tokens for today</p>}
      {!player && !setupError && <p className="muted">Setting up your account...</p>}

      {player && (
        <>
          <RankStrip player={player} />
          {/* new players get a reminder of what's what, until they've had a few calls settle */}
          {player.calls < 3 && (
            <p className="explainer">Tokens are what you put behind a call. Glory is your record for being right.</p>
          )}
        </>
      )}

      {/* brand new players need an arena before anything else works */}
      {player && !hasArenas && (
        <>
          <h2>Start an arena</h2>
          <p className="muted">
            An arena is your friend group. Calls, sides, and the leaderboard all happen inside one. Make one and send
            the invite link to your group chat, or open an invite link a friend sent you.
          </p>
          <NewArenaForm main />
        </>
      )}

      {/* your calls past their deadline come first: everyone's waiting on you to settle them */}
      {needsResult.length > 0 && (
        <>
          <h2>Settle these</h2>
          <ul className="calls">
            {needsResult.map((c) =>
              card(c, settleNote(c), { label: "Settle it", href: `/call/${c.id}` })
            )}
          </ul>
        </>
      )}

      {/* someone disputed a result and you get a say */}
      {needsVote.length > 0 && (
        <>
          <h2>Vote on these</h2>
          <ul className="calls">
            {needsVote.map((c) =>
              card(c, `Settled ${c.outcome?.toUpperCase()}, and ${nameOf(c.disputedBy ?? "").split(" ")[0]} disputed it`, {
                label: "Vote",
                href: `/call/${c.id}`,
              })
            )}
          </ul>
        </>
      )}

      {aboutMe.length > 0 && (
        <ul className="calls">
          {aboutMe.map((c) => (
            <CalledOutCard
              key={c.id}
              call={c}
              positions={positionsByCall[c.id] ?? []}
              myUid={authUser.uid}
              nameOf={nameOf}
              faceFor={faceFor}
              now={now}
            />
          ))}
        </ul>
      )}

      {hasArenas && (
        <>
          <h2>Open calls</h2>
          {openCalls.length === 0 && <p className="muted">Nothing open right now. Tap + to make a call.</p>}
          <ul className="calls">
            {openCalls.map((c) => card(c, openNote(c), needsSide(c) ? { label: "Pick a side", href: `/call/${c.id}` } : undefined))}
          </ul>
        </>
      )}

      {recent.length > 0 && (
        <>
          <h2>Recent results</h2>
          <ul className="calls">
            {recent.map((c) =>
              // settled calls you were in can reopen the full result screen any time
              card(
                c,
                recentNote(c),
                c.status !== "void" && myPositions.get(c.id)?.rankResult
                  ? { label: "View result", href: `/result/${c.id}`, quiet: true }
                  : undefined
              )
            )}
          </ul>
        </>
      )}

      <TabBar />
    </main>
  );
}
