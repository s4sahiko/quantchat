// Dual-seed AES-256 encryption
// Seed = SHA-256(QuantC_Number + 10_digit_encryption_key)
// Use Web Crypto API

export async function deriveKey(seed) {
  const encoded = new TextEncoder().encode(seed);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return crypto.subtle.importKey(
    'raw', 
    hashBuffer, 
    { name: 'AES-GCM', length: 256 }, 
    false, 
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(plaintext, seed) {
  try {
    const key = await deriveKey(seed);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, 
      key, 
      encoded
    );
    
    // Return iv + ciphertext as base64
    const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.byteLength);
    
    // Convert to base64
    let binary = '';
    const bytes = new Uint8Array(combined);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

export async function decryptMessage(base64, seed) {
  try {
    const key = await deriveKey(seed);
    const binaryString = atob(base64);
    const len = binaryString.length;
    const combined = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      combined[i] = binaryString.charCodeAt(i);
    }
    
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv }, 
      key, 
      ciphertext
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}
