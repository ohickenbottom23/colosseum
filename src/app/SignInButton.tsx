"use client";

import { useEffect, useState } from "react";
import { redirectSignInError, signInWithGoogle } from "@/signIn";

// the Google sign-in button. used on home, and on a call page when someone
// opens a shared link signed out (so they land back on that call after)
export default function SignInButton() {
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function signIn() {
    setError("");
    setSigningIn(true);
    // a redirect leaves the page, so this only matters for popups and errors
    setError(await signInWithGoogle());
    setSigningIn(false);
  }

  // if we just came back from a redirect sign-in, show any error from it
  useEffect(() => {
    redirectSignInError().then((problem) => {
      if (problem) setError(problem);
    });
  }, []);

  return (
    <>
      <button onClick={signIn} disabled={signingIn}>
        {signingIn ? "Signing in..." : "Sign in with Google"}
      </button>
      {error && <p className="error">{error}</p>}
    </>
  );
}
