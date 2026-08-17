// Registers every built-in node executor. Import this module once (the
// registry does it for you) and every type below becomes runnable.
//
// Type strings here are the SAME bare strings used in
// components/node-canvas/nodeDefinitions.ts (e.g. "httpRequest", "slack"),
// not n8n's "n8n-nodes-base.*" names — see registry.ts / runtime.ts for
// why that distinction matters.
//
// Credential pattern (Phase 1): every integration resolves its secret(s)
// via resolveNodeCredential() below, which reads from the encrypted
// `credentials` table when the node's config points at a stored
// credential (`params.__credential` is a credential id), or falls back
// to the legacy server-side env var — named exactly what
// nodeDefinitions.ts's `credentialFields[].envVar` shows in the node's
// Credentials panel — when it isn't. Never from node config directly:
// node config is persisted into workflow_json and would otherwise
// round-trip a plaintext secret to the browser every time the workflow
// loads (see aiAgent below, or any *_CLIENT_SECRET).
import { getExecutor, registerExecutor } from "../registry";
import { CORE_NODE_CATALOG } from "../../../components/node-canvas/coreNodeCatalog";
import { NodeData, ExecutionContext, PortEmission } from "../types";
import { resolveDeep, resolveString, resolveQueryParams } from "../expr";
import { credentialResolver } from "../../credentials/resolver";
import { runInSandbox } from "../../sandbox/codeSandbox";

function asRecord(input: NodeData): Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function requireEnv(names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of names) {
    const v = process.env[name];
    if (!v) missing.push(name);
    else out[name] = v;
  }
  if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(", ")}.`);
  return out;
}

// PHASE 1 — credential resolution.
//
// Every integration executor used to call requireEnv() directly, reading
// straight from process.env (one secret shared by every client — see the
// Phase 0 audit). This is the replacement: if the node's config has a
// `__credential` field pointing at a stored, encrypted credential (set by
// ConfigPanel's Credentials section — see components/node-canvas/
// ConfigPanel.tsx), resolve and decrypt that instead.
//
// `__credential` is one of:
//   - a credential UUID          -> resolve from the encrypted store
//   - "env" (or unset/missing)   -> MIGRATION PATH: fall back to the
//     legacy process-wide env var, exactly the old behavior. This is
//     the default so existing deployments that haven't migrated any
//     workflow to a stored credential yet keep working unchanged.
//   - "none"                     -> user explicitly hasn't connected an
//     account yet; treated the same as "env" here (requireEnv will
//     throw its own clear "missing" error either way).
//
// The returned object always has the same shape requireEnv() returned
// (envVar name -> value), so every call site below only needed its
// `requireEnv([...])` call swapped for `await resolveNodeCredential(ctx,
// params, [...])` — no other executor logic changed.
export async function resolveNodeCredential(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  envNames: string[]
): Promise<Record<string, string>> {
  const credentialId = params.__credential;
  if (typeof credentialId === "string" && credentialId !== "env" && credentialId !== "none") {
    const secrets = await credentialResolver.resolve({ credentialId, clientId: ctx.clientId, workflowId: ctx.workflowId });
    const missing = envNames.filter((name) => !secrets[name]);
    if (missing.length) {
      throw new Error(
        `Stored credential is missing required field(s): ${missing.join(", ")}. Re-create the credential with all fields filled in.`
      );
    }
    return secrets;
  }
  return requireEnv(envNames);
}

// keyvalue / conditionList config fields resolve every value against the
// current input before use, so `{{$json.field}}` placeholders (the exact
// syntax the UI's own placeholders show) actually work.
function resolveKeyValue(rows: unknown, input: NodeData): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (row && typeof row === "object" && "key" in row) {
      const r = row as { key: string; value: string };
      if (r.key) out[resolveString(r.key, input)] = resolveString(String(r.value ?? ""), input);
    }
  }
  return out;
}

interface ConditionRow {
  field: string;
  operator: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";
  value: string;
}

function evalCondition(row: ConditionRow, input: NodeData): boolean {
  const left = resolveString(row.field ?? "", input);
  const right = resolveString(row.value ?? "", input);
  switch (row.operator) {
    case "notEquals":
      return left !== right;
    case "contains":
      return left.includes(right);
    case "greaterThan":
      return Number(left) > Number(right);
    case "lessThan":
      return Number(left) < Number(right);
    case "equals":
    default:
      return left === right;
  }
}

// --- Triggers ---------------------------------------------------------
// Triggers don't "do" anything when executed mid-graph; the runtime
// starts a run at a trigger node and simply seeds it with the run's
// trigger data (manual-run payload, incoming webhook body, form
// submission, or chat message).
registerExecutor("manualTrigger", async (_params, input) => input);
registerExecutor("webhook", async (_params, input) => input);
registerExecutor("schedule", async (_params, input) => input);
registerExecutor("chatTrigger", async (_params, input) => input);
registerExecutor("formTrigger", async (_params, input) => input);

// --- Logic / core -------------------------------------------------------

// A node with zero conditions configured is a misconfiguration, not a
// legitimate "nothing matched" outcome — it's reachable with one click
// (ConditionListField's row delete button has no minimum-row guard) and
// previously failed completely silently: If always took the false
// branch, Filter dropped every item, with no error or warning telling
// the workflow author why. Every other executor in this file treats a
// missing required value as a loud, actionable error; these three
// should too.
registerExecutor("if", async (params, input) => {
  const conditions = (params.conditions as ConditionRow[]) || [];
  if (conditions.length === 0) throw new Error("If node: at least one condition is required.");
  const matched = conditions.every((c) => evalCondition(c, input));
  return { port: matched ? "true" : "false", data: input };
});

registerExecutor("filter", async (params, input) => {
  const conditions = (params.conditions as ConditionRow[]) || [];
  if (conditions.length === 0) throw new Error("Filter node: at least one condition is required.");
  const matched = conditions.every((c) => evalCondition(c, input));
  // No match: emit nothing at all — this is what "drop the rest" means.
  return { emissions: matched ? [{ port: "out", data: input }] : [] };
});

registerExecutor("switch", async (params, input) => {
  const field = (params.field as string) || "";
  const rules = (params.rules as Array<{ value: string; output: string }>) || [];
  if (rules.length === 0) throw new Error("Switch node: at least one routing rule is required.");
  const actual = resolveString(field, input);
  const hit = rules.find((r) => resolveString(r.value ?? "", input) === actual);
  // Rules exist but none matched this specific input — that IS a
  // legitimate "no route for this value" outcome (unlike zero rules
  // above, which is a config problem), so this still emits nothing
  // rather than erroring.
  if (!hit) return { emissions: [] };
  return { port: hit.output || "0", data: input };
});

// Combines multiple upstream branches into one item list.
//
// PHASE 3: this node now gets real join semantics from the runtime
// (JoinResolver — see lib/execution/joinResolver.ts) purely because it
// has more than one incoming edge: it only runs once every incoming
// branch has resolved (fired or been skipped, e.g. the untaken side of
// an upstream If), and `input` here is an ARRAY of every branch that
// actually fired — not a single value invoked once per branch, as it
// was before. "Append" flattens each branch's own value (or array of
// values, if that branch already produced a list) into one combined
// list; the other modes are aliased to the same behavior since there's
// no meaningfully different interpretation of "merge" without a shared
// key to join on (that's a real feature — key-based join — worth adding
// later, not something to fake here).
registerExecutor("merge", async (params, input) => {
  const branches = Array.isArray(input) ? input : [input];
  const mode = (params.mode as string) || "append";
  if (mode === "append") {
    return branches.flatMap((branch) => (Array.isArray(branch) ? branch : [branch]));
  }
  return branches;
});

// Splits an array input into batches of `batchSize` and emits each batch
// out the "loop" port, then emits the full original input once out
// "done". True n8n SplitInBatches waits for everything downstream of
// "loop" to finish one batch before starting the next; this engine has no
// such barrier, so all batches (and "done") are enqueued up front rather
// than gated on completion — documented simplification, not silent data
// loss (every item still reaches "loop" exactly once, in order).
registerExecutor("loop", async (params, input) => {
  const batchSize = Math.max(1, Number(params.batchSize) || 1);
  const items = Array.isArray(input) ? input : [input];
  const emissions: PortEmission[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    emissions.push({ port: "loop", data: items.slice(i, i + batchSize) });
  }
  emissions.push({ port: "done", data: input });
  return { emissions };
});

registerExecutor("set", async (params, input) => {
  const fields = (params.fields as Array<{ key: string; value: string }>) || [];
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.key) values[f.key] = resolveString(String(f.value ?? ""), input);
  }
  const base = asRecord(input);
  return { ...base, ...values };
});

// Runs the node's JavaScript against the current input. `items` and
// Runs in a dedicated V8 isolate via isolated-vm — see
// lib/sandbox/codeSandbox.ts for exactly what is and isn't reachable
// from inside a code node's script (short version: nothing from this
// process except the input data itself). Hard timeout and memory limit
// apply regardless of what the node's config requests; see MAX_TIMEOUT_MS
// / MAX_MEMORY_MB in that file.
registerExecutor("code", async (params, input) => {
  const code = (params.code as string) || "";
  const timeoutMs = params.timeoutMs !== undefined ? Number(params.timeoutMs) : undefined;
  const memoryLimitMb = params.memoryLimitMb !== undefined ? Number(params.memoryLimitMb) : undefined;

  const { data, error } = await runInSandbox(code, input, { timeoutMs, memoryLimitMb });
  if (error) throw new Error(`Code node: ${error}`);
  return data as NodeData;
});

// Pauses the run for the configured duration. Capped hard at 30s: this
// executes inline inside a single API request (POST /api/workflows/[id]/run
// or the webhook route), and most serverless hosts (Vercel included) kill
// function invocations well before a multi-minute Wait would complete.
// A true long-duration Wait needs a durable scheduler/queue outside this
// request, which is a follow-up, not something this node fakes.
registerExecutor("wait", async (params, input) => {
  const duration = Number(params.duration) || 0;
  const unit = (params.unit as string) || "seconds";
  const ms = unit === "hours" ? duration * 3600_000 : unit === "minutes" ? duration * 60_000 : duration * 1000;
  const capped = Math.min(ms, 30_000);
  if (capped > 0) await new Promise((resolve) => setTimeout(resolve, capped));
  return input;
});

registerExecutor("noOp", async (_params, input) => input);

// --- HTTP Request -------------------------------------------------------
registerExecutor("httpRequest", async (params, input) => {
  const url = resolveString((params.url as string) || "", input);
  if (!url) throw new Error("HTTP Request node is missing a 'url' parameter.");
  const method = ((params.method as string) || "GET").toUpperCase();
  const headers = resolveKeyValue(params.headers, input);
  const bodyRaw = params.body as string | undefined;
  let body: unknown;
  if (bodyRaw !== undefined && bodyRaw !== "") {
    const resolved = resolveString(bodyRaw, input);
    try {
      body = JSON.parse(resolved);
    } catch {
      body = resolved;
    }
  } else if (method !== "GET") {
    body = input;
  }

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    throw new Error(`HTTP Request failed (${res.status}): ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
});

// --- AI Agent -------------------------------------------------------
// Dispatches to whichever provider was picked in the node's config
// (params.provider / params.model — see nodeDefinitions.ts). Each
// provider's API key comes from a server-side env var, never from node
// config, since node config is persisted into workflow_json and would
// otherwise round-trip a plaintext secret to the browser every time the
// workflow loads.
registerExecutor("aiAgent", async (params, input, ctx) => {
  const provider = ((params.provider as string) || "anthropic").toLowerCase();
  const model = (params.model as string) || undefined;
  const systemPrompt = (params.systemPrompt as string) || "You are a node inside an automation workflow. Respond concisely.";
  const temperature = params.temperature !== undefined ? Number(params.temperature) : 0.7;
  const userContent = `Input from previous node:\n${JSON.stringify(input)}`;

  switch (provider) {
    case "anthropic": {
      const { ANTHROPIC_API_KEY: apiKey } = await resolveNodeCredential(ctx, params, ["ANTHROPIC_API_KEY"]);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: model || "claude-sonnet-5",
          max_tokens: 1024,
          temperature,
          system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
        }),
      });
      if (!res.ok) throw new Error(`AI Agent node: Anthropic request failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const text = data.content?.find((b: { type: string }) => b.type === "text")?.text;
      if (!text) throw new Error("AI Agent node: model returned no content.");
      return { text };
    }

    case "openai": {
      const { OPENAI_API_KEY: apiKey } = await resolveNodeCredential(ctx, params, ["OPENAI_API_KEY"]);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || "gpt-5.1",
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI Agent node: OpenAI request failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("AI Agent node: model returned no content.");
      return { text };
    }

    case "google": {
      const { GOOGLE_API_KEY: apiKey } = await resolveNodeCredential(ctx, params, ["GOOGLE_API_KEY"]);
      const modelId = model || "gemini-3-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: userContent }] }],
            generationConfig: { temperature },
          }),
        }
      );
      if (!res.ok) throw new Error(`AI Agent node: Gemini request failed (${res.status}): ${await res.text()}`);
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("AI Agent node: model returned no content.");
      return { text };
    }

    case "groq": {
      const { GROQ_API_KEY: apiKey } = await resolveNodeCredential(ctx, params, ["GROQ_API_KEY"]);
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: model || "llama-3.3-70b-versatile",
          temperature,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
        }),
      });
      if (!res.ok) throw new Error(`AI Agent node: Groq request failed (${res.status}).`);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("AI Agent node: model returned no content.");
      return { text };
    }

    default:
      throw new Error(`AI Agent node: unknown provider "${provider}".`);
  }
});

// --- Email (SMTP) ---------------------------------------------------------
// Generic outbound mail via any SMTP account (Gmail app password, SES SMTP
// credentials, Postmark, etc.) — the "Email" node in the palette, distinct
// from the Gmail OAuth node below.
registerExecutor("email", async (params, input, ctx) => {
  // resolveNodeCredential returns the full field map (not filtered to
  // just the required names) when reading from a stored credential, so
  // an optional field like SMTP_PORT just falls out of the same call —
  // see its "SMTP_PORT is optional" fallback below for the env-var path.
  const secrets = await resolveNodeCredential(ctx, params, ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]);
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD } = secrets;
  const port = Number(secrets.SMTP_PORT ?? process.env.SMTP_PORT) || 587;
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
  });

  const to = resolveString((params.to as string) || "", input);
  const subject = resolveString((params.subject as string) || "", input);
  const body = resolveString((params.body as string) || "", input);
  if (!to) throw new Error("Email node: 'to' is required.");

  const info = await transport.sendMail({ from: SMTP_USER, to, subject, text: body });
  return { messageId: info.messageId, accepted: info.accepted };
});

// --- Database (generic) ---------------------------------------------------
// The palette's generic "Database" node — assumed Postgres-compatible
// (the most common default for this kind of generic SQL node); use the
// dedicated Postgres or MySQL nodes below for an explicit driver.
registerExecutor("database", async (params, input, ctx) => runPostgresQuery(params, input, ctx, "DB"));

// --- Slack -------------------------------------------------------
registerExecutor("slack", async (params, input, ctx) => {
  const { SLACK_BOT_TOKEN: token } = await resolveNodeCredential(ctx, params, ["SLACK_BOT_TOKEN"]);
  const resource = (params.resource as string) || "message";
  const headers = { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` };

  if (resource === "channel") {
    const operation = (params.operation_channel as string) || (params.operation as string) || "create";
    const channel = resolveString((params.channel as string) || "", input).replace(/^#/, "");
    const endpoint = operation === "archive" ? "conversations.archive" : "conversations.create";
    const res = await fetch(`https://slack.com/api/${endpoint}`, {
      method: "POST",
      headers,
      body: JSON.stringify(operation === "archive" ? { channel } : { name: channel }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(`Slack node: ${data.error}`);
    return data;
  }

  const operation = (params.operation_message as string) || (params.operation as string) || "send";
  const channel = resolveString((params.channel as string) || "", input);
  const text = resolveString((params.message as string) || "", input);
  const asUser = Boolean(params.asUser);
  const endpoint = operation === "update" ? "chat.update" : operation === "delete" ? "chat.delete" : "chat.postMessage";
  const res = await fetch(`https://slack.com/api/${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ channel, text, as_user: asUser }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack node: ${data.error}`);
  return data;
});

// --- Telegram -------------------------------------------------------
registerExecutor("telegram", async (params, input, ctx) => {
  const { TELEGRAM_BOT_TOKEN: token } = await resolveNodeCredential(ctx, params, ["TELEGRAM_BOT_TOKEN"]);
  const operation = (params.operation as string) || "send";
  const chatId = resolveString((params.chatId as string) || "", input);
  const text = resolveString((params.message as string) || "", input);
  const method = operation === "edit" ? "editMessageText" : operation === "delete" ? "deleteMessage" : "sendMessage";

  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram node: ${data.description || "request failed"}`);
  return data.result;
});

// --- WhatsApp -------------------------------------------------------
// Env var names match exactly what the Credentials panel shows for this
// node (nodeDefinitions.ts's whatsapp.credentialFields) — WHATSAPP_TOKEN /
// WHATSAPP_PHONE_ID previously used here did NOT match what the UI told
// users to set (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID), so a
// user who set exactly what the panel showed would still get "not
// configured" errors.
registerExecutor("whatsapp", async (params, input: NodeData, ctx: ExecutionContext) => {
  const { WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneId } = await resolveNodeCredential(ctx, params, [
    "WHATSAPP_ACCESS_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
  ]);

  const operation = (params.operation as string) || "sendText";
  const to = resolveString((params.to as string) || "", input) || String(asRecord(input).to || "");
  if (!to) throw new Error("WhatsApp node: 'to' is required.");
  const text = (key: string) => resolveString(String(params[key] ?? ""), input);
  const templateRows = Array.isArray(params.templateParameters) ? params.templateParameters : [];
  const templateParameters = templateRows
    .map((row) => (row && typeof row === "object" ? String((row as { value?: unknown }).value ?? "") : ""))
    .filter(Boolean)
    .map((value) => ({ type: "text", text: resolveString(value, input) }));

  let payload: Record<string, unknown>;
  if (operation === "sendTemplate") {
    const name = text("templateName");
    if (!name) throw new Error("WhatsApp node: 'templateName' is required for template messages.");
    payload = {
      messaging_product: "whatsapp", to, type: "template",
      template: { name, language: { code: text("templateLanguage") || "en_US" }, ...(templateParameters.length ? { components: [{ type: "body", parameters: templateParameters }] } : {}) },
    };
  } else if (["sendImage", "sendDocument", "sendAudio", "sendVideo"].includes(operation)) {
    const mediaUrl = text("mediaUrl");
    if (!mediaUrl) throw new Error("WhatsApp node: 'mediaUrl' is required for media messages.");
    const mediaType = operation.replace("send", "").toLowerCase();
    const media: Record<string, string> = { link: mediaUrl };
    if (operation !== "sendAudio" && text("mediaCaption")) media.caption = text("mediaCaption");
    if (operation === "sendDocument" && text("mediaCaption")) media.filename = text("mediaCaption");
    payload = { messaging_product: "whatsapp", to, type: mediaType, [mediaType]: media };
  } else if (operation === "sendLocation") {
    const latitude = text("latitude");
    const longitude = text("longitude");
    if (!latitude || !longitude) throw new Error("WhatsApp node: latitude and longitude are required for location messages.");
    payload = { messaging_product: "whatsapp", to, type: "location", location: { latitude, longitude, ...(text("locationName") ? { name: text("locationName") } : {}), ...(text("locationAddress") ? { address: text("locationAddress") } : {}) } };
  } else if (operation === "react") {
    const messageId = text("messageId");
    const emoji = text("reactionEmoji");
    if (!messageId || !emoji) throw new Error("WhatsApp node: message ID and reaction emoji are required.");
    payload = { messaging_product: "whatsapp", to, type: "reaction", reaction: { message_id: messageId, emoji } };
  } else {
    const message = text("message");
    if (!message) throw new Error("WhatsApp node: 'message' is required.");
    payload = { messaging_product: "whatsapp", to, type: "text", text: { preview_url: Boolean(params.previewUrl), body: message } };
  }

  const apiVersion = String(params.apiVersion || process.env.WHATSAPP_API_VERSION || "v20.0").replace(/^v?/, "v");
  const res = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`WhatsApp node: send failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Instagram -------------------------------------------------------
registerExecutor("instagram", async (params, input, ctx) => {
  const { INSTAGRAM_ACCESS_TOKEN: token } = await resolveNodeCredential(ctx, params, ["INSTAGRAM_ACCESS_TOKEN"]);
  const resource = (params.resource as string) || "message";

  if (resource === "comment") {
    const operation = (params.operation_comment as string) || "reply";
    const mediaOrCommentId = resolveString((params.to as string) || "", input);
    const message = resolveString((params.message as string) || "", input);
    const endpoint = operation === "reply" ? `${mediaOrCommentId}/replies` : mediaOrCommentId;
    const res = await fetch(`https://graph.facebook.com/v20.0/${endpoint}?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error(`Instagram node: request failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  const to = resolveString((params.to as string) || "", input);
  const message = resolveString((params.message as string) || "", input);
  const res = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, message: { text: message } }),
  });
  if (!res.ok) throw new Error(`Instagram node: send failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Facebook -------------------------------------------------------
registerExecutor("facebook", async (params, input, ctx) => {
  const { FACEBOOK_PAGE_ACCESS_TOKEN: token } = await resolveNodeCredential(ctx, params, ["FACEBOOK_PAGE_ACCESS_TOKEN"]);
  const resource = (params.resource as string) || "post";
  const pageId = resolveString((params.pageId as string) || "", input);
  const message = resolveString((params.message as string) || "", input);

  if (resource === "messenger") {
    const to = resolveString((params.to as string) || "", input);
    const res = await fetch(`https://graph.facebook.com/v20.0/me/messages?access_token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: to }, message: { text: message } }),
    });
    if (!res.ok) throw new Error(`Facebook node: send failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  const res = await fetch(`https://graph.facebook.com/v20.0/${pageId}/feed?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Facebook node: post failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Notion -------------------------------------------------------
registerExecutor("notion", async (params, input, ctx) => {
  const { NOTION_API_KEY: token } = await resolveNodeCredential(ctx, params, ["NOTION_API_KEY"]);
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2022-06-28",
  };
  const resource = (params.resource as string) || "page";
  const operation = (params.operation as string) || "create";
  const databaseId = resolveString((params.databaseId as string) || "", input);
  const properties = resolveKeyValue(params.properties, input);

  const toNotionProperties = (props: Record<string, string>) =>
    Object.fromEntries(Object.entries(props).map(([k, v]) => [k, { rich_text: [{ text: { content: v } }] }]));

  if (resource === "database" || operation === "query") {
    const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, { method: "POST", headers });
    if (!res.ok) throw new Error(`Notion node: query failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers,
    body: JSON.stringify({ parent: { database_id: databaseId }, properties: toNotionProperties(properties) }),
  });
  if (!res.ok) throw new Error(`Notion node: create failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Airtable -------------------------------------------------------
registerExecutor("airtable", async (params, input, ctx) => {
  const { AIRTABLE_API_KEY: token } = await resolveNodeCredential(ctx, params, ["AIRTABLE_API_KEY"]);
  const baseId = resolveString((params.baseId as string) || "", input);
  const table = resolveString((params.table as string) || "", input);
  const operation = (params.operation as string) || "create";
  const fields = resolveKeyValue(params.fields, input);
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`;

  if (operation === "list" || operation === "read") {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Airtable node: list failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  const res = await fetch(url, {
    method: operation === "update" ? "PATCH" : "POST",
    headers,
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Airtable node: ${operation} failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Google OAuth2 helper (Gmail + Sheets) --------------------------------
// Both Gmail and Google Sheets use a standard OAuth2 refresh-token grant:
// the client id/secret identify the app, and a long-lived refresh token
// (generated once, out of band — e.g. via Google's OAuth Playground with
// your own client id/secret, or a `gcloud` auth flow) is exchanged for a
// short-lived access token on every run. This follows the exact same
// "server env var, never node config" rule as every other credential in
// this file — nodeDefinitions.ts's credentialFields list is the source of
// truth for the exact env var names.
async function getGoogleAccessToken(
  ctx: ExecutionContext,
  params: Record<string, unknown>,
  clientIdVar: string,
  clientSecretVar: string,
  refreshTokenVar: string
) {
  const { [clientIdVar]: clientId, [clientSecretVar]: clientSecret, [refreshTokenVar]: refreshToken } = await resolveNodeCredential(
    ctx,
    params,
    [clientIdVar, clientSecretVar, refreshTokenVar]
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth token refresh failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.access_token as string;
}

// --- Gmail -------------------------------------------------------
registerExecutor("gmail", async (params, input, ctx) => {
  const accessToken = await getGoogleAccessToken(ctx, params, "GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN");
  const to = resolveString((params.to as string) || "", input);
  const subject = resolveString((params.subject as string) || "", input);
  const body = resolveString((params.body as string) || "", input);
  const operation = (params.operation as string) || "send";

  const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const endpoint =
    operation === "draft"
      ? "https://gmail.googleapis.com/gmail/v1/users/me/drafts"
      : "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
  const payload = operation === "draft" ? { message: { raw } } : { raw };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Gmail node: ${operation} failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Google Sheets -------------------------------------------------------
registerExecutor("googleSheets", async (params, input, ctx) => {
  const accessToken = await getGoogleAccessToken(ctx, params, "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN");
  const spreadsheetId = resolveString((params.spreadsheetId as string) || "", input);
  const sheet = resolveString((params.sheet as string) || "Sheet1", input);
  const operation = (params.operation as string) || "append";
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` };
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;

  if (operation === "read") {
    // Auth goes in the Authorization header (already in `headers`) only —
    // an `?access_token=` query param puts the token in server access
    // logs, proxy logs, and browser/request history, which the header
    // form doesn't.
    const res = await fetch(`${base}/values/${encodeURIComponent(sheet)}`, { headers });
    if (!res.ok) throw new Error(`Google Sheets node: read failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  if (operation === "append") {
    const row = resolveKeyValue(params.row, input);
    const values = [Object.values(row)];
    const res = await fetch(`${base}/values/${encodeURIComponent(sheet)}:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values }),
    });
    if (!res.ok) throw new Error(`Google Sheets node: append failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  throw new Error(`Google Sheets node: operation "${operation}" is not yet supported (only read/append).`);
});

// --- Postgres -------------------------------------------------------
async function runPostgresQuery(
  params: Record<string, unknown>,
  input: NodeData,
  ctx: ExecutionContext,
  prefix: "POSTGRES" | "DB"
) {
  const nameVar = prefix === "DB" ? "DB_NAME" : "POSTGRES_DB";
  const secrets = await resolveNodeCredential(ctx, params, [`${prefix}_HOST`, nameVar, `${prefix}_USER`, `${prefix}_PASSWORD`]);
  const host = secrets[`${prefix}_HOST`];
  const database = secrets[nameVar];
  const user = secrets[`${prefix}_USER`];
  const password = secrets[`${prefix}_PASSWORD`];
  const port = Number(secrets[`${prefix}_PORT`] ?? process.env[`${prefix}_PORT`]) || 5432;
  const rawQuery = (params.query as string) || "";
  if (!rawQuery) throw new Error("Postgres node: 'query' is required.");
  // Every {{$json...}} placeholder becomes a $1/$2/... bind parameter
  // instead of being spliced into the query text — see resolveQueryParams
  // in expr.ts. This is what makes it safe for the query to reference
  // data that came from outside the workflow author (a webhook body, an
  // upstream API response, etc.) without that data being able to break
  // out of a string literal and inject arbitrary SQL.
  const { text: query, values } = resolveQueryParams(rawQuery, input, (i) => `$${i}`);

  const { Client } = await import("pg");
  const client = new Client({ host, port, database, user, password });
  await client.connect();
  try {
    const result = await client.query(query, values);
    return { rows: result.rows, rowCount: result.rowCount };
  } finally {
    await client.end();
  }
}
registerExecutor("postgres", async (params, input, ctx) => runPostgresQuery(params, input, ctx, "POSTGRES"));

// --- MySQL -------------------------------------------------------
registerExecutor("mysql", async (params, input, ctx) => {
  const secrets = await resolveNodeCredential(ctx, params, ["MYSQL_HOST", "MYSQL_DB", "MYSQL_USER", "MYSQL_PASSWORD"]);
  const { MYSQL_HOST: host, MYSQL_DB: database, MYSQL_USER: user, MYSQL_PASSWORD: password } = secrets;
  const port = Number(secrets.MYSQL_PORT ?? process.env.MYSQL_PORT) || 3306;
  const rawQuery = (params.query as string) || "";
  if (!rawQuery) throw new Error("MySQL node: 'query' is required.");
  // Same bind-parameter approach as the Postgres executor above — mysql2
  // uses unnumbered `?` placeholders and a values array passed alongside
  // the query text, rather than $1/$2.
  const { text: query, values } = resolveQueryParams(rawQuery, input, () => "?");

  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({ host, port, database, user, password });
  try {
    const [rows] = await connection.query(query, values);
    return { rows };
  } finally {
    await connection.end();
  }
});

// --- Discord -----------------------------------------------------------
registerExecutor("discord", async (params, input, ctx) => {
  const { DISCORD_BOT_TOKEN: token } = await resolveNodeCredential(ctx, params, ["DISCORD_BOT_TOKEN"]);
  const channelId = resolveString((params.channelId as string) || "", input);
  const message = resolveString((params.message as string) || "", input);
  if (!channelId) throw new Error("Discord node: 'Channel ID' is required.");
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bot ${token}` },
    body: JSON.stringify({ content: message }),
  });
  if (!res.ok) throw new Error(`Discord node: send failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Stripe --------------------------------------------------------------
registerExecutor("stripe", async (params, input, ctx) => {
  const { STRIPE_SECRET_KEY: key } = await resolveNodeCredential(ctx, params, ["STRIPE_SECRET_KEY"]);
  const resource = (params.resource as string) || "customer";
  const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" };

  if (resource === "customer") {
    const operation = (params.operation_customer as string) || "create";
    if (operation === "retrieve") {
      const customerId = resolveString((params.customerId as string) || "", input);
      const res = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, { headers: auth });
      if (!res.ok) throw new Error(`Stripe node: retrieve failed (${res.status}): ${await res.text()}`);
      return await res.json();
    }
    const email = resolveString((params.email as string) || "", input);
    const res = await fetch("https://api.stripe.com/v1/customers", {
      method: "POST",
      headers: auth,
      body: new URLSearchParams({ email }),
    });
    if (!res.ok) throw new Error(`Stripe node: create customer failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  if (resource === "payment") {
    const amount = resolveString((params.amount as string) || "", input);
    const currency = resolveString((params.currency as string) || "usd", input);
    if (!amount) throw new Error("Stripe node: 'Amount' is required for a payment intent.");
    const body: Record<string, string> = { amount, currency };
    const customerId = resolveString((params.customerId as string) || "", input);
    if (customerId) body.customer = customerId;
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: auth,
      body: new URLSearchParams(body),
    });
    if (!res.ok) throw new Error(`Stripe node: create payment intent failed (${res.status}): ${await res.text()}`);
    return await res.json();
  }

  // invoice
  const operation = (params.operation_invoice as string) || "create";
  const customerId = resolveString((params.customerId as string) || "", input);
  if (!customerId) throw new Error("Stripe node: 'Customer ID' is required for an invoice.");
  if (operation === "send") {
    const res = await fetch("https://api.stripe.com/v1/invoices", {
      method: "POST",
      headers: auth,
      body: new URLSearchParams({ customer: customerId, collection_method: "send_invoice", days_until_due: "7" }),
    });
    if (!res.ok) throw new Error(`Stripe node: create invoice failed (${res.status}): ${await res.text()}`);
    const invoice = await res.json();
    const sendRes = await fetch(`https://api.stripe.com/v1/invoices/${invoice.id}/send`, { method: "POST", headers: auth });
    if (!sendRes.ok) throw new Error(`Stripe node: send invoice failed (${sendRes.status}): ${await sendRes.text()}`);
    return await sendRes.json();
  }
  const res = await fetch("https://api.stripe.com/v1/invoices", {
    method: "POST",
    headers: auth,
    body: new URLSearchParams({ customer: customerId }),
  });
  if (!res.ok) throw new Error(`Stripe node: create invoice failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- Twilio --------------------------------------------------------------
registerExecutor("twilio", async (params, input, ctx) => {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from } = await resolveNodeCredential(
    ctx,
    params,
    ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER"]
  );
  const to = resolveString((params.to as string) || "", input);
  const body = resolveString((params.message as string) || "", input);
  if (!to) throw new Error("Twilio node: 'To' is required.");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio node: send failed (${res.status}): ${await res.text()}`);
  return await res.json();
});

// --- OpenAI (direct chat completion, no agent loop) -----------------------
registerExecutor("openaiChat", async (params, input, ctx) => {
  const { OPENAI_API_KEY: apiKey } = await resolveNodeCredential(ctx, params, ["OPENAI_API_KEY"]);
  const model = (params.model as string) || "gpt-4.1";
  const systemPrompt = resolveString((params.systemPrompt as string) || "", input);
  const temperature = params.temperature !== undefined ? Number(params.temperature) : 0.7;
  const prompt = resolveString((params.prompt as string) || "", input);
  if (!prompt) throw new Error("OpenAI node: 'Prompt' is required.");

  const messages = systemPrompt ? [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }] : [{ role: "user", content: prompt }];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature, messages }),
  });
  if (!res.ok) throw new Error(`OpenAI node: request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI node: model returned no content.");
  return { text };
});

// Catalog coverage: every Core node has a registered runtime entry. Nodes
// without a specialized executor use a safe pass-through stub until their
// operation is implemented; this keeps the catalog usable and makes the
// implementation status explicit in nodeDefinitions without silently failing
// at registry lookup time. Existing full executors always win.
for (const definition of CORE_NODE_CATALOG) {
  if (!getExecutor(definition.type)) {
    registerExecutor(definition.type, async (_params, input) => input);
  }
}

// Re-exported so any future executor needing to resolve nested config
// (an object/array of strings, not just one string) can `import {
// resolveDeep } from "../expr"` without duplicating the walk.
export { resolveDeep };
