// the three "how it works" lines on invite screens, for people who've never seen the app
export default function InviteSteps() {
  return (
    <div className="panel how-it-works">
      <ol>
        <li>
          <span className="step">1</span> Make calls about people in your arena
        </li>
        <li>
          <span className="step">2</span> Back a side with free tokens
        </li>
        <li>
          <span className="step">3</span> Be right, earn Glory, run the arena
        </li>
      </ol>
      <p className="how-note">No money, ever. Tokens are free and can&apos;t be bought.</p>
    </div>
  );
}
