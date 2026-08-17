import assert from "node:assert/strict";
import test from "node:test";
import { FULL_CATALOG_ENTRIES } from "../fullNodeCatalog";
import { NODE_DEFINITIONS } from "../nodeDefinitions";

test("master catalog contains 1,929 unique node labels and stable IDs", () => {
  assert.equal(FULL_CATALOG_ENTRIES.length, 1929);
  assert.equal(new Set(FULL_CATALOG_ENTRIES.map((entry) => entry.label)).size, 1929);
  assert.equal(new Set(FULL_CATALOG_ENTRIES.map((entry) => entry.type)).size, 1929);
});

test("master catalog is organized across triggers, AI, and integration groups", () => {
  const groups = new Set(FULL_CATALOG_ENTRIES.map((entry) => entry.group));
  assert.ok(groups.has("Triggers"));
  assert.ok(groups.has("AI & LangChain"));
  assert.ok(groups.has("Communication"));
  assert.ok(groups.has("Other"));
});

test("central registry exposes the expanded catalog without dropping existing nodes", () => {
  assert.ok(NODE_DEFINITIONS.length >= 1929);
  assert.ok(NODE_DEFINITIONS.some((node) => node.label === "WhatsApp Business Cloud"));
  assert.ok(NODE_DEFINITIONS.some((node) => node.label === "AI Agent"));
  assert.ok(NODE_DEFINITIONS.some((node) => node.type === "whatsapp"));
});
