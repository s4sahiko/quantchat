/**
 * QuantChat Encryption — Secure ECDH + AES-256-GCM
 *
 * Improvement Summary:
 * 1. ECDH P-256 for key exchange (no deterministic seeds).
 * 2. PBKDF2 with salt + 100k iterations for password-based key derivation.
 * 3. AES-256-GCM for all encryption (authenticated encryption).
 * 4. Structured binary data (Salt + IV + Ciphertext) for protection.
 */

const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const PBKDF2_ITERATIONS = 100000;

// ─── UTILITIES ───────────────────────────────────────────────────────────────

/** Converts a Uint8Array to a Base64 string. */
function u8toB64(u8) {
  let binary = '';
  for (let i = 0; i < u8.byteLength; i++) {
    binary += String.fromCharCode(u8[i]);
  }
  return btoa(binary);
}

/** Converts a Base64 string to a Uint8Array. */
function b64toU8(base64) {
  const binary = atob(base64);
  const u8 = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    u8[i] = binary.charCodeAt(i);
  }
  return u8;
}

// ─── KEY PAIR GENERATION ─────────────────────────────────────────────────────

/**
 * Generate a new ECDH P-256 key pair.
 * Returns raw JWK objects (serializable, storable in Firestore).
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable
    ['deriveKey', 'deriveBits']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return { publicKeyJwk, privateKeyJwk };
}

// ─── PRIVATE KEY PROTECTION (PBKDF2) ──────────────────────────────────────────

/** Derives an AES-GCM key from a password using PBKDF2. */
async function deriveKeyFromPassword(password, salt) {
  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a private key JWK with a password.
 * Format: [Base64(SALT + IV + CIPHERTEXT)]
 */
export async function encryptPrivateKey(privateKeyJwk, password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKeyFromPassword(password, salt);
  
  const encodedJwk = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encodedJwk);

  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, SALT_LENGTH);
  combined.set(new Uint8Array(ciphertext), SALT_LENGTH + IV_LENGTH);

  return u8toB64(combined);
}

/** Decrypts a private key JWK using a password. */
export async function decryptPrivateKey(encryptedBase64, password) {
  try {
    const combined = b64toU8(encryptedBase64);
    
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKeyFromPassword(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch (error) {
    console.error('Private key decryption failed:', error);
    throw new Error('Invalid password or corrupted key data');
  }
}

// ─── KEY IMPORT & DERIVATION ───────────────────────────────────────────────────

export async function importPublicKey(jwk) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

export async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits']
  );
}

/** Derives a shared AES-256-GCM key from (My Private Key + Their Public Key). */
export async function deriveSharedKey(myPrivateCryptoKey, theirPublicKeyJwk) {
  const theirPublicKey = await importPublicKey(theirPublicKeyJwk);
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateCryptoKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derives a self-encryption key for personal notes using ECDH bits. */
export async function deriveNotesKey(myPrivateCryptoKey, myPublicKeyJwk) {
  const myPublicKey = await importPublicKey(myPublicKeyJwk);
  const bits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: myPublicKey },
    myPrivateCryptoKey,
    256
  );
  return crypto.subtle.importKey(
    'raw',
    bits,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── MESSAGE ENCRYPTION / DECRYPTION ─────────────────────────────────────────

export async function encryptMessage(plaintext, cryptoKey) {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encoded);

    const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), IV_LENGTH);

    return u8toB64(combined);
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

export async function decryptMessage(base64, cryptoKey) {
  try {
    const combined = b64toU8(base64);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}
