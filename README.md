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

Local dev runs on the emulators with a fake `demo-colosseum` project. Going live uses a real Firebase project: Firestore, Auth and Cloud Functions, plus Firebase App Hosting to run the Next.js app. App Hosting builds from GitHub every time `main` is pushed. Steps marked **(console)** are clicks in the Firebase or Google Cloud console. The rest are terminal commands.

### 1. Make the project (console)

1. At console.firebase.google.com, add a project. Google Analytics isn't needed.
2. Upgrade it to the **Blaze** plan. Cloud Functions, the 15 minute sweep and App Hosting all need it. Then set a budget alert in Google Cloud > Billing > Budgets & alerts (a few dollars is plenty for friend groups).
3. Build > **Authentication** > Get started > Sign-in method > **Google** > Enable, and pick a support email.
4. Build > **Firestore Database** > Create database > **production mode**. Pick `nam5 (United States)`. The location can't change later.
5. Project settings > General > Your apps > the **Web** (`</>`) button. Name it, leave "Firebase Hosting" unchecked, and copy `apiKey` and `projectId` from the config it shows.

### 2. Point the code at it (terminal)

```bash
firebase login
firebase use --add      # pick the new project, call it "prod"
```

Fill in the three `REPLACE_ME` values in `apphosting.yaml`:
- `NEXT_PUBLIC_FIREBASE_API_KEY` and `NEXT_PUBLIC_FIREBASE_PROJECT_ID` from step 1.5
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = the app's own address, `colosseum--<project-id>.us-central1.hosted.app` (with the backend named `colosseum` in step 3). Not `<project-id>.firebaseapp.com`: phones sign in with a redirect, and browsers block that when the auth domain is a different site from the app. `next.config.ts` passes `/__/auth/...` through to Firebase's sign-in pages so the app's own address works.

`.env.local` stays as it is, so local dev keeps using the emulators. Commit and push.

Then deploy the backend (rules, indexes, functions):

```bash
firebase deploy --only firestore,functions --project prod
```

The first time, it turns on the Google Cloud APIs it needs, and asks how long to keep old function images (1 day is fine). The indexes take a few minutes to build after that.

### 3. Host the app (console)

Build > **App Hosting** > Get started:
- region `us-central1`
- connect GitHub and pick this repo, root directory `/`, live branch `main`, automatic rollouts on
- backend name `colosseum`
- link it to the web app from step 1.5

The first rollout starts right away. After that, every push to `main` deploys.

### 4. Let sign-in work on that address (console)

1. Firebase > Authentication > Settings > **Authorized domains** > add `colosseum--<project-id>.us-central1.hosted.app`.
2. Google Cloud console > APIs & Services > **Credentials** (also under Google Auth Platform > Clients) > the "Web client (auto created by Google Service)":
   - Authorized JavaScript origins: add `https://colosseum--<project-id>.us-central1.hosted.app`
   - Authorized redirect URIs: add `https://colosseum--<project-id>.us-central1.hosted.app/__/auth/handler`
3. Google Auth Platform > **Branding**: the app name and support email people see on the Google screen. Under **Audience**, make sure the publishing status is "In production", not "Testing". Testing only lets listed test users sign in, and just name and email need no review.

A custom domain later (App Hosting > Settings > Domains) means repeating step 4 and the auth domain value for that domain.

### 5. Check it on a real phone

- Sign in on an iPhone in Safari and on Android in Chrome, since phones use the redirect path.
- Install it. On iPhone: Share > Add to Home Screen. On Android: Chrome's menu > Install app (or the banner). It opens full screen with the garnet C icon. The manifest is `src/app/manifest.ts`, and the icons are in `public/icons/` and `src/app/icon.png` / `apple-icon.png`. There's no offline mode yet.
