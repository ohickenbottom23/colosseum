"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebase";
import { useAuthUser } from "@/hooks";
import SignInButton from "../../SignInButton";
import { errorText } from "@/format";

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
      <main>
        <h1>Colosseum</h1>
        <p className="error">{error}</p>
        <Link href="/" className="back">Go home</Link>
      </main>
    );
  }

  if (loading || !preview || authUser) return <main><p>Loading...</p></main>;

  return (
    <main>
      <h1>Colosseum</h1>
      <p className="call-big">{preview.arena.name}</p>
      <p className="muted">
        Arena · {preview.arena.memberCount} {preview.arena.memberCount === 1 ? "person" : "people"}
      </p>
      <p>Friends make calls about each other, pick a side, and earn Glory for being right.</p>
      <SignInButton label={`Join ${preview.arena.name} with Google`} />
    </main>
  );
}
