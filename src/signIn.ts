import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect } from "firebase/auth";
import { auth } from "@/firebase";

// rough check, good enough to pick popup vs redirect
function onPhone(): boolean {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// leaves the page for Google's sign-in and comes back signed in
async function redirect(provider: GoogleAuthProvider): Promise<string> {
  try {
    await signInWithRedirect(auth, provider);
    return "";
  } catch {
    return "Couldn't sign in. Try again.";
  }
}

// signs in with Google. returns an error message, or "" if it worked (or the person backed out).
// popups are flaky on phones and break when the app is installed to the home screen,
// so phones go straight to a redirect. anywhere else, a blocked popup falls back to one
export async function signInWithGoogle(): Promise<string> {
  const provider = new GoogleAuthProvider();
  if (onPhone()) return redirect(provider);

  try {
    await signInWithPopup(auth, provider);
    return "";
  } catch (err) {
    const code = (err as { code?: string }).code;
    // closing the popup yourself isn't an error
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return "";
    if (code === "auth/popup-blocked") return redirect(provider);
    return "Couldn't sign in. Try again.";
  }
}

// after coming back from a redirect, this tells us if it failed.
// when it works, onAuthStateChanged already picks up the new user on its own
export async function redirectSignInError(): Promise<string> {
  try {
    await getRedirectResult(auth);
    return "";
  } catch {
    return "Couldn't sign in. Try again.";
  }
}
