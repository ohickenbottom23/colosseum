"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { useAuthUser, useMyArenas, usePlayer, usePlayers } from "@/hooks";
import { DeadlinePreset, deadlineFromPreset, NewCall, validateNewCall } from "@/lib/calls";
import { DAILY_TOKENS, MAX_CALL_TEXT, MAX_LABEL } from "@/lib/constants";
import { canTakeSide } from "@/lib/resolve";
import { Prediction, Side } from "@/lib/types";
import { errorText } from "@/format";

const PRESETS: { value: DeadlinePreset; label: string }[] = [
  { value: "tonight", label: "Tonight" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Pick a date" },
];

export default function NewCallPage() {
  const router = useRouter();
  const { authUser, loading } = useAuthUser();
  const players = usePlayers(!!authUser);
  const player = usePlayer(authUser?.uid ?? null);
  const arenas = useMyArenas(authUser?.uid ?? null);
  const [arenaId, setArenaId] = useState("");

  const [text, setText] = useState("");
  const [aboutFriend, setAboutFriend] = useState(true);
  const [subjectId, setSubjectId] = useState("");
  const [label, setLabel] = useState("");
  const [preset, setPreset] = useState<DeadlinePreset>("week");
  const [customDate, setCustomDate] = useState("");
  const [side, setSide] = useState<Side | null>(null);
  const [stake, setStake] = useState("");
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

  function pickArena(id: string) {
    setArenaId(id);
    setSubjectId(""); // the person you picked might not be in the new arena
  }

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
      subjectId: aboutFriend ? subjectId || null : null,
      subjectLabel: aboutFriend ? null : label,
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
    const amount = Number(stake);
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
    try {
      await httpsCallable(functions, "createCall")({ ...call, arenaId: arena.id, side, stake: amount });
      router.push("/");
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
      setPosting(false);
    }
  }

  // today as "2026-11-23" so the date picker can't go into the past
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <main>
      <Link href="/" className="back">← Back</Link>
      <h1>Make a call</h1>

      {arenas.length === 0 && (
        <p className="muted">
          You need to be in an arena to make a call. <Link href="/">Make one on home</Link>, or open an invite link
          from a friend.
        </p>
      )}

      <form onSubmit={post} className="form">
        {arenas.length > 1 && (
          <div className="field">
            <span>Which arena?</span>
            <div className="chips">
              {arenas.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className={a.id === arena?.id ? "chip on" : "chip"}
                  onClick={() => pickArena(a.id)}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="field">
          <span>What&apos;s your call?</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CALL_TEXT}
            rows={3}
            placeholder="Jake makes it to his 8am every day this week"
          />
        </label>

        <div className="field">
          <span>It&apos;s about</span>
          <div className="chips">
            <button type="button" className={aboutFriend ? "chip on" : "chip"} onClick={() => setAboutFriend(true)}>
              A friend
            </button>
            <button type="button" className={!aboutFriend ? "chip on" : "chip"} onClick={() => setAboutFriend(false)}>
              Something else
            </button>
          </div>

          {aboutFriend ? (
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Pick a friend</option>
              {friends.map((p) => (
                <option key={p.uid} value={p.uid}>{p.displayName}</option>
              ))}
            </select>
          ) : (
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={MAX_LABEL}
              placeholder="the weather, the game, the group chat"
            />
          )}
        </div>

        <div className="field">
          <span>Deadline</span>
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
            <button type="button" className={side === "yes" ? "chip big on" : "chip big"} onClick={() => { setSide("yes"); setError(""); }}>
              Yes
            </button>
            <button type="button" className={side === "no" ? "chip big on" : "chip big"} onClick={() => { setSide("no"); setError(""); }}>
              No
            </button>
          </div>
        </div>

        <div className="field">
          <span>How many tokens? You have {player?.tokens ?? "..."}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={player?.tokens}
            step={1}
            value={stake}
            onChange={(e) => setStake(e.target.value)}
            placeholder="10"
          />
          {player && player.tokens > 0 && (
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
          )}
        </div>

        {player?.tokens === 0 && (
          <p className="muted">You need at least 1 token to back a call. You get {DAILY_TOKENS} more tomorrow.</p>
        )}

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={posting || player?.tokens === 0 || arenas.length === 0}>
          {posting ? "Posting..." : side ? `Post and back ${side.toUpperCase()}` : "Post call"}
        </button>
        <p className="muted small">If nobody else picks a side, it won&apos;t count and you get your tokens back.</p>
      </form>
    </main>
  );
}
