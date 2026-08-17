import assert from "node:assert/strict";
import test from "node:test";
import { decryptCredential, encryptCredential, __resetCredentialKeyCacheForTests } from "../crypto";

const key = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function withKey(fn: () => void) {
  const previous = process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.CREDENTIALS_ENCRYPTION_KEY = key;
  __resetCredentialKeyCacheForTests();
  try { fn(); } finally {
    if (previous === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    else process.env.CREDENTIALS_ENCRYPTION_KEY = previous;
    __resetCredentialKeyCacheForTests();
  }
}

test("AES-256-GCM round-trips typed credential fields with a random IV", () => {
  withKey(() => {
    const fields = { apiKey: "super-secret", organization: "team-a" };
    const first = encryptCredential(fields);
    const second = encryptCredential(fields);
    assert.match(first, /^v1:[^:]+:[^:]+:[^:]+$/);
    assert.notEqual(first, second);
    assert.deepEqual(decryptCredential(first), fields);
  });
});

test("rejects invalid key formats and tampered envelopes", () => {
  const previous = process.env.CREDENTIALS_ENCRYPTION_KEY;
  process.env.CREDENTIALS_ENCRYPTION_KEY = "not-hex";
  __resetCredentialKeyCacheForTests();
  assert.throws(() => encryptCredential({ apiKey: "x" }), /64 hexadecimal/);
  process.env.CREDENTIALS_ENCRYPTION_KEY = key;
  __resetCredentialKeyCacheForTests();
  const envelope = encryptCredential({ apiKey: "x" });
  const parts = envelope.split(":");
  parts[3] = `${parts[3]}a`;
  assert.throws(() => decryptCredential(parts.join(":")), /could not be decrypted/);
  if (previous === undefined) delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  else process.env.CREDENTIALS_ENCRYPTION_KEY = previous;
  __resetCredentialKeyCacheForTests();
});
