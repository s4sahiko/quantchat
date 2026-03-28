import {
  signInAnonymously,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from './config';

/**
 * Signs in anonymously with Firebase Auth.
 * Returns the anonymous user's uid, which is used as the server-side
 * identity token for Firestore/RTDB write authorization.
 * Each session gets a fresh anonymous token — no personal data is stored.
 */
export async function anonSignIn() {
  const { user } = await signInAnonymously(auth);
  return user;
}

export async function anonSignOut() {
  await signOut(auth);
}

export { onAuthStateChanged, auth };
