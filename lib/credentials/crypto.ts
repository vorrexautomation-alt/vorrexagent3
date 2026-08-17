import nodeCrypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set; credential operations are unavailable.");
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).");
  }
  cachedKey = Buffer.from(raw, "hex");
  return cachedKey;
}

export function encryptCredential(fields: Record<string, string>): string {
  const iv = nodeCrypto.randomBytes(IV_LENGTH);
  const cipher = nodeCrypto.createCipheriv(ALGORITHM, getKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(fields), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptCredential(envelope: string): Record<string, string> {
  const parts = envelope.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") throw new Error("Credential envelope is malformed or unsupported.");
  const iv = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const ciphertext = Buffer.from(parts[3], "base64url");
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH || ciphertext.length === 0) {
    throw new Error("Credential envelope is malformed or unsupported.");
  }
  try {
    const decipher = nodeCrypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Not a field map.");
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "string" || !key) throw new Error("Invalid credential field map.");
    }
    return parsed as Record<string, string>;
  } catch {
    throw new Error("Credential could not be decrypted.");
  }
}

export function __resetCredentialKeyCacheForTests(): void {
  cachedKey = null;
}
