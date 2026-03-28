import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { auth } from './config';

// Ensure Firebase Auth session persists in localStorage indefinitely.
// This means the anonymous UID is reused on every page load in the same
// browser — it only changes if the user clears browser storage.
setPersistence(auth, browserLocalPersistence).catch(console.error);

/**
 * Signs in anonymously with Firebase Auth.
 * If an anonymous session already exists (same browser), Firebase reuses
 * the same UID automatically — this is NOT a fresh sign-in.
 * Returns the user object with a stable uid.
 */
export async function anonSignIn() {
  const { user } = await signInAnonymously(auth);
  return user;
}

/**
 * Signs out of Firebase Auth.
 * NOTE: We intentionally do NOT call this on QC app logout —
 * keeping the anonymous session alive means the UID stays stable
 * for Firestore rules on the next login from this browser.
 */
export async function anonSignOut() {
  await signOut(auth);
}

export { onAuthStateChanged, auth };
