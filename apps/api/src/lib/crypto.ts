import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes
} from "node:crypto";

function deriveKey(secret: string) {
  return createHash("sha256").update(secret).digest(); // 32 bytes
}

function b64url(input: Buffer) {
  return input.toString("base64url");
}

function unb64url(input: string) {
  return Buffer.from(input, "base64url");
}

/**
 * Encrypt small secrets for DB storage.
 * Format: v1.<iv>.<tag>.<ciphertext>
 */
export function encryptSecret(secretKey: string, plaintext: string) {
  const key = deriveKey(secretKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${b64url(iv)}.${b64url(tag)}.${b64url(ciphertext)}`;
}

export function decryptSecret(secretKey: string, encoded: string) {
  if (!encoded) {
    return "";
  }

  const parts = encoded.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    // Backward compatibility: treat as plaintext if not encoded
    return encoded;
  }

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const key = deriveKey(secretKey);
  const iv = unb64url(ivB64);
  const tag = unb64url(tagB64);
  const ciphertext = unb64url(ciphertextB64);

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

// Simple stable fingerprint for UI display
export function secretFingerprint(value: string) {
  return createHmac("sha256", "appaffilate-fingerprint")
    .update(value)
    .digest("hex")
    .slice(0, 12);
}

