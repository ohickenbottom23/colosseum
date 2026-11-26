"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { errorText } from "@/format";

// lets the person a call is about take it down, with a confirm step first.
// used on the call page and in the "About you" section on home
export default function TakeDown({
  callId,
  myStake,
  label,
  onDone,
}: {
  callId: string;
  myStake: number | null; // what they put on it themselves, they don't get that back
  label: string;
  onDone?: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function takeDown() {
    setError("");
    setWorking(true);
    try {
      await httpsCallable(functions, "deleteCall")({ predictionId: callId });
      onDone?.();
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
      setWorking(false);
    }
  }

  return (
    <div className="takedown">
      {!confirming ? (
        <button type="button" className="link-button" onClick={() => setConfirming(true)}>
          {label}
        </button>
      ) : (
        <div className="form">
          <p>
            This removes the call for everyone and gives everyone their tokens back
            {myStake ? `, except your own ${myStake}` : ""}. You can&apos;t undo it.
          </p>
          <button onClick={takeDown} disabled={working}>{working ? "Taking it down..." : "Take it down"}</button>
          <button className="secondary" onClick={() => setConfirming(false)} disabled={working}>
            Keep it up
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
