# Colosseum

Social prediction game for college students. Friends make calls about each other's real lives (or anything else), pick a side, and stake tokens. Being right earns Glory, a permanent score. No real money anywhere, and tokens can't be bought.

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

## Game rules

Calls
- Free text plus a yes/no side. Tagged with a subject, either a person or a plain label like "the weather".
- You can't make a call about yourself, but you can pick a side on a call about you.
- The subject of a call can delete it.
- Deadline presets: tonight, this week, this month, or a custom date.
- Posted to a group or to all your friends.

Playing
- Stake any whole number of tokens you have. The stake comes out of your balance right away.
- Sides are locked once picked.
- The creator can pick a side too. If nobody besides the creator joins, the call is voided.

Resolution
- The creator resolves it within 48 hours of the deadline. If they don't, it's voided, everyone gets their stake back, and the creator's `missedResolves` goes up.
- Any participant can dispute a result. Then participants vote, majority wins, and a tie voids it.

Tokens
- 50 tokens a day, but the daily grant won't push you past 200
- Winners get their stake back plus a share of the losers' pot, split by how much they staked. If nobody won, the pot disappears.

Glory
- Start at 100. It can't go below 100.
- Win: 10 x (0.2 + contrarian) x stakeFactor
- Loss: 5 x stakeFactor (losing costs less than winning pays)
- contrarian = share of other players who picked the opposite side (0 to 1)
- stakeFactor = stake / 50, capped at 2
- Kept to one decimal place, so tiny stakes still win and lose a little
- Leaderboard score = glory x (wins + 5) / (calls + 10), all time

All the numbers are in `src/lib/constants.ts` and will get tuned after real people play.

## Security (important)

Friends will try to cheat. Clients must never write glory, tokens, wins, or calls directly.
- Taking a side (deducting tokens and writing the position) happens in one transaction
- Settling, voiding, and the daily grant happen in Cloud Functions
- Firestore rules block clients from editing those fields

## V1 scope

In: Google sign-in, create a call, pick a side, resolve, Glory updates, leaderboard tab. The home screen shows open calls that still need your side.

Not yet: groups and invite links, activity feed, notifications, streaks, seasons, any monetization.

## Open questions

- How people find each other in V1 before groups exist. Maybe everyone signed in sees everyone, since only friends will have the link.
- Exact Glory numbers, to tune after playtesting
- What brings people back every day, to figure out after V1 works
