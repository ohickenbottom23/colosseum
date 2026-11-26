// five segments, one per rank. ranks you've reached are filled, and the next one fills
// up as you get closer to it. on the line, your current rank's segment is dashed instead
export default function RankBar({
  tier,
  progress,
  onTheLine = false,
}: {
  tier: number; // 1 to 5
  progress: number; // 0 to 1, how far toward the next rank
  onTheLine?: boolean;
}) {
  return (
    <div className="rank-bar" role="img" aria-label={`Rank ${tier} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        if (onTheLine && n === tier) return <div key={n} className="rank-seg line" />;
        let fill = 0;
        if (n <= tier) fill = 1;
        else if (n === tier + 1) fill = Math.min(Math.max(progress, 0), 1);
        return (
          <div key={n} className="rank-seg">
            <div className="fill" style={{ width: `${fill * 100}%` }} />
          </div>
        );
      })}
    </div>
  );
}
