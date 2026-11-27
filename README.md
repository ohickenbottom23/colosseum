# Colosseum

Social prediction game for college students. Next.js app on Firebase, running on the local emulators for now.

```
functions/         Cloud Functions (ensureUser makes your player record on first sign-in)
firestore.rules    who can read and write what
tests/             rules tests, run against the emulator
src/
  app/           Next.js pages
  firebase.ts    firebase setup, connects to the emulators locally
  lib/           game rules, no Firebase in here
    types.ts       data model (what goes in Firestore)
    constants.ts   all the numbers to tune
    glory.ts       glory math and leaderboard score
    tokens.ts      daily grant and pot split
    resolve.ts     create/join checks, void rules, settling, dispute votes
    game.test.ts   tests
```

## Run it locally

No real Firebase project needed. It uses the emulators with a fake `demo-colosseum` project (needs Java for the emulators).

```
npm install
cp .env.example .env.local
npm --prefix functions install
npm run emulators   # terminal 1, emulator UI at localhost:4000
npm run dev         # terminal 2, app at localhost:3000
```

Sign in with Google shows the emulator's fake account picker, so you can make as many test users as you want.

The emulators save their data to `.emulator-data/` when you stop them with Ctrl+C, and load it next time, so your test accounts and calls stick around. Killing the terminal some other way skips the save. To start over with an empty database, stop the emulators and delete that folder. `npm run test:rules` and `npm run test:functions` always use their own empty emulators.

## Tests

```
npm install
npm test
```

Rules tests (starts its own Firestore emulator, so stop `npm run emulators` first):

```
npm run test:rules
```

Cloud Functions tests (arenas, picking a side) against the auth, firestore, and functions emulators, same deal:

```
npm run test:functions
```

## Rules in here

- Every call belongs to one arena (a friend group). Only its members can see it or pick a side. Shared call links double as invites.
- Stakes come out of your tokens when you pick a side. Sides are locked.
- Winners get their stake back plus a share of the losers pot, split by how much they staked.
- Glory win = 50 x (0.2 + contrarian) x stake factor. Contrarian is the share of other players who picked the other side. Stake factor is stake / 50, capped at 2.
- Glory loss = 25 x stake factor. Glory can't go below 100.
- Leaderboard = glory x (wins + 5) / (calls + 10)
- 50 tokens a day, won't push you past 200.
- Voids if nobody but the creator joined, if the creator doesn't resolve within 48 hours, or if a dispute vote ties.
- You can't make a call about yourself, but you can pick a side on one about you.

## Deploying

Everything so far runs on the emulators with a fake `demo-colosseum` project. To put it on a real one:

1. Make a Firebase project on the Blaze plan (Cloud Functions and the 15 minute scheduled sweep need it). Turn on Authentication with Google, and Firestore.
2. Add it to `.firebaserc`, and make a `.env.local` (or your host's env settings) with the real values from the project settings:
   - `NEXT_PUBLIC_FIREBASE_API_KEY` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from the project
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` set to **the app's own domain** (like `colosseum.web.app` or your custom domain), not `<project>.firebaseapp.com`
   - `NEXT_PUBLIC_USE_EMULATORS=false`
3. Why the auth domain matters: phones sign in with a redirect, and browsers block it when the auth domain is a different site from the app, so people come back from Google not signed in. `next.config.ts` passes `/__/auth/...` on the app's domain through to Firebase's sign-in pages, which is what makes using the app's domain work.
4. In the Firebase console, add the app's domain under Authentication > Settings > Authorized domains.
5. In Google Cloud console > APIs & Services > Credentials, open the project's OAuth web client and add `https://<app domain>/__/auth/handler` as an authorized redirect URI.
6. Deploy the backend: `firebase deploy --only firestore:rules,firestore:indexes,functions`
7. Host the Next.js app (Firebase App Hosting, or any Next.js host), with the env values from step 2.
8. Check sign-in on a real phone, since that's the redirect path.
