import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import { rateLimit, verifyHmacSignature, verifySecret } from "../security";

test("verifies route secrets with a timing-safe hash comparison", () => {
  const secret = "route-secret";
  const hash = crypto.createHash("sha256").update(secret).digest("hex");
  assert.equal(verifySecret(secret, hash), true);
  assert.equal(verifySecret("wrong", hash), false);
  assert.equal(verifySecret(null, hash), false);
});

test("accepts valid HMAC signatures and rejects malformed signatures", () => {
  const body = JSON.stringify({ ok: true });
  const secret = "shared-secret";
  const signature = crypto.createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyHmacSignature(body, `sha256=${signature}`, secret), true);
  assert.equal(verifyHmacSignature(body, "sha256=not-a-digest", secret), false);
  assert.equal(verifyHmacSignature(`${body}!`, signature, secret), false);
});

test("enforces request limits and reports retry timing", () => {
  const key = `security-test-${crypto.randomUUID()}`;
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  assert.equal(rateLimit(key, 2, 60_000).ok, true);
  const blocked = rateLimit(key, 2, 60_000);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfter >= 1);
});
