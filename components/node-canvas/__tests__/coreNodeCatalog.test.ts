import assert from "node:assert/strict";
import test from "node:test";
import { CORE_NODE_CATALOG } from "../coreNodeCatalog";
import { NODE_DEFINITIONS } from "../nodeDefinitions";

test("Core catalog contains exactly 79 unique image-backed nodes", () => {
  assert.equal(CORE_NODE_CATALOG.length, 79);
  assert.equal(new Set(CORE_NODE_CATALOG.map((node) => node.type)).size, 79);
  assert.equal(new Set(CORE_NODE_CATALOG.map((node) => node.label)).size, 79);
  assert.equal(new Set(CORE_NODE_CATALOG.map((node) => node.image)).size, 1);
  assert.equal(CORE_NODE_CATALOG[0]?.image, "/node-icons/core.svg");
  for (const node of CORE_NODE_CATALOG) {
    assert.equal(node.image, "/node-icons/core.svg");
    assert.ok(node.groups?.length);
    assert.ok(["core", "trigger"].includes(node.category));
  }
});

test("merged node registry preserves legacy definitions and adds the Core catalog", () => {
  assert.ok(NODE_DEFINITIONS.length >= 79);
  assert.ok(NODE_DEFINITIONS.some((node) => node.type === "httpRequest"));
  assert.ok(NODE_DEFINITIONS.some((node) => node.type === "respondToWebhook"));
  assert.ok(NODE_DEFINITIONS.some((node) => node.type === "microsoftAgent365Trigger"));
});
