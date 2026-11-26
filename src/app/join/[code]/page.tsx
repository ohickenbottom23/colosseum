"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { useAuthUser } from "@/hooks";
import { errorText } from "@/format";
import SignInButton from "../../SignInButton";
import InviteSteps from "../../InviteSteps";

type ArenaPreview = { arena: { name: string; memberCount: number } };

// an arena invite link. signed out it shows the arena and a sign in button.
// once you're signed in it joins you and takes you home
export default function JoinPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const { authUser, loading, ready } = useAuthUser();
  const [preview, setPreview] = useState<ArenaPreview | null>(null);
  const [error, setError] = useState("");

  // what arena this is, so they know what they're joining
  useEffect(() => {
    httpsCallable<{ code: string }, ArenaPreview>(functions, "previewInvite")({ code })
      .then((res) => setPreview(res.data))
      .catch((err) => setError(errorText(err, "That invite link doesn't work")));
  }, [code]);

  // signed in: join it (does nothing if you're already in) and go home
  useEffect(() => {
    if (!authUser || !ready) return;
    httpsCallable(functions, "joinArena")({ code })
      .then(() => router.replace("/"))
      .catch((err) => setError(errorText(err, "Couldn't join the arena")));
  }, [authUser, ready, code, router]);

  if (error) {
    return (
      <main className="invite">
        <h1 className="wordmark">Colosseum</h1>
        <p className="error">{error}</p>
        <Link href="/">Go home</Link>
      </main>
    );
  }

  if (loading || !preview || authUser) return <main><p>Loading...</p></main>;

  const people = `${preview.arena.memberCount} ${preview.arena.memberCount === 1 ? "person" : "people"}`;

  return (
    <main className="invite">
      <h1 className="wordmark">Colosseum</h1>
      <p className="arena-tag">Arena · {people}</p>
      <p className="invite-arena-name">{preview.arena.name}</p>
      <p className="invite-hook">Your friends are making calls about each other. Get in and pick a side.</p>
      <SignInButton label={`Join ${preview.arena.name} with Google`} />
      <InviteSteps />
    </main>
  );
}
