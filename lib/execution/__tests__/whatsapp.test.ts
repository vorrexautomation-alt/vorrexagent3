import assert from "node:assert/strict";
import test from "node:test";
import { getExecutor } from "../registry";
import "../executors";

const ctx = { workflowId: "wf-test", clientId: "client-test", triggerData: {} };
const originalFetch = globalThis.fetch;
const originalToken = process.env.WHATSAPP_ACCESS_TOKEN;
const originalPhone = process.env.WHATSAPP_PHONE_NUMBER_ID;

function mockFetch() {
  let request: { url: string; body: Record<string, unknown> } | null = null;
  globalThis.fetch = (async (input, init) => {
    request = { url: String(input), body: JSON.parse(String(init?.body || "{}")) };
    return new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return () => request;
}

test("WhatsApp executor sends text, template, and media payloads", async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = "token-test";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-test";
  const executor = getExecutor("whatsapp");
  assert.ok(executor);
  const readRequest = mockFetch();

  await executor!({ operation: "sendText", to: "+15550001", message: "Hello", previewUrl: true }, {}, ctx);
  assert.equal(readRequest()?.body.type, "text");
  assert.equal((readRequest()?.body.text as { body: string }).body, "Hello");

  await executor!({ operation: "sendTemplate", to: "+15550001", templateName: "welcome", templateLanguage: "en_GB", templateParameters: [{ key: "name", value: "Ada" }] }, {}, ctx);
  assert.equal(readRequest()?.body.type, "template");
  assert.equal((readRequest()?.body.template as { language: { code: string } }).language.code, "en_GB");

  await executor!({ operation: "sendImage", to: "+15550001", mediaUrl: "https://example.com/a.png", mediaCaption: "Preview" }, {}, ctx);
  assert.equal(readRequest()?.body.type, "image");
  assert.equal((readRequest()?.body.image as { link: string; caption: string }).caption, "Preview");

  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
  if (originalPhone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone;
});

test("WhatsApp executor validates operation-specific required fields", async () => {
  process.env.WHATSAPP_ACCESS_TOKEN = "token-test";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-test";
  const executor = getExecutor("whatsapp");
  await assert.rejects(() => executor!({ operation: "sendTemplate", to: "+15550001" }, {}, ctx), /templateName/);
  await assert.rejects(() => executor!({ operation: "sendLocation", to: "+15550001", latitude: "1" }, {}, ctx), /latitude and longitude/);
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN; else process.env.WHATSAPP_ACCESS_TOKEN = originalToken;
  if (originalPhone === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID; else process.env.WHATSAPP_PHONE_NUMBER_ID = originalPhone;
});
