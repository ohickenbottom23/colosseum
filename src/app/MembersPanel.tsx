"use client";

import { useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { errorText } from "@/format";
import { ownerAfterLeaving } from "@/lib/arenas";
import { Arena, User } from "@/lib/types";
import Avatar from "./ui/Avatar";

// who's in an arena. the owner can remove people, and anyone can leave.
// both ask first, since open calls that depend on that person stop counting
export default function MembersPanel({
  arena,
  players,
  myUid,
  onLeft,
}: {
  arena: Arena;
  players: User[];
  myUid: string;
  onLeft: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null); // a uid to remove, or "leave"
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const members = arena.memberIds.map((id) => players.find((p) => p.uid === id)).filter(Boolean) as User[];
  const iOwnIt = arena.ownerId === myUid;
  const firstName = (u: User) => u.displayName.split(" ")[0];
  const nextOwner = players.find((p) => p.uid === ownerAfterLeaving(arena, myUid));

  async function run(name: string, data: object, after?: () => void) {
    setError("");
    setWorking(true);
    try {
      await httpsCallable(functions, name)(data);
      setConfirming(null);
      after?.();
    } catch (err) {
      setError(errorText(err, "Something went wrong"));
    }
    setWorking(false);
  }

  if (!open) {
    return (
      <button type="button" className="link-button" onClick={() => setOpen(true)}>
        Members · {arena.memberIds.length}
      </button>
    );
  }

  return (
    <div className="panel members">
      <div className="members-head">
        <h2>Members · {arena.memberIds.length}</h2>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          Done
        </button>
      </div>

      <ul>
        {members.map((u) => (
          <li key={u.uid}>
            <div className="member-row">
              <Avatar face={{ uid: u.uid, name: u.displayName, photoURL: u.photoURL }} size={32} />
              <span className="member-name">
                {u.uid === myUid ? "You" : u.displayName}
                {u.uid === arena.ownerId && <span className="owner-tag">Owner</span>}
              </span>
              {iOwnIt && u.uid !== myUid && confirming !== u.uid && (
                <button type="button" className="link-button" onClick={() => setConfirming(u.uid)}>
                  Remove
                </button>
              )}
            </div>

            {confirming === u.uid && (
              <div className="confirm">
                <p>
                  Remove {firstName(u)}? They can&apos;t rejoin with the invite link. Open calls they made here, or that are
                  about them, won&apos;t count, and everyone gets their tokens back.
                </p>
                <div className="confirm-buttons">
                  <button type="button" onClick={() => run("removeMember", { arenaId: arena.id, uid: u.uid })} disabled={working}>
                    {working ? "Removing..." : `Remove ${firstName(u)}`}
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirming(null)} disabled={working}>
                    Keep them
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {confirming === "leave" ? (
        <div className="confirm">
          <p>
            Leave {arena.name}? Open calls you made here, and calls about you, won&apos;t count, and everyone gets their tokens
            back. Your picks on other calls still count.
            {iOwnIt && nextOwner && ` ${firstName(nextOwner)} becomes the owner.`}
          </p>
          <div className="confirm-buttons">
            <button type="button" onClick={() => run("leaveArena", { arenaId: arena.id }, onLeft)} disabled={working}>
              {working ? "Leaving..." : "Leave"}
            </button>
            <button type="button" className="secondary" onClick={() => setConfirming(null)} disabled={working}>
              Stay
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="link-button leave-link" onClick={() => setConfirming("leave")}>
          Leave {arena.name}
        </button>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
