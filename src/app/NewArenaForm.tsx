"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { validateArenaName } from "@/lib/arenas";
import { MAX_ARENA_NAME } from "@/lib/constants";
import { errorText } from "@/format";

// name a new arena and make it. you're its first member
export default function NewArenaForm({ onMade }: { onMade?: (arenaId: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [making, setMaking] = useState(false);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateArenaName(name);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setMaking(true);
    try {
      const res = await httpsCallable<{ name: string }, { id: string }>(functions, "createArena")({ name });
      setName("");
      onMade?.(res.data.id);
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
    }
    setMaking(false);
  }

  return (
    <form onSubmit={make} className="form">
      <label className="field">
        <span>Name your arena</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_ARENA_NAME} placeholder="Third Floor" />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={making}>{making ? "Making it..." : "Make the arena"}</button>
    </form>
  );
}
