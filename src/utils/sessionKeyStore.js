/**
 * sessionKeyStore.js — Persistent Private Key via IndexedDB + AES-GCM Encryption
 *
 * How it works:
 *  1. On login/create, we generate a random AES-GCM "wrapping key".
 *  2. We JSON-serialize the private key JWK and encrypt it with the wrapping key.
 *     The encrypted blob (ciphertext) is safe to store in localStorage.
 *  3. The wrapping key itself is stored in IndexedDB as a CryptoKey object.
 *     IndexedDB can hold CryptoKey objects natively via structured clone.
 *  4. On page restore, we pull the wrapping key from IndexedDB and the
 *     encrypted blob from localStorage, decrypt the JWK, and re-import it.
 *  5. On logout, both are deleted.
 *
 * Why encrypt/decrypt instead of wrapKey/unwrapKey:
 *  wrapKey() requires the key being wrapped to be extractable=true.
 *  Our private keys are non-extractable CryptoKeys. Instead we store the raw
 *  JWK (passed in as a second argument) and encrypt its JSON representation.
 *  This is equivalent security-wise — the JWK never hits localStorage in plaintext.
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
 * Encrypts and persists the private key JWK for session restore.
 *
 * @param {CryptoKey} _privateCryptoKey  — unused (kept for API compat), key is non-extractable
 * @param {object}    privateKeyJwk      — the raw JWK object to encrypt and store
 */
export async function saveSessionKey(_privateCryptoKey, privateKeyJwk) {
  // 1. Generate a fresh random AES-GCM wrapping key
  const wrappingKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable — DevTools cannot read this
    ['encrypt', 'decrypt']
  );

  // 2. Random IV for the encryption
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 3. Encrypt the serialized JWK using AES-GCM
  //    We use encrypt() on the JSON string instead of wrapKey() because
  //    wrapKey() requires extractable=true on the source key.
  const encoder = new TextEncoder();
  const jwkBytes = encoder.encode(JSON.stringify(privateKeyJwk));
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    jwkBytes
  );

  // 4. Store weapping key in IndexedDB (opaque CryptoKey — no raw bytes exposed)
  await idbSet(WRAPPING_KEY_ID, wrappingKey);

  // 5. Store encrypted blob + IV in localStorage (useless without the wrapping key)
  const encryptedB64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));
  const ivB64 = btoa(String.fromCharCode(...iv));
  localStorage.setItem(WRAPPED_BLOB_KEY, encryptedB64);
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
    const encryptedB64 = localStorage.getItem(WRAPPED_BLOB_KEY);
    const ivB64 = localStorage.getItem(WRAP_IV_KEY);
    if (!encryptedB64 || !ivB64) return null;

    // Retrieve the wrapping key from IndexedDB
    const wrappingKey = await idbGet(WRAPPING_KEY_ID);
    if (!wrappingKey) return null; // Other half missing — can't restore

    // Decode stored values
    const encryptedBytes = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
    const iv = Uint8Array.from(atob(ivB64), (c) => c.charCodeAt(0));

    // Decrypt the JWK JSON
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      wrappingKey,
      encryptedBytes
    );

    // Parse the JWK and re-import it as a live CryptoKey
    const decoder = new TextDecoder();
    const privateKeyJwk = JSON.parse(decoder.decode(decryptedBuffer));

    const privateCryptoKey = await crypto.subtle.importKey(
      'jwk',
      privateKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, // non-extractable after restore too
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
