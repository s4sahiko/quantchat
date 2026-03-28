/**
 * sessionKeyStore.js — Persistent Private Key via IndexedDB + Key Wrapping
 *
 * How it works:
 *  1. On login/create, we generate a random AES-GCM "wrapping key".
 *  2. We use wrapKey() to encrypt the user's ECDH private key with it.
 *     The wrapped blob (ciphertext) is safe to store in localStorage.
 *  3. The wrapping key itself is stored in IndexedDB as a CryptoKey object.
 *     IndexedDB can hold CryptoKey objects natively via structured clone —
 *     the raw key bytes are NEVER exposed to JavaScript.
 *  4. On page restore, we pull the wrapping key from IndexedDB and the
 *     wrapped blob from localStorage, then call unwrapKey() to reconstruct
 *     the live CryptoKey — all inside the browser's crypto engine.
 *  5. On logout, both are deleted.
 *
 * Security properties:
 *  - No raw key material ever in JS-accessible memory during restore
 *  - DevTools cannot extract the wrapping key (it's non-extractable)
 *  - Both halves must be present to restore (split across IDB + localStorage)
 *  - Origin-scoped (IndexedDB is same-origin only)
 *  - Cleared explicitly on logout
 */
 
const DB_NAME = 'qc_vault';
const DB_VERSION = 1;
const STORE_NAME = 'keys';
const WRAPPING_KEY_ID = 'session_wrapping_key';
const WRAPPED_BLOB_KEY = 'qc_wrapped_priv';
const WRAP_IV_KEY = 'qc_wrap_iv';
 
// ─── IndexedDB helpers ────────────────────────────────────────────────────────
 
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}
 
async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}
 
async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = (e) => resolve(e.target.result ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}
 
async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = resolve;
    tx.onerror = (e) => reject(e.target.error);
  });
}
 
// ─── Public API ───────────────────────────────────────────────────────────────
 
/**
 * Persists the user's ECDH private key securely for session restore.
 *
 * @param {CryptoKey} privateCryptoKey  — the live ECDH private CryptoKey
 * @param {object}    privateKeyJwk     — the raw JWK (used for wrapKey input)
 */
export async function saveSessionKey(privateCryptoKey, privateKeyJwk) {
  // 1. Generate a fresh random AES-GCM wrapping key (non-extractable)
  const wrappingKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable — DevTools cannot read this
    ['wrapKey', 'unwrapKey']
  );
 
  // 2. Random IV for the wrapping operation
  const iv = crypto.getRandomValues(new Uint8Array(12));
 
  // 3. wrapKey: encrypts the private key JWK using the wrapping key
  //    The result is a raw ArrayBuffer (ciphertext) — safe to store anywhere
  const wrappedKeyBuffer = await crypto.subtle.wrapKey(
    'jwk',
    privateCryptoKey,
    wrappingKey,
    { name: 'AES-GCM', iv }
  );
 
  // 4. Store the wrapping key (CryptoKey object) in IndexedDB
  //    Structured clone preserves it as an opaque key — no raw bytes exposed
  await idbSet(WRAPPING_KEY_ID, wrappingKey);
 
  // 5. Store the wrapped blob + IV in localStorage (useless without the wrapping key)
  const wrappedB64 = btoa(String.fromCharCode(...new Uint8Array(wrappedKeyBuffer)));
  const ivB64 = btoa(String.fromCharCode(...iv));
  localStorage.setItem(WRAPPED_BLOB_KEY, wrappedB64);
  localStorage.setItem(WRAP_IV_KEY, ivB64);
}
 
/**
 * Attempts to restore the private CryptoKey from persisted storage.
 * Returns the live CryptoKey on success, or null if no session exists or
 * either half is missing/corrupted.
 *
 * @returns {Promise<CryptoKey|null>}
 */
export async function restoreSessionKey() {
  try {
    const wrappedB64 = localStorage.getItem(WRAPPED_BLOB_KEY);
    const ivB64 = localStorage.getItem(WRAP_IV_KEY);
    if (!wrappedB64 || !ivB64) return null;
 
    // Retrieve the wrapping key from IndexedDB
    const wrappingKey = await idbGet(WRAPPING_KEY_ID);
    if (!wrappingKey) return null; // Other half missing — can't restore
 
    // Decode stored values
    const wrappedBytes = Uint8Array.from(atob(wrappedB64), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));
 
    // unwrapKey: decrypts the blob and imports it directly as a CryptoKey
    // The raw JWK bytes are processed entirely inside the browser's crypto engine
    const privateCryptoKey = await crypto.subtle.unwrapKey(
      'jwk',
      wrappedBytes,
      wrappingKey,
      { name: 'AES-GCM', iv },
      { name: 'ECDH', namedCurve: 'P-256' },
      false,         // non-extractable after restore too
      ['deriveKey', 'deriveBits']
    );
 
    return privateCryptoKey;
  } catch (err) {
    // Corrupted or mismatched data — treat as no session
    console.warn('Session restore failed:', err.message);
    await clearSessionKey();
    return null;
  }
}
 
/**
 * Wipes all session key material from both IndexedDB and localStorage.
 * Call this on logout.
 */
export async function clearSessionKey() {
  await idbDelete(WRAPPING_KEY_ID);
  localStorage.removeItem(WRAPPED_BLOB_KEY);
  localStorage.removeItem(WRAP_IV_KEY);
}
