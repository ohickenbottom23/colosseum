"use client";

import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useTrashTalk } from "@/hooks";
import { errorText } from "@/format";
import { MAX_COMMENT } from "@/lib/constants";
import { countReactions, REACTIONS, tapReaction, validateComment } from "@/lib/trashTalk";
import { Comment, ReactionType } from "@/lib/types";
import Avatar, { Face } from "./ui/Avatar";

// reactions and comments on a call. only arena members get to the call page,
// and the Firestore rules check that again on every write
export default function TrashTalk({
  callId,
  myUid,
  faceFor,
  open,
}: {
  callId: string;
  myUid: string;
  faceFor: (uid: string) => Face;
  open: boolean; // false once the subject takes the call down
}) {
  const { reactions, comments } = useTrashTalk(callId);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const counts = countReactions(reactions);
  const mine = reactions.find((r) => r.uid === myUid)?.type ?? null;
  const myReactionRef = doc(db, "predictions", callId, "reactions", myUid);

  async function react(type: ReactionType) {
    setError("");
    const next = tapReaction(mine, type);
    try {
      if (next) await setDoc(myReactionRef, { uid: myUid, type: next, createdAt: serverTimestamp() });
      else await deleteDoc(myReactionRef);
    } catch (err) {
      setError(errorText(err, "Couldn't save that"));
    }
  }

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateComment(text);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setPosting(true);
    try {
      await addDoc(collection(db, "predictions", callId, "comments"), {
        uid: myUid,
        text: text.trim(),
        createdAt: serverTimestamp(),
        edited: false,
      });
      setText("");
    } catch (err) {
      setError(errorText(err, "Couldn't post that"));
    }
    setPosting(false);
  }

  async function saveEdit(c: Comment) {
    const problem = validateComment(editText);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    try {
      await updateDoc(doc(db, "predictions", callId, "comments", c.id), { text: editText.trim(), edited: true });
      setEditingId(null);
    } catch (err) {
      setError(errorText(err, "Couldn't save that"));
    }
  }

  async function remove(c: Comment) {
    setError("");
    try {
      await deleteDoc(doc(db, "predictions", callId, "comments", c.id));
    } catch (err) {
      setError(errorText(err, "Couldn't delete that"));
    }
  }

  const firstName = (uid: string) => (uid === myUid ? "You" : faceFor(uid).name.split(" ")[0]);

  return (
    <section className="trash-talk">
      <h2>Trash talk</h2>

      {open && (
        <div className="chips">
          {REACTIONS.map((r) => (
            <button key={r.type} type="button" className={mine === r.type ? "chip talk on" : "chip talk"} onClick={() => react(r.type)}>
              {r.label} {counts[r.type] > 0 && <span className="talk-count">{counts[r.type]}</span>}
            </button>
          ))}
        </div>
      )}

      <ul className="comments">
        {comments.map((c) => (
          <li key={c.id} className="comment">
            <Avatar face={faceFor(c.uid)} size={30} />
            <div className="comment-body">
              {editingId === c.id ? (
                <div className="comment-edit">
                  <input value={editText} onChange={(e) => setEditText(e.target.value)} maxLength={MAX_COMMENT} aria-label="Edit comment" />
                  <div className="comment-tools">
                    <button type="button" className="link-button" onClick={() => saveEdit(c)}>Save</button>
                    <button type="button" className="link-button" onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <p>
                    <strong>{firstName(c.uid)}</strong> {c.text}
                    {c.edited && <span className="muted"> (edited)</span>}
                  </p>
                  {/* your own comments only */}
                  {c.uid === myUid && open && (
                    <div className="comment-tools">
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => {
                          setEditingId(c.id);
                          setEditText(c.text);
                        }}
                      >
                        Edit
                      </button>
                      <button type="button" className="link-button" onClick={() => remove(c)}>Delete</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {comments.length === 0 && open && <p className="muted small-left">No trash talk yet. Start it.</p>}

      {open && (
        <form className="comment-form" onSubmit={post}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_COMMENT}
            placeholder="Say something"
            aria-label="Comment"
          />
          <button type="submit" disabled={posting || !text.trim()}>Post</button>
        </form>
      )}
      {open && text.length > MAX_COMMENT - 40 && (
        <p className="muted small-left">{MAX_COMMENT - text.length} characters left</p>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
