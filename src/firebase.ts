import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

// hot reload runs this file again, so reuse the app if it already exists
const app = getApps().length ? getApp() : initializeApp(config);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// only connect once, connecting twice throws. globalThis survives hot reload
const g = globalThis as { emulatorsConnected?: boolean };

if (process.env.NEXT_PUBLIC_USE_EMULATORS === "true" && !g.emulatorsConnected) {
  // "localhost", not 127.0.0.1, so the emulator counts as the same site as the app (localhost:3000).
  // browsers wall off storage between different sites, which breaks redirect sign-in
  connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
  g.emulatorsConnected = true;
}
