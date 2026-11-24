# Colosseum

Game logic for Colosseum. No Firebase or UI yet, just the rules.

```
src/lib/
  types.ts       data model (what goes in Firestore)
  constants.ts   all the numbers to tune
  glory.ts       glory math and leaderboard score
  tokens.ts      daily grant and pot split
  resolve.ts     create/join checks, void rules, settling, dispute votes
  game.test.ts   tests
```

Run tests:

```
npm install
npm test
```

## Rules in here

- Stakes come out of your tokens when you pick a side. Sides are locked.
- Winners get their stake back plus a share of the losers pot, split by how much they staked.
- Glory win = 10 x (0.2 + contrarian) x stake factor. Contrarian is the share of other players who picked the other side. Stake factor is stake / 50, capped at 2.
- Glory loss = 5 x stake factor. Glory can't go below 100.
- Leaderboard = glory x (wins + 5) / (calls + 10)
- 50 tokens a day, won't push you past 200.
- Voids if nobody but the creator joined, if the creator doesn't resolve within 48 hours, or if a dispute vote ties.
- You can't make a call about yourself, but you can pick a side on one about you.
