/**
 * AES-256-GCM encrypt/decrypt helpers for WhatsApp access tokens.
 *
 * Storage format (base64-encoded): IV (12 bytes) | authTag (16 bytes) | ciphertext
 *
 * Key source: WHATSAPP_CREDENTIALS_KEY env var — must be a 64-char hex string
 * representing 32 bytes (256 bits). Never hard-code or store the key in the DB.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;        // 96-bit IV — recommended for GCM
const AUTH_TAG_LENGTH = 16;  // 128-bit auth tag — GCM default

function getKey(): Buffer {
  const hexKey = process.env["WHATSAPP_CREDENTIALS_KEY"];
  if (!hexKey) {
    throw new Error(
      "WHATSAPP_CREDENTIALS_KEY environment variable is not set. " +
      "Generate a 32-byte key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
      "and add it to your secrets.",
    );
  }
  if (hexKey.length !== 64) {
    throw new Error(
      `WHATSAPP_CREDENTIALS_KEY must be a 64-character hex string (32 bytes). Got ${hexKey.length} characters.`,
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error(
      "WHATSAPP_CREDENTIALS_KEY must contain only hexadecimal characters.",
    );
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypt a plaintext string.
 * Returns a single base64 string: IV (12 bytes) + authTag (16 bytes) + ciphertext.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag(); // must be called after final()

  // Concatenate: IV | authTag | ciphertext → base64
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt a value produced by encryptToken().
 * Throws if the auth tag doesn't match (tampered or wrong key).
 */
export function decryptToken(stored: string): string {
  const key = getKey();
  const buf = Buffer.from(stored, "base64");

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Encrypted token blob is too short — data may be corrupted.");
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag); // must be set before final()

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
