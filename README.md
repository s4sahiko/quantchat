# QuantChat — Secure E2E Messenger

QuantChat is a privacy-first, end-to-end encrypted chat application built with React, Vite, and Firebase. It uses a custom **3-Factor Identity** system and Web Crypto API for maximum security.

## 📁 Project Structure

```text
quant-chat/
├── src/
│   ├── components/
│   │   ├── App.jsx           # Main entry, session restore, and routing
│   │   ├── CreateIdentity.jsx # Step-by-step identity & key generation
│   │   ├── Login.jsx          # ECDH private key decryption & auth
│   │   └── panels/           # UI panels (Chats, Profile, Notifications)
│   ├── firebase/
│   │   ├── config.js         # Firebase SDK initialization
│   │   ├── auth.js           # Anonymous Auth wrappers
│   │   ├── firestore.js      # Typed Firestore collection helpers
│   │   └── realtimedb.js     # RTDB references for vanish/typing
│   ├── utils/
│   │   ├── encryption.js     # ECDH + AES-GCM + PBKDF2 logic
│   │   ├── sessionKeyStore.js # Secure IDB key wrapping
│   │   └── screenshotBlock.js # UI deterrents for privacy
│   └── main.jsx
├── firestore.rules          # Hardened owner-only access rules
├── database.rules.json       # Restricted RTDB authentication rules
└── firebase.json             # Firebase deployment config
```

## 🛠️ How It Works

### 1. Identity Creation (The "3 Factors")
Users generate a unique **QC-Number** using three secret factors:
1.  **Encryption Key**: Alphanumeric string (min 12 chars). Used as the source of entropy for PBKDF2.
2.  **Pattern**: A keyword or a chess-move sequence.
3.  **QC-Number**: A randomly assigned identifier.

### 2. Cryptographic Architecture
*   **Key Exchange**: Uses **ECDH P-256** to derive shared secrets between contacts.
*   **Message Encryption**: Uses **AES-256-GCM** with a fresh random IV per message.
*   **Key Stretching**: Uses **PBKDF2** (100,000 iterations) with a random salt to protect the private key at rest.
*   **At-Rest Security**: Your private key is encrypted *client-side* before being sent to Firestore. The raw private key NEVER leaves your device.

### 3. Secure Session Persistence
To avoid re-typing your 12-character key on every refresh, QuantChat uses **IndexedDB Key Wrapping**:
*   An ephemeral AES wrapping key is stored in **IndexedDB** as a non-extractable `CryptoKey`.
*   The private key is wrapped (encrypted) and stored in `localStorage`.
*   Both halves are required to restore the session. Raw keys are never stored on disk in plaintext.

### 4. Server-Side Identity
The app uses **Firebase Anonymous Auth** to generate a unique `uid`. 
*   Firestore rules enforce that only the owner of an account (`request.auth.uid == account.uid`) can update their profile or read their contacts.
*   Realtime Database rules require an active session to post vanishing messages or typing indicators.

## 🚀 Getting Started

### Firebase Setup
To deploy to Vercel, you must set the following **Environment Variables** in the Vercel Dashboard (Settings > Environment Variables):

| Variable | Value from your Config |
| :--- | :--- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |
| `VITE_FIREBASE_FIRESTORE_DB_ID` | `firestoreDatabaseId` (optional) |

> [!IMPORTANT]
> Ensure **Anonymous Sign-in** is enabled and **"Enable create"** is checked in the Firebase Console (Authentication > Settings).

1.  Deploy the security rules:
    ```bash
    firebase deploy --only firestore:rules
    firebase deploy --only database
    ```

### Local Development
```bash
npm install
npm run dev
```
