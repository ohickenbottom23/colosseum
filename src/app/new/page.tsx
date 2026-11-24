"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { useAuthUser, usePlayers } from "@/hooks";
import { DeadlinePreset, deadlineFromPreset, NewCall, validateNewCall } from "@/lib/calls";
import { MAX_CALL_TEXT, MAX_LABEL } from "@/lib/constants";

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

  const [text, setText] = useState("");
  const [aboutFriend, setAboutFriend] = useState(true);
  const [subjectId, setSubjectId] = useState("");
  const [label, setLabel] = useState("");
  const [preset, setPreset] = useState<DeadlinePreset>("week");
  const [customDate, setCustomDate] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);

  // this page is only for signed in players
  useEffect(() => {
    if (!loading && !authUser) router.replace("/");
  }, [loading, authUser, router]);

  if (!authUser) return <main><p>Loading...</p></main>;

  // you can't make a call about yourself, so leave yourself out
  const friends = players.filter((p) => p.uid !== authUser.uid);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!authUser) return;
    setError("");

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

    setPosting(true);
    try {
      await httpsCallable(functions, "createCall")(call);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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

      <form onSubmit={post} className="form">
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

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={posting}>{posting ? "Posting..." : "Post call"}</button>
      </form>
    </main>
  );
}
