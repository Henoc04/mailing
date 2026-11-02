import crypto from "crypto";
import { env } from "../config/env";

/**
 * AES-256-GCM helpers used to encrypt SMTP account passwords at rest.
 *
 * Encoded format of the string produced by `encrypt` / consumed by `decrypt`:
 *   base64(iv) + ":" + base64(authTag) + ":" + base64(ciphertext)
 *
 * - `iv` is a fresh random 12-byte nonce generated per call (GCM requires a
 *   unique IV per encryption under the same key).
 * - `authTag` is the 16-byte GCM authentication tag produced on encryption
 *   and required (separately from the ciphertext) to authenticate/decrypt.
 * - `ciphertext` is the encrypted payload bytes.
 * All three parts are base64-encoded independently, then colon-joined into
 * a single opaque string that can be stored as-is in a text database column.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

export function encrypt(plainText: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decrypt(cipherText: string): string {
  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format: expected 'iv:authTag:ciphertext'");
  }

  const [ivB64, authTagB64, dataB64] = parts;
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Invalid ciphertext format: one or more segments are empty");
  }

  let iv: Buffer;
  let authTag: Buffer;
  let data: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    authTag = Buffer.from(authTagB64, "base64");
    data = Buffer.from(dataB64, "base64");
  } catch {
    throw new Error("Invalid ciphertext format: segments are not valid base64");
  }

  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`Invalid ciphertext format: iv must be ${IV_LENGTH_BYTES} bytes`);
  }

  const key = getKey();

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new Error("Decryption failed: ciphertext is invalid, corrupted, or was encrypted with a different key");
  }
}
