import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

/** * SYSTEM UPDATE: Using explicit database ID found in Firebase Console
 * This resolves the "Database (default) not found" error.
 */
const DATABASE_ID = "ai-studio-c6dc4d45-0b54-40b7-9703-bac80cd29c3f";

export const db = getFirestore(app, DATABASE_ID);
export const rtdb = getDatabase(app);

export default app;