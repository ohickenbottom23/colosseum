import Link from "next/link";
import { formatGlory } from "@/format";
import { progressToNext, rankName, tierForGlory } from "@/lib/ranks";
import { User } from "@/lib/types";
import RankShield from "./ui/RankShield";
import RankBar from "./ui/RankBar";

// your rank at a glance on home. tapping it opens the leaderboard
export default function RankStrip({ player }: { player: User }) {
  // players from before ranks existed get theirs filled in by the server, this covers the moment before
  const tier = player.rankTier ?? tierForGlory(player.glory);
  const onTheLine = player.onTheLine ?? false;
  const next = progressToNext(player.glory, tier);

  return (
    <Link href="/leaderboard" className="panel rank-strip">
      <RankShield tier={tier} size={34} onTheLine={onTheLine} />
      <div className="rank-strip-main">
        <p className="rank-name">{rankName(tier)}</p>
        <p className="rank-meta">
          <strong className="glory">{formatGlory(player.glory)} Glory</strong> · {player.wins} of {player.calls} right
        </p>
      </div>
      <div className="rank-strip-side">
        <RankBar tier={tier} progress={next.progress} onTheLine={onTheLine} />
        <p className="rank-next">{onTheLine ? "On the line" : next.nextName ? `${next.toGo} to ${next.nextName}` : "Top rank"}</p>
      </div>
    </Link>
  );
}
