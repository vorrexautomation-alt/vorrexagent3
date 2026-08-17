"use client";
// components/node-canvas/ConfigPanel.tsx
//
// Per-node settings panel. Structured the way a real node modal is, so it
// reads as familiar rather than as one long form:
//   1. Credentials   — only for nodes that talk to an external account
//   2. Resource / Operation — the "what am I doing" picker, when a node has one
//   3. Parameters    — the main required inputs
//   4. Optional fields — collapsed by default, for everything non-essential
// A second tab ("Settings") holds per-node execution behavior (continue/retry
// on fail, per-item vs once, notes) instead of mixing it into the same list.

import { useEffect, useState } from "react";
import type { ConfigFieldDefinition, NodeTypeDefinition } from "./types";
import { getCredentialType } from "@/lib/credentials/types";
import { NodeIcon, UI_ICONS } from "./icons";
import { theme, categoryAccent } from "./theme";
import { CATEGORY_LABELS } from "./nodeDefinitions";

interface ConfigPanelNode {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

interface ConfigPanelProps {
  node: ConfigPanelNode;
  def: NodeTypeDefinition;
  onRename: (id: string, name: string) => void;
  onConfigChange: (id: string, config: Record<string, unknown>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  /** Session JWT used to call /api/credentials. Omit to fall back to the
   *  read-only env-var display (e.g. when embedding the panel somewhere
   *  without an authenticated session) — the picker just won't offer
   *  stored credentials in that case. */
  authToken?: string;
  /** Which client's stored credentials to list/create against. Required
   *  for the picker to do anything; see app/workflow/[id]/page.tsx for
   *  where this comes from (the workflow row's own client_id). */
  clientId?: string;
}

interface NodeExecutionSettings {
  continueOnFail: boolean;
  retryOnFail: boolean;
  maxTries: string;
  waitBetweenTries: string;
  executeMode: "perItem" | "once";
  executeOnce: boolean;
  alwaysOutputData: boolean;
  notes: string;
}

const CREDENTIAL_TYPE_LABEL: Record<string, string> = {
  apiKey: "API key",
  oauth2: "OAuth 2.0",
  database: "Database",
  smtp: "SMTP",
  whatsappBusinessApi: "WhatsApp Business API",
  httpHeaderAuth: "Header Auth",
  openAiApi: "OpenAI API",
  anthropicApi: "Anthropic API",
  googleApi: "Google API",
  basicAuth: "Basic Auth",
  custom: "Custom",
};

function schemaToConfigFields(def: NodeTypeDefinition): ConfigFieldDefinition[] {
  if (!def.jsonSchema) return def.configFields;
  const required = new Set(def.jsonSchema.required || []);
  return Object.entries(def.jsonSchema.properties).map(([key, property]) => ({
    key,
    label: property.title || key,
    type: property.format === "textarea" || property.format === "code" || property.format === "keyvalue" ? property.format : property.type === "array" ? "keyvalue" : property.type === "object" ? "textarea" : property.type,
    options: property.enum?.map((value) => ({ label: value, value })),
    placeholder: property.description,
    helpText: property.description,
    readOnly: property.secret,
    group: required.has(key) ? "parameters" : "advanced",
  } as ConfigFieldDefinition));
}

const DEFAULT_SETTINGS: NodeExecutionSettings = {
  continueOnFail: false,
  retryOnFail: false,
  maxTries: "3",
  waitBetweenTries: "5",
  executeMode: "perItem",
  executeOnce: false,
  alwaysOutputData: false,
  notes: "",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: theme.canvasBg,
  border: `1px solid ${theme.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  color: theme.text,
  fontSize: 12.5,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontSize: 11.5,
  fontWeight: 600,
  color: theme.textMuted,
  marginBottom: 6,
  display: "block",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  color: theme.textFaint,
};

function KeyValueField({
  value,
  onChange,
}: {
  value: Array<{ key: string; value: string }>;
  onChange: (next: Array<{ key: string; value: string }>) => void;
}) {
  const rows = value.length ? value : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {rows.map((row, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="key"
            value={row.key}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], key: e.target.value };
              onChange(next);
            }}
          />
          <input
            style={{ ...inputStyle, flex: 1 }}
            placeholder="value"
            value={row.value}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...next[i], value: e.target.value };
              onChange(next);
            }}
          />
          <button
            onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
            style={{ border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer" }}
          >
            <UI_ICONS.close size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...rows, { key: "", value: "" }])}
        style={{
          alignSelf: "flex-start",
          fontSize: 11.5,
          border: `1px dashed ${theme.border}`,
          background: "transparent",
          color: theme.textMuted,
          borderRadius: 6,
          padding: "5px 9px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <UI_ICONS.plus size={12} /> Add field
      </button>
    </div>
  );
}

function ConditionListField({
  value,
  onChange,
}: {
  value: Array<Record<string, string>>;
  onChange: (next: Array<Record<string, string>>) => void;
}) {
  const rows = value.length ? value : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.map((row, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 8,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
          }}
        >
          <div style={{ display: "flex", gap: 6 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="field, e.g. {{$json.status}}"
              value={row.field ?? row.value ?? ""}
              onChange={(e) => {
                const next = [...rows];
                const k = "field" in row ? "field" : "value";
                next[i] = { ...next[i], [k]: e.target.value };
                onChange(next);
              }}
            />
            <button
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              style={{ border: "none", background: "transparent", color: theme.textFaint, cursor: "pointer" }}
            >
              <UI_ICONS.close size={14} />
            </button>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {"operator" in row && (
              <select
                style={{ ...inputStyle, flex: 1 }}
                value={row.operator || "equals"}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], operator: e.target.value };
                  onChange(next);
                }}
              >
                {["equals", "notEquals", "contains", "greaterThan", "lessThan"].map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
            )}
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="value to compare"
              value={row.value ?? ""}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], value: e.target.value };
                onChange(next);
              }}
            />
            {"output" in row && (
              <input
                style={{ ...inputStyle, width: 70 }}
                placeholder="output"
                value={row.output ?? ""}
                onChange={(e) => {
                  const next = [...rows];
                  next[i] = { ...next[i], output: e.target.value };
                  onChange(next);
                }}
              />
            )}
          </div>
        </div>
      ))}
      <button
        onClick={() =>
          onChange([
            ...rows,
            rows[0] && "output" in rows[0]
              ? { value: "", output: String(rows.length) }
              : { field: "", operator: "equals", value: "" },
          ])
        }
        style={{
          alignSelf: "flex-start",
          fontSize: 11.5,
          border: `1px dashed ${theme.border}`,
          background: "transparent",
          color: theme.textMuted,
          borderRadius: 6,
          padding: "5px 9px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 5,
        }}
      >
        <UI_ICONS.plus size={12} /> Add condition
      </button>
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldDefinition;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (field.type) {
    case "text":
      return (
        <input
          className="ncfg-field"
          style={field.readOnly ? { ...inputStyle, opacity: 0.55, cursor: "not-allowed" } : inputStyle}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={field.readOnly}
          readOnly={field.readOnly}
        />
      );
    case "number":
      return (
        <input
          type="number"
          className="ncfg-field"
          style={inputStyle}
          placeholder={field.placeholder}
          value={typeof value === "string" || typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <textarea
          className="ncfg-field"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
          rows={field.rows || 4}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "code":
      return (
        <textarea
          className="ncfg-field"
          style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}
          rows={field.rows || 8}
          placeholder={field.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
      );
    case "select":
      return (
        <select className="ncfg-field" style={inputStyle} value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}>
          {(field.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.text }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          Enabled
        </label>
      );
    case "keyvalue":
      return (
        <KeyValueField
          value={Array.isArray(value) ? (value as Array<{ key: string; value: string }>) : []}
          onChange={onChange}
        />
      );
    case "conditionList":
      return (
        <ConditionListField
          value={Array.isArray(value) ? (value as Array<Record<string, string>>) : []}
          onChange={onChange}
        />
      );
    default:
      return null;
  }
}

// --- Stored credential picker (Phase 1) ------------------------------
//
// Replaces the old "env" / "none" static dropdown with a real picker
// backed by the encrypted credentials store (see lib/credentials.ts).
// Still offers "Server environment variable (legacy)" as an option so
// existing workflows that were never migrated keep working exactly as
// before — see resolveNodeCredential in lib/execution/executors/index.ts
// for the runtime side of that fallback.
interface StoredCredential {
  id: string;
  node_type: string;
  name: string;
  field_names: string[];
  created_at: string;
  last_used_at: string | null;
}

function CredentialPicker({
  nodeType,
  credentialType,
  credentialFields,
  value,
  onChange,
  authToken,
  clientId,
  accent,
  forceOpenSignal,
}: {
  nodeType: string;
  credentialType: string;
  credentialFields: Array<{ label: string; envVar: string }>;
  value: string;
  onChange: (v: string) => void;
  authToken?: string;
  clientId?: string;
  accent: string;
  /** Bumped by a parent "Connect account" button to open the add-credential
   *  form imperatively (the button lives outside this component so oauth2
   *  nodes can offer one obvious "Connect" action instead of a dropdown). */
  forceOpenSignal?: number;
}) {
  const [credentials, setCredentials] = useState<StoredCredential[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    if (forceOpenSignal) setAddOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpenSignal]);
  const [newName, setNewName] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const canUseStore = Boolean(authToken);
  const typedFields = getCredentialType(credentialType)?.fields.map((field) => ({
    key: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
  }));
  const editableFields = typedFields?.length
    ? typedFields
    : credentialFields.map((field) => ({ key: field.envVar, label: field.label, type: "password" as const, required: true }));

  async function refresh() {
    if (!canUseStore) return;
    try {
      const qs = new URLSearchParams({ nodeType, credential_type: credentialType, ...(clientId ? { client_id: clientId } : {}) });
      const res = await fetch(`/api/credentials?${qs}`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load credentials.");
      setCredentials(data.credentials || []);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load credentials.");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeType, credentialType, clientId, authToken]);

  async function saveNewCredential() {
    if (!newName.trim()) {
      setSaveError("Give this credential a name.");
      return;
    }
    const missing = editableFields.filter((field) => field.required && !fieldValues[field.key]?.trim());
    if (missing.length) {
      setSaveError(`Fill in: ${missing.map((field) => field.label).join(", ")}.`);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          client_id: clientId,
          node_type: nodeType,
          credential_type: credentialType,
          name: newName.trim(),
          fields: fieldValues,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save credential.");
      await refresh();
      onChange(data.credential.id);
      setAddOpen(false);
      setNewName("");
      setFieldValues({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save credential.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <select
        className="ncfg-field"
        style={inputStyle}
        value={value}
        onChange={(e) => {
          if (e.target.value === "__add_new__") {
            setAddOpen(true);
            return;
          }
          onChange(e.target.value);
        }}
      >
        <option value="none">Not connected — pick or add an account below</option>
        <option value="env">Server environment variable (legacy)</option>
        {credentials.length > 0 && (
          <optgroup label="Stored credentials">
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {canUseStore && <option value="__add_new__">+ Add new credential…</option>}
      </select>

      {value !== "env" && value !== "none" && !credentials.some((c) => c.id === value) && (
        <div style={{ fontSize: 10.5, color: "#e0a030", marginTop: 5 }}>
          This workflow references a stored credential that no longer exists (it may have been deleted). Pick another one.
        </div>
      )}

      {loadError && <div style={{ fontSize: 10.5, color: "#ff6b6b", marginTop: 5 }}>{loadError}</div>}

      {value === "none" && (
        <div style={{ fontSize: 10.5, color: "#e0a030", marginTop: 5, lineHeight: 1.5 }}>
          No account connected. Running this node now will fail — click <strong>+ Add new credential…</strong> above
          and paste in {editableFields.length > 1 ? "your own keys" : "your own key"} for {nodeType}.
        </div>
      )}

      {value === "env" && (
        <div style={{ fontSize: 10.5, color: theme.textFaint, marginTop: 5 }}>
          Configured once in your hosting provider&rsquo;s dashboard, shared by every client until you pick or add a
          stored credential above.
        </div>
      )}

      {addOpen && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            border: `1px solid ${accent}55`,
            background: theme.canvasBg,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div>
            <label style={labelStyle}>Credential name</label>
            <input
              style={inputStyle}
              placeholder="e.g. Marketing Slack workspace"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          {editableFields.map((field) => (
            <div key={field.key}>
              <label style={labelStyle}>{field.label}{field.required ? " *" : ""}</label>
              <input
                type={field.type === "string" || field.type === "url" ? "text" : field.type === "number" ? "number" : "password"}
                style={inputStyle}
                autoComplete="off"
                placeholder={field.key === "phoneNumberId" ? "Meta WhatsApp phone number ID" : undefined}
                value={fieldValues[field.key] || ""}
                onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          {saveError && <div style={{ fontSize: 10.5, color: "#ff6b6b" }}>{saveError}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={saveNewCredential}
              disabled={saving}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 6,
                padding: "7px 0",
                background: accent,
                color: theme.canvasBg,
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : "Save credential"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setSaveError(null);
              }}
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: "7px 12px",
                background: "transparent",
                color: theme.textMuted,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
          <div style={{ fontSize: 10, color: theme.textFaint }}>
            Encrypted at rest (AES-256-GCM) and only ever decrypted server-side at execution time — these values are
            never written into this workflow&rsquo;s saved JSON or sent back to any browser after this.
          </div>
        </div>
      )}
    </div>
  );
}

function FieldRow({ field, value, onChange }: { field: ConfigFieldDefinition; value: unknown; onChange: (v: unknown) => void }) {
  return (
    <div>
      <label style={labelStyle}>{field.label}</label>
      <Field field={field} value={value} onChange={onChange} />
      {field.helpText && <div style={{ fontSize: 10.5, color: theme.textFaint, marginTop: 5 }}>{field.helpText}</div>}
    </div>
  );
}

export default function ConfigPanel({ node, def, onRename, onConfigChange, onDelete, onClose, authToken, clientId }: ConfigPanelProps) {
  const [name, setName] = useState(node.name);
  const [tab, setTab] = useState<"parameters" | "credentials" | "settings">("parameters");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // Bumped by the "Connect account" button to force the CredentialPicker's
  // add-new-credential form open, so oauth2 nodes get one obvious button
  // instead of making the user find "+ Add new credential…" in a dropdown.
  const [connectSignal, setConnectSignal] = useState(0);

  function setField(configKey: string, val: unknown) {
    onConfigChange(node.id, { ...node.config, [configKey]: val });
  }

  const settings: NodeExecutionSettings = {
    ...DEFAULT_SETTINGS,
    ...((node.config.__settings as Partial<NodeExecutionSettings>) || {}),
  };
  function setSetting<K extends keyof NodeExecutionSettings>(key: K, val: NodeExecutionSettings[K]) {
    setField("__settings", { ...settings, [key]: val });
  }

  const visibleFields = schemaToConfigFields(def).filter((field) => {
    if (!field.showWhen) return true;
    const currentValue = node.config[field.showWhen.field];
    return field.showWhen.oneOf.includes(String(currentValue ?? ""));
  });
  const resourceFields = visibleFields.filter((f) => f.group === "resource");
  const advancedFields = visibleFields.filter((f) => f.group === "advanced");
  const mainFields = visibleFields.filter((f) => f.group !== "resource" && f.group !== "advanced");

  const accent = categoryAccent[def.category];
  const subtitle = def.subcategory ? `${CATEGORY_LABELS[def.category]} \u2022 ${def.subcategory}` : CATEGORY_LABELS[def.category];

  return (
    <div
      style={{
        width: 380,
        flexShrink: 0,
        background: theme.panelBg,
        borderLeft: `3px solid ${accent}`,
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ["--accent" as string]: accent,
        ["--accent-soft" as string]: `${accent}33`,
      } as React.CSSProperties}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: `1px solid ${theme.border}`,
          background: `linear-gradient(180deg, ${accent}14, transparent)`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            background: def.iconKind === "brand" ? theme.cardBg : `${accent}22`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: accent,
          }}
        >
          <NodeIcon iconKey={def.icon} kind={def.iconKind} size={16} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: theme.text }}>{def.label}</div>
          <div style={{ fontSize: 10.5, color: theme.textFaint }}>{subtitle}</div>
        </div>
        <button
          onClick={onClose}
          style={{ marginLeft: "auto", background: "transparent", border: "none", color: theme.textMuted, cursor: "pointer", display: "flex" }}
        >
          <UI_ICONS.close size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${theme.border}`, padding: "0 16px" }}>
        {(
          [
            { key: "parameters", label: "Parameters", Icon: UI_ICONS.sliders },
            ...(def.requiresCredentials ? [{ key: "credentials" as const, label: "Credentials", Icon: UI_ICONS.key }] : []),
            { key: "settings", label: "Settings", Icon: UI_ICONS.settings },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "10px 4px",
              marginRight: 20,
              border: "none",
              borderBottom: `2px solid ${tab === t.key ? accent : "transparent"}`,
              background: "transparent",
              color: tab === t.key ? theme.text : theme.textMuted,
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <t.Icon size={13} /> {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 16 }}>
        {tab === "parameters" ? (
          <>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => onRename(node.id, name.trim() || def.label)}
              />
            </div>

            <div style={{ fontSize: 11.5, color: theme.textFaint, lineHeight: 1.5 }}>{def.description}</div>

            {tab === "parameters" && def.requiresCredentials && (
              <div
                style={{
                  border: `1px solid ${accent}40`,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 10,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  background: `${accent}0d`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <UI_ICONS.key size={13} color={accent} />
                  <span style={{ ...sectionHeadingStyle, color: accent }}>Credentials</span>
                  {def.credentialType && (
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 9.5,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        textTransform: "uppercase",
                        color: accent,
                        background: `${accent}22`,
                        border: `1px solid ${accent}55`,
                        borderRadius: 999,
                        padding: "2px 7px",
                      }}
                    >
                      {CREDENTIAL_TYPE_LABEL[def.credentialType]}
                    </span>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>{def.credentialLabel || `${def.label} account`}</label>
                  <CredentialPicker
                    nodeType={def.type}
                    credentialType={def.acceptedCredentialTypes?.[0] || def.credentialType || "apiKey"}
                    credentialFields={def.credentialFields || []}
                    value={typeof node.config.__credential === "string" ? (node.config.__credential as string) : "none"}
                    onChange={(v) => setField("__credential", v)}
                    authToken={authToken}
                    clientId={clientId}
                    accent={accent}
                    forceOpenSignal={connectSignal}
                  />
                </div>

                {def.credentialType === "oauth2" && (
                  <button
                    type="button"
                    onClick={() => setConnectSignal((s) => s + 1)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                      border: `1px solid ${accent}`,
                      background: `${accent}1a`,
                      color: accent,
                      borderRadius: 8,
                      padding: "8px 0",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    <UI_ICONS.shield size={13} /> Connect {def.label} account
                  </button>
                )}

                {def.credentialFields && def.credentialFields.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      paddingTop: def.credentialType === "oauth2" ? 0 : 2,
                      borderTop: def.credentialType === "oauth2" ? `1px dashed ${theme.border}` : "none",
                      marginTop: def.credentialType === "oauth2" ? 2 : 0,
                    }}
                  >
                    {def.credentialType === "oauth2" && (
                      <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 8 }}>
                        App credentials (server environment variables)
                      </div>
                    )}
                    {def.credentialFields.map((f) => (
                      <div
                        key={f.envVar}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}
                      >
                        <span style={{ fontSize: 11, color: theme.textMuted }}>{f.label}</span>
                        <code
                          style={{
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                            fontSize: 10.5,
                            color: theme.text,
                            background: theme.canvasBg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: 5,
                            padding: "3px 7px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {f.envVar}
                        </code>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {resourceFields.length > 0 && (
              <div
                style={{
                  border: `1px solid ${accent}40`,
                  borderLeft: `3px solid ${accent}`,
                  borderRadius: 10,
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  background: `${accent}0d`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <UI_ICONS.grid size={13} color={accent} />
                  <span style={{ ...sectionHeadingStyle, color: accent }}>Resource &amp; Operation</span>
                </div>
                {resourceFields.map((field) => {
                  const configKey = field.configKey ?? field.key;
                  return (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={node.config[configKey]}
                      onChange={(v) => setField(configKey, v)}
                    />
                  );
                })}
              </div>
            )}

            {mainFields.length === 0 && advancedFields.length === 0 && resourceFields.length === 0 && (
              <div style={{ fontSize: 12, color: theme.textFaint }}>This node has no configurable settings.</div>
            )}

            {mainFields.map((field) => {
              const configKey = field.configKey ?? field.key;
              return (
                <FieldRow key={field.key} field={field} value={node.config[configKey]} onChange={(v) => setField(configKey, v)} />
              );
            })}

            {advancedFields.length > 0 && (
              <div>
                <button
                  onClick={() => setAdvancedOpen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    width: "100%",
                    background: advancedOpen ? `${accent}0d` : "transparent",
                    border: `1px dashed ${advancedOpen ? accent : theme.border}`,
                    borderRadius: 7,
                    color: advancedOpen ? accent : theme.textMuted,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    padding: "6px 8px",
                  }}
                >
                  {advancedOpen ? <UI_ICONS.chevronDown size={13} /> : <UI_ICONS.chevronRight size={13} />}
                  Optional fields ({advancedFields.length})
                </button>
                {advancedOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 10 }}>
                    {advancedFields.map((field) => {
                      const configKey = field.configKey ?? field.key;
                      return (
                        <FieldRow
                          key={field.key}
                          field={field}
                          value={node.config[configKey]}
                          onChange={(v) => setField(configKey, v)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        ) : tab === "credentials" ? (
          <>
            <div style={{ fontSize: 11.5, color: theme.textFaint, lineHeight: 1.5 }}>
              Select an encrypted credential for this node. Secret values are submitted only to the server and are never written to workflow JSON or returned to the browser.
            </div>
            <div style={{ border: `1px solid ${accent}40`, borderLeft: `3px solid ${accent}`, borderRadius: 10, padding: 12, background: `${accent}0d`, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <UI_ICONS.key size={13} color={accent} />
                <span style={{ ...sectionHeadingStyle, color: accent }}>Connected account</span>
              </div>
              <label style={labelStyle}>{def.credentialLabel || `${def.label} account`}</label>
              <CredentialPicker
                nodeType={def.type}
                credentialType={def.acceptedCredentialTypes?.[0] || def.credentialType || "apiKey"}
                credentialFields={def.credentialFields || []}
                value={typeof node.config.__credential === "string" ? (node.config.__credential as string) : "none"}
                onChange={(v) => setField("__credential", v)}
                authToken={authToken}
                clientId={clientId}
                accent={accent}
                forceOpenSignal={connectSignal}
              />
              <button type="button" onClick={() => setConnectSignal((s) => s + 1)} style={{ border: `1px solid ${accent}`, background: `${accent}1a`, color: accent, borderRadius: 8, padding: "8px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                <UI_ICONS.key size={13} /> Add or replace credential
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={sectionHeadingStyle}>Error handling</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.text }}>
              <input
                type="checkbox"
                checked={settings.continueOnFail}
                onChange={(e) => setSetting("continueOnFail", e.target.checked)}
              />
              Continue on fail — keep the workflow running even if this node errors
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.text }}>
              <input type="checkbox" checked={settings.retryOnFail} onChange={(e) => setSetting("retryOnFail", e.target.checked)} />
              Retry on fail
            </label>
            {settings.retryOnFail && (
              <div style={{ display: "flex", gap: 10, paddingLeft: 24 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Max tries</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={settings.maxTries}
                    onChange={(e) => setSetting("maxTries", e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Wait between (sec)</label>
                  <input
                    type="number"
                    style={inputStyle}
                    value={settings.waitBetweenTries}
                    onChange={(e) => setSetting("waitBetweenTries", e.target.value)}
                  />
                </div>
              </div>
            )}

            <div style={{ ...sectionHeadingStyle, marginTop: 6 }}>Execution</div>
            <div>
              <label style={labelStyle}>Run this node</label>
              <select
                style={inputStyle}
                value={settings.executeMode}
                onChange={(e) => setSetting("executeMode", e.target.value as NodeExecutionSettings["executeMode"])}
              >
                <option value="perItem">Once per incoming item</option>
                <option value="once">Once for all items together</option>
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.text }}>
              <input type="checkbox" checked={settings.executeOnce} onChange={(e) => setSetting("executeOnce", e.target.checked)} />
              Execute Once — run this node once for the whole input
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: theme.text }}>
              <input type="checkbox" checked={settings.alwaysOutputData} onChange={(e) => setSetting("alwaysOutputData", e.target.checked)} />
              Always Output Data — emit an empty item when no data is returned
            </label>

            <div>
              <label style={labelStyle}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <UI_ICONS.notes size={12} /> Notes
                </span>
              </label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                rows={4}
                placeholder="Optional notes about what this node does, for teammates reading the workflow later."
                value={settings.notes}
                onChange={(e) => setSetting("notes", e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      <div style={{ padding: 14, borderTop: `1px solid ${theme.border}` }}>
        <button
          onClick={() => onDelete(node.id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            padding: "9px 0",
            borderRadius: 8,
            border: `1px solid ${theme.dangerSoft}`,
            background: theme.dangerSoft,
            color: theme.danger,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          <UI_ICONS.trash size={14} /> Delete node
        </button>
      </div>
    </div>
  );
}
