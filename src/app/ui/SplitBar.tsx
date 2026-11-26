// YES vs NO. the bar is split by how many tokens are on each side, and each side can
// show its multiplier ("1.2x"). "big" is the call page version with large counts on top
export default function SplitBar({
  yesCount,
  noCount,
  yesTokens,
  noTokens,
  yesMultiplier,
  noMultiplier,
  big = false,
}: {
  yesCount: number;
  noCount: number;
  yesTokens?: number; // defaults to the head count if we don't know the tokens
  noTokens?: number;
  yesMultiplier?: number | null;
  noMultiplier?: number | null;
  big?: boolean;
}) {
  const yesWeight = yesTokens ?? yesCount;
  const noWeight = noTokens ?? noCount;
  const total = yesWeight + noWeight;
  // nobody yet: an even, empty looking bar
  const yesShare = total === 0 ? 0.5 : yesWeight / total;

  const multiplier = (m?: number | null) => (m ? ` · ${m.toFixed(1)}x` : "");

  return (
    <div className={big ? "split big" : "split"}>
      {big && (
        <div className="split-heads">
          <span className="yes">Yes {yesCount}</span>
          <span className="no">No {noCount}</span>
        </div>
      )}
      <div
        className="split-bar"
        role="img"
        aria-label={`${yesCount} picked yes, ${noCount} picked no`}
      >
        {total > 0 && (
          <>
            <div className="seg-yes" style={{ width: `${yesShare * 100}%` }} />
            <div className="seg-no" style={{ width: `${(1 - yesShare) * 100}%` }} />
          </>
        )}
        {!big && (
          <div className="split-labels">
            <span>
              YES {yesCount}
              {multiplier(yesMultiplier)}
            </span>
            <span>
              NO {noCount}
              {multiplier(noMultiplier)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
