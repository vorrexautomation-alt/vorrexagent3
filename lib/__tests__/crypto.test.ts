// Run with: node --test lib/__tests__/crypto.test.ts
// (Node 20+ can execute TypeScript test files directly via its built-in
// type-stripping — no ts-node/jest install required. See package.json's
// "test" script.)
//
// CREDENTIALS_ENCRYPTION_KEY must be set before these imports run, since
// lib/crypto.ts reads it lazily on first encrypt/decrypt call (not at
// module load) — see the note in that file for why.
import crypto from "crypto";
process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");

import test from "node:test";
import assert from "node:assert/strict";
import { encryptCredential, decryptCredential, __resetCredentialKeyCacheForTests } from "../crypto.ts";

test("round-trips a field map through encrypt/decrypt unchanged", () => {
  const fields = { SLACK_BOT_TOKEN: "xoxb-1234-abcd", EXTRA_FIELD: "value with spaces" };
  const envelope = encryptCredential(fields);
  assert.deepEqual(decryptCredential(envelope), fields);
});

test("envelope format is v1:<iv>:<tag>:<ciphertext>", () => {
  const envelope = encryptCredential({ A: "b" });
  const parts = envelope.split(":");
  assert.equal(parts.length, 4);
  assert.equal(parts[0], "v1");
  // iv and tag should be non-empty base64url
  assert.ok(parts[1].length > 0);
  assert.ok(parts[2].length > 0);
});

test("two encryptions of the same fields produce different envelopes (random IV)", () => {
  const fields = { A: "same value" };
  const e1 = encryptCredential(fields);
  const e2 = encryptCredential(fields);
  assert.notEqual(e1, e2);
  // but both still decrypt to the same plaintext
  assert.deepEqual(decryptCredential(e1), fields);
  assert.deepEqual(decryptCredential(e2), fields);
});

test("tampering with the ciphertext is detected (GCM auth tag fails closed)", () => {
  const envelope = encryptCredential({ SECRET: "do-not-leak" });
  const tampered = envelope.slice(0, -4) + (envelope.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
  assert.throws(() => decryptCredential(tampered));
});

test("tampering with the auth tag is detected", () => {
  const envelope = encryptCredential({ SECRET: "do-not-leak" });
  const [v, iv, tag, ct] = envelope.split(":");
  const flippedTag = Buffer.from(tag, "base64url");
  flippedTag[0] ^= 0xff;
  const tampered = [v, iv, flippedTag.toString("base64url"), ct].join(":");
  assert.throws(() => decryptCredential(tampered));
});

test("decrypting under a different key fails", () => {
  const envelope = encryptCredential({ SECRET: "value" });
  const savedKey = process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
  __resetCredentialKeyCacheForTests();
  try {
    assert.throws(() => decryptCredential(envelope));
  } finally {
    process.env.CREDENTIALS_ENCRYPTION_KEY = savedKey;
    __resetCredentialKeyCacheForTests();
  }
});

test("malformed envelope (wrong shape) throws instead of crashing opaquely", () => {
  assert.throws(() => decryptCredential("not-a-real-envelope"));
  assert.throws(() => decryptCredential("v2:a:b:c")); // unsupported version
  assert.throws(() => decryptCredential("v1:onlytwo:parts"));
});

test("missing CREDENTIALS_ENCRYPTION_KEY produces a clear error, not a crash", () => {
  const saved = process.env.CREDENTIALS_ENCRYPTION_KEY;
  delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  __resetCredentialKeyCacheForTests();
  try {
    assert.throws(() => encryptCredential({ A: "b" }), /CREDENTIALS_ENCRYPTION_KEY is not set/);
  } finally {
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved;
    __resetCredentialKeyCacheForTests();
  }
});

test("wrong-length CREDENTIALS_ENCRYPTION_KEY produces a clear error", () => {
  const saved = process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.from("too-short").toString("hex");
  __resetCredentialKeyCacheForTests();
  try {
    assert.throws(() => encryptCredential({ A: "b" }), /must be exactly 64 hexadecimal characters/);
  } finally {
    process.env.CREDENTIALS_ENCRYPTION_KEY = saved;
    __resetCredentialKeyCacheForTests();
  }
});
