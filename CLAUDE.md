# Colosseum

Social prediction game for college students. Friends in an arena (their friend group) make calls about each other's real lives (or anything else), pick a side, and stake tokens. Being right earns Glory, a permanent score. No real money anywhere, and tokens can't be bought.

## Stack and layout

- Next.js + Firebase (Auth, Firestore, Cloud Functions, Hosting), same setup as my other project
- `src/` for the app, `functions/` for Cloud Functions, Firebase emulators for local dev, config in `.env.local`
- Web app first, set up as a PWA so it installs to the home screen. No native app for now.
- Game rules live in `src/lib` as plain functions with tests in `src/lib/game.test.ts`. Run `npm test` after touching anything in there.

## Code style

- Keep it simple. Write it the way a student would, not like a senior engineer showing off.
- Short basic comments, only where something isn't obvious
- No clever abstractions, no extra libraries unless we talk about it first
- Small steps. Build one piece, get it working, then move on.

## Wording in the UI

Never use gambling words in anything a user sees. Say "call" or "prediction", not "bet" or "line". Say "back it" or "pick a side", not "wager". Glory is the reward, not "payout".

- Multipliers say "return": "3.0x return", "1.1x return". Never "payout", "pays", or "odds".
- Groups are called "arenas" everywhere a user can see.

## Game rules

Calls
- Free text plus a yes/no side. Tagged with a subject, either a person or a plain label like "the weather".
- You can't make a call about yourself, but you can pick a side on a call about you.
- The subject of a call can delete it.
- Deadline presets: tonight, this week, this month, or a custom date.
- Posted to exactly one arena. Only its members can see it, pick a side, or react. A call about a person needs that person to be in the arena.

Playing
- Stake any whole number of tokens you have. The stake comes out of your balance right away.
- Sides are locked once picked.
- The creator can pick a side too. If nobody besides the creator joins, the call is voided.

Resolution
- The creator resolves it within 48 hours of the deadline. If they don't, it's voided, everyone gets their stake back, and the creator's `missedResolves` goes up.
- Any participant can dispute a result. Then participants vote, majority wins, and a tie voids it.

Arenas
- An arena has a name, members (max 50), and an invite link. Any member can invite. A player can be in up to 30 arenas.
- Arena membership replaces the friends list. There's no "all friends" posting.
- Glory, rank, tokens, and records belong to the person, not the arena. Each arena's leaderboard ranks its members.
- A shared call link (`/call/{id}?i={inviteCode}`) is also an invite: signing in from it joins the arena and lands on that call. `/join/{inviteCode}` is a plain arena invite.
- Making and joining arenas happens in Cloud Functions (`createArena`, `joinArena`). Signed-out previews of an invite go through `previewInvite`, which needs the invite code.
- Anyone can leave (`leaveArena`). Only the owner (who made it) can remove people (`removeMember`), and removed people can't rejoin with the invite link (`removedIds`). If the owner leaves, whoever's been in longest becomes owner.
- When someone leaves or is removed, open calls in that arena they made, or that are about them, are voided with everyone refunded (`member_left`, no missed resolve). Calls about them also get their text wiped. Their picks on other people's calls stay and settle normally.

Tokens
- 50 tokens a day, but the daily grant won't push you past 200
- Winners get their stake back plus a share of the losers' pot, split by how much they staked. If nobody won, the pot disappears.

Glory
- Start at 100. It can't go below 100.
- Win: 50 x (0.2 + contrarian) x stakeFactor
- Loss: 25 x stakeFactor (losing costs less than winning pays)
- contrarian = share of other players who picked the opposite side (0 to 1)
- stakeFactor = stake / 50, capped at 2
- Kept to one decimal place, so tiny stakes still win and lose a little
- Leaderboard score = glory x (wins + 5) / (calls + 10), all time

Ranks (logic in `src/lib/ranks.ts`, tiers in `RANKS` in `src/lib/constants.ts`)
- I Recruit 100, II Gladiator 150, III Centurion 250, IV Champion 400, V Legend 600 (the number is the Glory floor)
- Crossing a higher rank's floor ranks you up right away (it can skip ranks)
- A settled loss that leaves you under your rank's floor puts you "on the line". You keep the rank.
- Your next settled loss while on the line drops you to the rank your Glory is in (can be more than one rank down)
- A win clears the line, even if you're still under the floor. Recruits can't be on the line (Glory can't go under 100).
- Voided calls never move rank
- `rankTier` and `onTheLine` live on the user and only the settle Cloud Function changes them. Each settled position gets a `rankResult` (before, after, onTheLine, gloryAfter) for the result screen.

Multipliers
- A side's multiplier = the whole pot / total staked on that side. When previewing a pick, include the player's own stake in both.
- Shown as "1.1x return" (see Wording). It matches `settle` give or take a token of rounding, and there's a test for that.

All the numbers are in `src/lib/constants.ts` and will get tuned after real people play.

## Security (important)

Friends will try to cheat. Clients must never write glory, tokens, wins, calls, or arena membership directly.
- Taking a side (deducting tokens and writing the position) happens in one transaction
- Settling, voiding, and the daily grant happen in Cloud Functions
- Firestore rules block clients from editing those fields
- Membership lives in two places that change together, only in Cloud Functions: `arenas/{id}.memberIds` and `users/{uid}.arenaIds`. The rules check `arenaIds` on your own user doc.
- Firestore rules: only members of a call's arena can read the call and its sides (and later reactions and comments). Queries must filter by `arenaId` (home uses `arenaId in [your arenas]`), or the rules turn them down.
- `npm run test:rules` and `npm run test:functions` run against the emulators. Add cases there when touching rules or functions.

## V1 scope

In: Google sign-in, arenas and invite links, create a call, pick a side, resolve, Glory updates, leaderboard tab. The home screen shows open calls that still need your side.

Not yet: activity feed, notifications, streaks, seasons, any monetization.

## Open questions

- Exact Glory numbers, to tune after playtesting
- What brings people back every day, to figure out after V1 works

## Brand

- Name is Colosseum (two s's, "eu")
- Mobile first. Almost everyone will use this on a phone.

Colors (CSS variables in `src/app/globals.css`, use the variables, not raw hex)
- Garnet #73000A page background, deep garnet #5A0008 for panels and the nav, panel border #8A2A2F
- Cream #F7F0E3 for cards, ink #2A0A0C for card text, muted #6B4E4A for quiet card text
- Gold #C9A227 ONLY for Glory, ranks, the wordmark, and the one main button on a screen (`button.main` or `a.button`). Nothing else: not headings, labels, chips, links, banners, or tabs.
- On cream cards Glory is garnet instead of gold, because gold on cream is too faint to read
- YES is #5B8FC7 and NO is #F2A65A everywhere, with #1B1410 text on both

Type
- Anton for the wordmark, rank names, and big numbers. Inter for everything else.
- Section labels (`h2`, `.label`, form field labels) are Inter 800, 12px, letterspaced, all caps

Pieces (in `src/app/ui/`, reuse these instead of rebuilding them)
- `Avatar`: Google profile photo, falling back to initials on a colored circle (the color comes from the uid)
- `AvatarStack`: overlapping faces with "+N"
- `SplitBar`: YES vs NO, split by tokens on each side, with each side's multiplier
- `RankShield`: shield with a Roman numeral, dashed when on the line
- `RankBar`: 5 segments, one per rank, the next one filling up

Motion (CSS only, no animation library)
- The split bar slides (300ms) when someone picks, the rank bar fills (500ms) when Glory changes, the shield flips (600ms) on a rank up
- Keep motion quick, and turn it off under `@media (prefers-reduced-motion: reduce)`

## More background

Read `docs/product.md` when working on anything user facing, or when a decision isn't covered here.
