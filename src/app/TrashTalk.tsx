"use client";

import { useState } from "react";
import { addDoc, collection, deleteDoc, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebase";
import { useTrashTalk } from "@/hooks";
import { errorText } from "@/format";
import { MAX_COMMENT } from "@/lib/constants";
import { canQuickReact, joinNames, lineUids, REACTIONS, reactionLabel, talkLines, validateComment } from "@/lib/trashTalk";
import { Comment, ReactionType } from "@/lib/types";
import Avatar, { Face } from "./ui/Avatar";
import AvatarStack from "./ui/AvatarStack";

// the trash talk thread on a call: typed comments and quick reactions, newest at the bottom.
// only arena members get to the call page, and the Firestore rules check that again on every write
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
  const messages = useTrashTalk(callId);
  const [text, setText] = useState("");
  const [error, setError] = useState(""); // shown by the comment box
  const [reactError, setReactError] = useState(""); // shown right under the quick reactions, where you tapped
  const [posting, setPosting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const thread = collection(db, "predictions", callId, "comments");

  // a quick reaction is a message in the thread too, just with no text
  async function react(type: ReactionType) {
    const problem = canQuickReact(messages, myUid, type);
    if (problem) {
      setReactError(problem);
      return;
    }
    setReactError("");
    try {
      await addDoc(thread, { uid: myUid, text: "", reaction: type, createdAt: serverTimestamp(), edited: false });
    } catch (err) {
      // say so where they tapped, and log it so a failed write is never silent
      console.error("Posting a quick reaction failed", err);
      setReactError(`Couldn't post that. ${errorText(err, "Try again.")}`);
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
      await addDoc(thread, { uid: myUid, text: text.trim(), createdAt: serverTimestamp(), edited: false });
      setText("");
    } catch (err) {
      console.error("Posting a comment failed", err);
      setError(`Couldn't post that. ${errorText(err, "Try again.")}`);
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
      await updateDoc(doc(thread, c.id), { text: editText.trim(), edited: true });
      setEditingId(null);
    } catch (err) {
      console.error("Editing a comment failed", err);
      setError(errorText(err, "Couldn't save that"));
    }
  }

  async function remove(list: Comment[]) {
    setError("");
    try {
      await Promise.all(list.map((c) => deleteDoc(doc(thread, c.id))));
    } catch (err) {
      console.error("Deleting from the thread failed", err);
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
            <button
              key={r.type}
              type="button"
              className="chip talk"
              onClick={() => react(r.type)}
              // greyed out right after you said it, until someone says something else
              disabled={!!canQuickReact(messages, myUid, r.type)}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      {reactError && <p className="error">{reactError}</p>}

      <ul className="comments">
        {talkLines(messages).map((line) => {
          // the same quick reaction from a few people in a row: one line with all their faces
          if (line.kind === "reaction") {
            const uids = lineUids(line.messages);
            const mine = line.messages.filter((m) => m.uid === myUid);
            return (
              <li key={line.messages[0].id} className="comment reaction-line">
                {uids.length === 1 ? (
                  <Avatar face={faceFor(uids[0])} size={30} />
                ) : (
                  <AvatarStack faces={uids.map(faceFor)} size={30} max={3} />
                )}
                <div className="comment-body">
                  <p>
                    <strong>{joinNames(uids.map(firstName))}</strong>{" "}
                    <span className="talk-chip">{reactionLabel(line.type)}</span>
                  </p>
                  {mine.length > 0 && open && (
                    <div className="comment-tools">
                      <button type="button" className="link-button" onClick={() => remove(mine)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          }

          const c = line.message;
          return (
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
                        <button type="button" className="link-button" onClick={() => remove([c])}>Delete</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {messages.length === 0 && open && <p className="muted small-left">No trash talk yet. Start it.</p>}

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
