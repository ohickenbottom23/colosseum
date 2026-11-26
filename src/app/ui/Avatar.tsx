"use client";

import { useState } from "react";

// colors for faces with no photo. none of them are gold, YES blue, or NO orange
const FACE_COLORS = ["#5b4a8b", "#3f6b3a", "#3e5170", "#2f5e63", "#8a5a3c", "#7a3b45", "#4f5a2e", "#6a3f6b"];

// the same person always gets the same color
function colorFor(uid: string): string {
  // mixes every character in, so similar ids still land on different colors
  let hash = 0;
  for (const ch of uid) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return FACE_COLORS[hash % FACE_COLORS.length];
}

// "Jake Kim" -> "JK", "Maya" -> "MA"
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export type Face = { uid: string; name: string; photoURL: string | null };

// a Face from a player record. if we don't have them loaded, show "?" for now
export function faceOf(uid: string, players: { uid: string; displayName: string; photoURL: string | null }[]): Face {
  const p = players.find((x) => x.uid === uid);
  return { uid, name: p?.displayName ?? "?", photoURL: p?.photoURL ?? null };
}

// someone's Google photo, or their initials on a colored circle if there isn't one (or it won't load)
export default function Avatar({ face, size = 36 }: { face: Face; size?: number }) {
  const [broken, setBroken] = useState(false);
  const showPhoto = face.photoURL && !broken;

  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: colorFor(face.uid) }}
      title={face.name}
      role="img"
      aria-label={face.name}
    >
      {showPhoto ? (
        // Google photos need no-referrer or they sometimes refuse to load
        // eslint-disable-next-line @next/next/no-img-element
        <img src={face.photoURL!} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
      ) : (
        initials(face.name)
      )}
    </span>
  );
}
