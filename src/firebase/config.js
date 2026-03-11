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
  // measurementId is optional, so we'll leave it out unless you want to add it
};

const app = initializeApp(firebaseConfig);

// If you have a specific database ID in Vercel, it uses it; otherwise, it uses (default)
const dbId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
export const db = dbId ? getFirestore(app, dbId) : getFirestore(app);

export const rtdb = getDatabase(app);
export default app;