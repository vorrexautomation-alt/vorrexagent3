import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { verifyOwnerPassword } from "../ownerAuth";

test("owner verifier accepts the configured bcrypt hash", async () => {
  const hash = await bcrypt.hash("correct horse battery staple", 4);
  assert.equal(await verifyOwnerPassword("correct horse battery staple", hash, undefined), true);
  assert.equal(await verifyOwnerPassword("wrong password", hash, undefined), false);
});

test("owner verifier accepts the explicit migration fallback", async () => {
  assert.equal(await verifyOwnerPassword("temporary-password", undefined, "temporary-password"), true);
  assert.equal(await verifyOwnerPassword("other-password", undefined, "temporary-password"), false);
});

test("invalid or malformed hash does not accidentally authenticate", async () => {
  assert.equal(await verifyOwnerPassword("password", "not-a-bcrypt-hash", undefined), false);
  assert.equal(await verifyOwnerPassword("password", undefined, undefined), false);
});
