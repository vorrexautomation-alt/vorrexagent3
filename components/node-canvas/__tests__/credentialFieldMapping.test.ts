import assert from "node:assert/strict";
import test from "node:test";
import { getCredentialType } from "@/lib/credentials/types";

test("WhatsApp credential fields use typed resolver keys", () => {
  const definition = getCredentialType("whatsappBusinessApi");
  assert.ok(definition);
  assert.deepEqual(definition.fields.slice(0, 2).map((field) => field.name), ["accessToken", "phoneNumberId"]);
  assert.deepEqual(definition.fields.slice(0, 2).map((field) => field.required), [true, true]);
});
