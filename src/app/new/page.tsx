"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { useAuthUser, useMyArenas, usePlayer, usePlayers } from "@/hooks";
import { DeadlinePreset, deadlineFromPreset, NewCall, validateNewCall } from "@/lib/calls";
import { DAILY_TOKENS, MAX_CALL_TEXT, MAX_LABEL } from "@/lib/constants";
import { canTakeSide } from "@/lib/resolve";
import { Prediction, Side } from "@/lib/types";
import { callInviteUrl, dayAndTime, errorText, fullDay } from "@/format";
import NewArenaForm from "../NewArenaForm";
import Avatar from "../ui/Avatar";
import { CloseIcon, PlusIcon } from "../ui/Icons";

const PRESETS: { value: DeadlinePreset; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Pick a date" },
];

// reading ?arena= and ?about= needs a Suspense wrapper, or Next can't build this page ahead of time
export default function NewCallPage() {
  return (
    <Suspense fallback={<main><p>Loading...</p></main>}>
      <NewCallForm />
    </Suspense>
  );
}

function NewCallForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { authUser, loading } = useAuthUser();
  const players = usePlayers(!!authUser);
  const player = usePlayer(authUser?.uid ?? null);
  const arenas = useMyArenas(authUser?.uid ?? null);

  // "Call them out" on the leaderboard opens this with the arena and person filled in
  const [arenaId, setArenaId] = useState(params.get("arena") ?? "");
  const [subjectId, setSubjectId] = useState(params.get("about") ?? ""); // "" = nobody yet, "other" = a label
  const [makingArena, setMakingArena] = useState(false);
  const [text, setText] = useState("");
  const [label, setLabel] = useState("");
  const [preset, setPreset] = useState<DeadlinePreset>("week");
  const [customDate, setCustomDate] = useState("");
  const [side, setSide] = useState<Side | null>(null);
  const [stake, setStake] = useState("");
  const [shareAfter, setShareAfter] = useState(true);
  const [exampleSeed] = useState(() => Math.random()); // picks whose name goes in the example, once
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  // this page is only for signed in players
  useEffect(() => {
    if (!loading && !authUser) router.replace("/");
  }, [loading, authUser, router]);

  if (!authUser) return <main><p>Loading...</p></main>;

  // the arena you picked, or your first one until you pick
  const arena = arenas.find((a) => a.id === arenaId) ?? arenas[0];

  // only people in that arena, and not you, since you can't make a call about yourself
  const friends = players.filter((p) => arena?.memberIds.includes(p.uid) && p.uid !== authUser.uid);

  // the example in the text box is about someone else in the arena (never you),
  // or a general one if you're the only one in it
  const exampleFriend = friends.length > 0 ? friends[Math.floor(exampleSeed * friends.length)] : null;
  const example = exampleFriend
    ? `${exampleFriend.displayName.split(" ")[0]} makes it to every 8am this week`
    : "The group chat picks a dinner spot by Friday";

  function pickArena(id: string) {
    setArenaId(id);
    setMakingArena(false);
    if (subjectId !== "other") setSubjectId(""); // the person you picked might not be in the new arena
  }

  // when picks would close if you posted right now: halfway to the deadline
  const now = Date.now();
  const deadline = preset === "custom" && !customDate ? NaN : deadlineFromPreset(preset, new Date(now), customDate);
  const closeAt = now + (deadline - now) / 2;

  const tokens = player?.tokens ?? 0;
  // "None" (0) is always there: you can back your own call with nothing, so being out of tokens
  // never stops you from posting. then 10, 25, 50 if you have that many, and all of it
  const stakeChoices = [...new Set([0, 10, 25, 50].filter((n) => n < tokens).concat(tokens))];

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!authUser) return;
    setError("");

    if (!arena) {
      setError("Pick an arena");
      return;
    }
    if (preset === "custom" && !customDate) {
      setError("Pick a date");
      return;
    }

    const call: NewCall = {
      text,
      subjectId: subjectId && subjectId !== "other" ? subjectId : null,
      subjectLabel: subjectId === "other" ? label : null,
      deadline: deadlineFromPreset(preset, new Date(), customDate),
    };

    // check here for a quick answer. the server checks again for real
    const problem = validateNewCall(call, authUser.uid, Date.now());
    if (problem) {
      setError(problem);
      return;
    }

    // you back your own call while posting it
    if (!side) {
      setError("Pick your side");
      return;
    }
    // out of tokens means 0. with tokens, pick an amount (None is fine) so it's never by accident
    if (stake === "" && tokens > 0) {
      setError("Pick how many tokens to put on it. None is fine");
      return;
    }
    const amount = stake === "" ? 0 : Number(stake);
    if (player) {
      // same checks as picking a side on any call
      const draft: Prediction = {
        id: "",
        text: call.text,
        creatorId: authUser.uid,
        subjectId: call.subjectId,
        subjectLabel: call.subjectLabel,
        arenaId: arena.id,
        deadline: call.deadline,
        status: "open",
        outcome: null,
        voidReason: null,
        createdAt: Date.now(),
        resolvedAt: null,
      };
      const sideProblem = canTakeSide(draft, player, amount, false, Date.now());
      if (sideProblem) {
        setError(sideProblem);
        return;
      }
    }

    setPosting(true);
    let id: string;
    try {
      const res = await httpsCallable<object, { id: string }>(functions, "createCall")({ ...call, arenaId: arena.id, side, stake: amount });
      id = res.data.id;
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
      setPosting(false);
      return;
    }

    if (!shareAfter) {
      router.push(`/call/${id}`);
      return;
    }

    // phones only open the share sheet right after a tap. we just waited on the server, so it
    // might refuse. if it does (or there's no share sheet), the call page shows a share button
    const url = callInviteUrl(window.location.origin, id, arena.inviteCode);
    if (!navigator.share) {
      router.push(`/call/${id}?share=1`);
      return;
    }
    try {
      await navigator.share({ title: "Colosseum", text: `${call.text.trim()}. Pick a side:`, url });
      router.push(`/call/${id}`);
    } catch (err) {
      // closing the share sheet yourself is fine. anything else means it never opened
      const cancelled = err instanceof DOMException && err.name === "AbortError";
      router.push(cancelled ? `/call/${id}` : `/call/${id}?share=1`);
    }
  }

  // today as "2026-11-23" so the date picker can't go into the past
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <main>
      <div className="title-bar">
        <h1>Make a call</h1>
        <Link href="/" className="icon-link" aria-label="Close">
          <CloseIcon />
        </Link>
      </div>

      {arenas.length === 0 && (
        <p className="muted">
          You need to be in an arena to make a call. <Link href="/">Make one on home</Link>, or open an invite link
          from a friend.
        </p>
      )}

      <form onSubmit={post} className="form">
        <label className="field">
          <span>What&apos;s your call?</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CALL_TEXT}
            rows={3}
            placeholder={example}
          />
          {/* the exact day, so it's easy to spot when it doesn't match what you wrote */}
          <span className="settle-date">
            {Number.isFinite(deadline) ? `Settles ${fullDay(deadline)}` : "Pick a date to see when it settles"}
          </span>
        </label>

        <div className="field">
          <span>Which arena?</span>
          <div className="chips">
            {arenas.map((a) => (
              <button key={a.id} type="button" className={a.id === arena?.id ? "chip on" : "chip"} onClick={() => pickArena(a.id)}>
                {a.name}
              </button>
            ))}
            <button
              type="button"
              className="chip add-chip"
              onClick={() => setMakingArena(!makingArena)}
              aria-label="New arena"
            >
              <PlusIcon size={18} />
            </button>
          </div>
          {makingArena && <NewArenaForm onMade={pickArena} />}
        </div>

        <div className="field">
          <span>Who&apos;s it about?</span>
          <div className="face-picker">
            {friends.map((p) => (
              <button
                key={p.uid}
                type="button"
                className={subjectId === p.uid ? "face-choice on" : "face-choice"}
                onClick={() => setSubjectId(p.uid)}
              >
                <Avatar face={{ uid: p.uid, name: p.displayName, photoURL: p.photoURL }} size={52} />
                <span>{p.displayName.split(" ")[0]}</span>
              </button>
            ))}
            <button
              type="button"
              className={subjectId === "other" ? "face-choice other on" : "face-choice other"}
              onClick={() => setSubjectId("other")}
            >
              <span className="other-circle">···</span>
              <span>Other</span>
            </button>
          </div>
          {subjectId === "other" && (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={MAX_LABEL}
              placeholder="the weather, the game, the group chat"
            />
          )}
        </div>

        <div className="field">
          <span>When does it settle?</span>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={preset === p.value ? "chip on" : "chip"}
                onClick={() => setPreset(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <input type="date" value={customDate} min={today} onChange={(e) => setCustomDate(e.target.value)} />
          )}
        </div>

        <div className="field">
          <span>Your side</span>
          <div className="chips">
            <button type="button" className={side === "yes" ? "chip big yes on" : "chip big yes"} onClick={() => { setSide("yes"); setError(""); }}>
              Yes
            </button>
            <button type="button" className={side === "no" ? "chip big no on" : "chip big no"} onClick={() => { setSide("no"); setError(""); }}>
              No
            </button>
          </div>
        </div>

        <div className="field">
          <span>How sure are you? · {player?.tokens ?? "..."} tokens</span>
          {tokens > 0 && (
            <div className="stake-chips">
              {stakeChoices.map((n) => (
                <button key={n} type="button" className={stake === String(n) ? "chip on" : "chip"} onClick={() => setStake(String(n))}>
                  {n === 0 ? "None" : n === tokens ? `All ${n}` : n}
                </button>
              ))}
            </div>
          )}
          {tokens > 0 && (
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={player?.tokens}
            step={1}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="Or type an amount"
            aria-label="Tokens"
          />
          )}
        </div>

        <label className="check">
          <input type="checkbox" checked={shareAfter} onChange={(e) => setShareAfter(e.target.checked)} />
          <span>Send it to the group chat after I post</span>
        </label>

        {player?.tokens === 0 && (
          <p className="muted">You&apos;re out of tokens, so you&apos;ll back this one with none. You get {DAILY_TOKENS} more tomorrow.</p>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" className="main" disabled={posting || arenas.length === 0}>
          {posting ? "Posting..." : "Post call"}
        </button>
        <p className="muted small">
          {Number.isFinite(closeAt) ? `Picks close halfway, ${dayAndTime(closeAt, now)}` : "Picks close halfway to the deadline"}.
          If nobody else picks a side, it won&apos;t count and you get your tokens back.
        </p>
      </form>
    </main>
  );
}
