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

Production is the Firebase project `colosseum-758d1` (the default in `.firebaserc`). Local dev doesn't touch it: `.env.local` points the app at the emulators, and every emulator and test script passes `--project demo-colosseum` (the `demo` alias).

The Next.js app runs on Firebase App Hosting, backend `colosseum` in `us-central1`, deployed from this folder (not from GitHub). Its production settings are in `apphosting.yaml`, and the files it skips are under `apphosting` in `firebase.json` (plus everything in `.gitignore`).

Deploy in this order (backend first, so the site never runs against old rules or functions):

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

```bash
firebase deploy --only functions
```

```bash
firebase deploy --only apphosting
```

The site is at https://colosseum--colosseum-758d1.us-central1.hosted.app.

### Sign-in settings (console, done once)

Phones sign in with a redirect, which needs the app's own address as the auth domain (`NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` in `apphosting.yaml`). `next.config.ts` passes `/__/auth/...` through to Firebase's sign-in pages so that works. Google also needs to trust that address:

1. Firebase console > Authentication > Settings > **Authorized domains**: add `colosseum--colosseum-758d1.us-central1.hosted.app`.
2. Google Cloud console > APIs & Services > **Credentials** > the "Web client (auto created by Google Service)":
   - Authorized JavaScript origins: `https://colosseum--colosseum-758d1.us-central1.hosted.app`
   - Authorized redirect URIs: `https://colosseum--colosseum-758d1.us-central1.hosted.app/__/auth/handler`
3. Google Auth Platform > **Branding**: the app name and support email on the Google screen. **Audience**: publishing status "In production", not "Testing" (Testing only lets listed test users in).

A custom domain later (App Hosting > Settings > Domains) means repeating these with that domain and changing the auth domain in `apphosting.yaml`.

### Installing on a phone

iPhone: Safari > Share > Add to Home Screen. Android: Chrome menu > Install app. It opens full screen with the garnet C icon (`src/app/manifest.ts`, `public/icons/`, `src/app/icon.png`, `src/app/apple-icon.png`). No offline mode yet.
