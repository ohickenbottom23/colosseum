import SignInButton from "./SignInButton";
import InviteSteps from "./InviteSteps";

// the signed-out screen when there's no call to preview: wordmark, one line, sign in, and
// the three "how it works" lines. same look as the shared-link screen, minus the call
export default function Landing({ tagline }: { tagline: string }) {
  return (
    <main className="invite landing">
      <h1 className="wordmark">Colosseum</h1>
      <p className="invite-hook landing-tagline">{tagline}</p>
      <SignInButton />
      <InviteSteps />
    </main>
  );
}
