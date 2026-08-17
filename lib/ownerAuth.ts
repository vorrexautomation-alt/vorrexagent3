import bcrypt from "bcryptjs";
import crypto from "node:crypto";

/**
 * Preferred production contract: OWNER_PASSWORD_HASH contains a bcrypt hash.
 * OWNER_PASSWORD is supported as a migration fallback for deployments that
 * configured a raw secret; bcrypt remains the recommended setting.
 */
export async function verifyOwnerPassword(password: string, hash: string | undefined, fallbackPassword: string | undefined): Promise<boolean> {
  if (hash) {
    const looksLikeBcrypt = /^\$2[aby]\$\d{2}\$/.test(hash);
    if (looksLikeBcrypt) return bcrypt.compare(password, hash);
  }
  if (!fallbackPassword) return false;
  const left = crypto.createHash("sha256").update(password, "utf8").digest();
  const right = crypto.createHash("sha256").update(fallbackPassword, "utf8").digest();
  return crypto.timingSafeEqual(left, right);
}
