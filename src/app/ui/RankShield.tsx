const NUMERALS = ["I", "II", "III", "IV", "V"];

// a gold shield with the rank's roman numeral. when you're on the line it's just a dashed outline
export default function RankShield({ tier, size = 40, onTheLine = false }: { tier: number; size?: number; onTheLine?: boolean }) {
  const numeral = NUMERALS[Math.min(Math.max(tier, 1), 5) - 1];

  return (
    <svg className="shield" width={size} height={size * 1.15} viewBox="0 0 40 46" role="img" aria-label={`Rank ${numeral}`}>
      <path
        d="M20 2 L37 8 V22 C37 33 29 41 20 44 C11 41 3 33 3 22 V8 Z"
        fill={onTheLine ? "none" : "var(--gold)"}
        stroke="var(--gold)"
        strokeWidth={onTheLine ? 2 : 0}
        strokeDasharray={onTheLine ? "4 3" : undefined}
      />
      <text
        x="20"
        y="30"
        textAnchor="middle"
        fontFamily="var(--font-anton), Impact, sans-serif"
        fontSize={numeral.length > 2 ? 13 : 16}
        fill={onTheLine ? "var(--gold)" : "var(--garnet-deep)"}
      >
        {numeral}
      </text>
    </svg>
  );
}
