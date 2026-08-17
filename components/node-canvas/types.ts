// components/node-canvas/types.ts
//
// Canvas-internal data model, built on top of React Flow's own Node<T>/Edge
// types (see NodeCanvas.tsx). Every node on the canvas is rendered by a
// single custom React Flow node type ("flowNode" in nodeTypes); which
// palette entry it represents lives in `data.nodeType` and is looked up in
// nodeDefinitions.ts for icon/ports/config-field metadata.

export type PortId = string; // e.g. "out", "true", "false", "0", "1"

export interface NodePort {
  id: PortId;
  label?: string; // shown next to the handle, e.g. "True" / "False"
}

/** Static definition of a node type, used to populate the palette and to
 * render a node card (icon, color, ports) once placed on the canvas. */
export interface JsonSchemaProperty {
  type: "string" | "number" | "boolean" | "array" | "object";
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  format?: "textarea" | "code" | "keyvalue";
  secret?: boolean;
}

export interface JsonSchemaDefinition {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface NodeTypeDefinition {
  type: string; // stable identifier, e.g. "http_request", "slack"
  label: string;
  category: "trigger" | "core" | "ai" | "integration";
  /** Only meaningful for category "integration" — groups the palette's
   * integration nodes by domain (e.g. "Communication", "Database & Storage")
   * the same way n8n's app node list is organized. */
  subcategory?: string;
  /** Sidebar taxonomy tags, e.g. ["AI & LangChain", "Tools"]. */
  groups?: string[];
  /** Stable visual asset path used by palette and node-card previews. */
  image?: string;
  /** Indicates whether a node has a full executor or a safe stub. */
  implementationStatus?: "implemented" | "stub";
  description: string;
  icon: string; // key into the icon registry (icons.tsx)
  iconKind: "outline" | "brand"; // outline = neutral single-color, brand = real logo colors
  inputs: NodePort[]; // empty for trigger nodes
  outputs: NodePort[]; // e.g. two ports for IF (true/false)
  defaultConfig: Record<string, unknown>;
  configFields: ConfigFieldDefinition[];
  /** Optional JSON Schema source for integrations that do not need custom controls. */
  jsonSchema?: JsonSchemaDefinition;
  /** Does this node need an external account/API key to run? Drives the
   *  "Credentials" section at the top of the config panel — utility/core
   *  nodes (Edit Fields, Code, If...) leave this unset. */
  requiresCredentials?: boolean;
  /** Credential types accepted by this node. The first entry is the default
   *  type used when creating a credential from ConfigPanel. */
  acceptedCredentialTypes?: string[];
  /** Shown as the credential dropdown's label, e.g. "Slack account",
   * "Postgres connection". Falls back to `${label} account` when omitted. */
  credentialLabel?: string;
  /** What kind of credential this node needs — drives which fields the
   * Credentials section renders. "apiKey" — a single token/key. "oauth2" —
   * a connect-account flow backed by client id/secret. "database" — a
   * host/port/db/user/password connection. "smtp" — mail server
   * host/port/user/password. Nodes without this fall back to the plain
   * generic credential picker (kept for AI Agent, which has its own
   * provider-specific key-name logic). */
  credentialType?: "apiKey" | "oauth2" | "database" | "smtp" | "whatsappBusinessApi";
  /** The specific environment variable(s) this credential resolves to on
   * the server, shown read-only in the Credentials section so it's clear
   * exactly what to set in the hosting provider's dashboard. */
  credentialFields?: Array<{ label: string; envVar: string }>;
}

export type ConfigFieldType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "boolean"
  | "keyvalue" // list of {key, value} pairs, e.g. headers
  | "code"
  | "conditionList"; // list of {field, operator, value} rows, used by IF/Switch

export interface ConfigFieldDefinition {
  /** Unique within the node's field list — used as the React key and, when
   * `configKey` is omitted, as the property name in node.config. Two fields
   * can target the same config property (e.g. two mutually-exclusive
   * "Operation" dropdowns depending on `resource`) by giving each a
   * distinct `key` but the same `configKey`. */
  key: string;
  /** Property name in node.config this field reads/writes. Defaults to `key`. */
  configKey?: string;
  label: string;
  type: ConfigFieldType;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  helpText?: string;
  rows?: number; // for textarea/code
  /** Renders the field disabled/read-only — used for fields that are shown
   * for context (e.g. explaining where a secret actually lives) but must
   * never be typed into and saved to the persisted graph. */
  readOnly?: boolean;
  /** Only render this field when another field on the same node has one of
   * these values — powers the resource -> operation -> fields drill-down
   * pattern n8n's integration nodes use. */
  showWhen?: { field: string; oneOf: string[] };
  /** Which section of the config panel this field renders in:
   *  - "resource"   — the Resource / Operation pickers, always visible near the top
   *  - "parameters" — the main required inputs (default when omitted)
   *  - "advanced"   — tucked into the collapsed "Optional fields" section */
  group?: "resource" | "parameters" | "advanced";
}

export interface CanvasPosition {
  x: number;
  y: number;
}

/** The data payload every React Flow node carries in `node.data`. The two
 * callbacks are wired in by NodeCanvas when it constructs each node and are
 * never part of the persisted graph (see serialize.ts, which only reads
 * nodeType/name/config back out). */
export interface FlowNodeData {
  nodeType: string; // references NodeTypeDefinition.type
  name: string; // user-editable display name, defaults to the type label
  config: Record<string, unknown>;
  onDelete?: (nodeId: string) => void;
  status?: "idle" | "running" | "success" | "error" | "waiting";
}

/** The exact shape persisted to workflow_json:
 *  { nodes: [{id, type, position: {x,y}, config: {...}}], connections: {...} }
 *
 *  `connections` is a map keyed by connection id (rather than an array) so
 *  a single connection can be looked up / patched by key without
 *  re-indexing the whole list — this is the "{...}" the spec calls for,
 *  and it also matches how React Flow edges are keyed internally. */
export interface WorkflowGraph {
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    position: CanvasPosition;
    config: Record<string, unknown>;
  }>;
  connections: Record<
    string,
    { source: string; sourceHandle: PortId; target: string; targetHandle: PortId }
  >;
}
