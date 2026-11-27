// YES vs NO. the bar is split by how many tokens are on each side, and each side is labeled
// with its multiplier ("YES · 2.5x"). the faces under the bar show who's on each side, so no
// head counts here. "big" is the call page version with the labels large on top

// how wide (in %) a side with nothing on it is drawn, so you can still see its color
const SLIVER = 6;

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

  // a side with nothing on it is a thin sliver of its color, and the other side gets the rest.
  // if both are empty, both are slivers with the empty track in between
  let yesWidth: number;
  let noWidth: number;
  if (yesWeight === 0 && noWeight === 0) {
    yesWidth = SLIVER;
    noWidth = SLIVER;
  } else if (yesWeight === 0) {
    yesWidth = SLIVER;
    noWidth = 100 - SLIVER;
  } else if (noWeight === 0) {
    yesWidth = 100 - SLIVER;
    noWidth = SLIVER;
  } else {
    yesWidth = (yesWeight / (yesWeight + noWeight)) * 100;
    noWidth = 100 - yesWidth;
  }

  // "YES · 2.5x", "YES · be first" when nobody's on that side, or just "YES"
  const label = (side: string, count: number, m?: number | null) => {
    if (count === 0) {
      return (
        <>
          {side} <span className="be-first">· be first</span>
        </>
      );
    }
    return m ? `${side} · ${m.toFixed(1)}x` : side;
  };

  return (
    <div className={big ? "split big" : "split"}>
      {big && (
        <div className="split-heads">
          <span className="yes">{label("Yes", yesCount, yesMultiplier)}</span>
          <span className="no">{label("No", noCount, noMultiplier)}</span>
        </div>
      )}
      <div
        className="split-bar"
        role="img"
        aria-label={`${yesCount} picked yes, ${noCount} picked no`}
      >
        {/* both always drawn so the widths can slide when someone picks */}
        <div className="seg-yes" style={{ width: `${yesWidth}%` }} />
        <div className="seg-no" style={{ width: `${noWidth}%` }} />
        {!big && (
          <div className="split-labels">
            <span>{label("YES", yesCount, yesMultiplier)}</span>
            <span>{label("NO", noCount, noMultiplier)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
