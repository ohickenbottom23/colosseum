// YES vs NO. the bar is split by how many tokens are on each side, and each side is labeled
// with its multiplier ("YES · 2.5x"). the faces under the bar show who's on each side, so no
// head counts here. "big" is the call page version with the labels large on top
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

  // "YES · 2.5x", or just "YES" when nobody's on that side yet
  const label = (side: string, m?: number | null) => (m ? `${side} · ${m.toFixed(1)}x` : side);

  return (
    <div className={big ? "split big" : "split"}>
      {big && (
        <div className="split-heads">
          <span className="yes">{label("Yes", yesMultiplier)}</span>
          <span className="no">{label("No", noMultiplier)}</span>
        </div>
      )}
      <div
        className="split-bar"
        role="img"
        aria-label={`${yesCount} picked yes, ${noCount} picked no`}
      >
        {/* always drawn (see-through while nobody's picked) so the widths can slide when someone picks */}
        <div className={total > 0 ? "seg-yes" : "seg-yes empty"} style={{ width: `${yesShare * 100}%` }} />
        <div className={total > 0 ? "seg-no" : "seg-no empty"} style={{ width: `${(1 - yesShare) * 100}%` }} />
        {!big && (
          <div className="split-labels">
            <span>{label("YES", yesMultiplier)}</span>
            <span>{label("NO", noMultiplier)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
