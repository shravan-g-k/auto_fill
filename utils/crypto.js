/**
 * AutoFill Pro — Crypto Utility
 * AES-GCM encryption/decryption using Web Crypto API.
 * Master key is auto-generated and stored in chrome.storage.local.
 */

const AutoFillCrypto = (() => {
  const ALGORITHM = 'AES-GCM';
  const KEY_LENGTH = 256;
  const IV_LENGTH = 12;
  const MASTER_KEY_STORAGE = '__autofill_pro_master_key__';

  /**
   * Convert ArrayBuffer to base64 string
   */
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Generate a new AES-GCM key and export it as base64
   */
  async function generateMasterKey() {
    const key = await crypto.subtle.generateKey(
      { name: ALGORITHM, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', key);
    return bufferToBase64(exported);
  }

  /**
   * Import a base64-encoded key into a CryptoKey object
   */
  async function importKey(base64Key) {
    const keyBuffer = base64ToBuffer(base64Key);
    return crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Get or create the master key
   */
  async function getMasterKey() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([MASTER_KEY_STORAGE], async (result) => {
        try {
          let base64Key = result[MASTER_KEY_STORAGE];
          if (!base64Key) {
            base64Key = await generateMasterKey();
            await new Promise((res, rej) => {
              chrome.storage.local.set({ [MASTER_KEY_STORAGE]: base64Key }, () => {
                if (chrome.runtime.lastError) rej(chrome.runtime.lastError);
                else res();
              });
            });
          }
          const key = await importKey(base64Key);
          resolve(key);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  /**
   * Encrypt a string value
   * @param {string} plaintext - The string to encrypt
   * @returns {Promise<string>} - Base64 encoded "{iv}:{ciphertext}"
   */
  async function encrypt(plaintext) {
    if (!plaintext || typeof plaintext !== 'string') return plaintext;
    const key = await getMasterKey();
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const encoder = new TextEncoder();
    const encoded = encoder.encode(plaintext);
    const ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv },
      key,
      encoded
    );
    return bufferToBase64(iv.buffer) + ':' + bufferToBase64(ciphertext);
  }

  /**
   * Decrypt a previously encrypted string
   * @param {string} encryptedStr - Base64 encoded "{iv}:{ciphertext}"
   * @returns {Promise<string>} - The original plaintext
   */
  async function decrypt(encryptedStr) {
    if (!encryptedStr || typeof encryptedStr !== 'string' || !encryptedStr.includes(':')) {
      return encryptedStr;
    }
    try {
      const key = await getMasterKey();
      const [ivBase64, ciphertextBase64] = encryptedStr.split(':');
      const iv = new Uint8Array(base64ToBuffer(ivBase64));
      const ciphertext = base64ToBuffer(ciphertextBase64);
      const decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv },
        key,
        ciphertext
      );
      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (err) {
      // If decryption fails, return original (may be unencrypted legacy data)
      console.warn('AutoFill Pro: Decryption failed, returning raw value');
      return encryptedStr;
    }
  }

  /**
   * Encrypt all string values in a profile object
   */
  async function encryptProfile(profile) {
    const encrypted = {};
    for (const [key, value] of Object.entries(profile)) {
      if (key === 'id' || key === 'name' || key === 'toggles' || key === 'createdAt' || key === 'updatedAt') {
        // Don't encrypt metadata and toggle states
        encrypted[key] = value;
      } else if (typeof value === 'string' && value.length > 0) {
        encrypted[key] = await encrypt(value);
      } else {
        encrypted[key] = value;
      }
    }
    return encrypted;
  }

  /**
   * Decrypt all string values in a profile object
   */
  async function decryptProfile(profile) {
    const decrypted = {};
    for (const [key, value] of Object.entries(profile)) {
      if (key === 'id' || key === 'name' || key === 'toggles' || key === 'createdAt' || key === 'updatedAt') {
        decrypted[key] = value;
      } else if (typeof value === 'string' && value.length > 0) {
        decrypted[key] = await decrypt(value);
      } else {
        decrypted[key] = value;
      }
    }
    return decrypted;
  }

  return {
    encrypt,
    decrypt,
    encryptProfile,
    decryptProfile,
    bufferToBase64,
    base64ToBuffer
  };
})();

// Make available globally
if (typeof window !== 'undefined') {
  window.AutoFillCrypto = AutoFillCrypto;
}
