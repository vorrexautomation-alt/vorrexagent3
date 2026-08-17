import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getScopedSupabaseClient } from "@/lib/supabaseClient";
import { verifySession } from "@/lib/auth";
import { NODE_DEFINITIONS } from "@/components/node-canvas/nodeDefinitions";

// Groq exposes an OpenAI-compatible /chat/completions endpoint, so a plain
// fetch is all that's needed — no SDK dependency.
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// Built from the same NODE_DEFINITIONS the canvas/palette renders from, so
// the list of valid node "type" strings the AI is allowed to use can never
// drift out of sync with what the canvas can actually render. Each line is
// `type — label: description` to give the model enough context to pick the
// right one without guessing at config shape.
const NODE_TYPE_REFERENCE = NODE_DEFINITIONS.map(
  (d) => `- "${d.type}" (${d.category}) — ${d.label}: ${d.description}`
).join("\n");

// The Vorrex Agents system prompt.
//
// IMPORTANT: this is NOT real n8n. It's a lookalike UI on top of this
// app's own simplified graph format (see components/node-canvas/types.ts,
// WorkflowGraph). A model told to produce "valid n8n workflow JSON" will
// correctly produce genuine n8n node types like "n8n-nodes-base.webhook"
// and n8n's real `connections["NodeName"].main[[{node,type,index}]]`
// shape — neither of which this canvas can read, since it looks nodes up
// by exact match against the short type strings below and expects
// connections keyed by id with {source, sourceHandle, target,
// targetHandle}. The previous version of this prompt asked for "n8n
// workflow JSON" and never specified this app's actual shape, which is
// why AI-generated nodes showed up as "Unknown node type" on the canvas.
const VORREX_SYSTEM_PROMPT = `You are Vorrex Agents, the AI workflow architect for the Vorrex automation platform.

Vorrex has its own visual workflow builder — it looks similar to n8n but is NOT n8n and does NOT use n8n's node type names or connection format. You must only use the node types and JSON shape defined below for THIS platform.

### Valid node types (use the "type" string exactly as shown, nothing else)
${NODE_TYPE_REFERENCE}

### Required JSON shape for the "workflow" field
{
  "nodes": [
    {
      "id": "string, unique within the workflow, e.g. \\"node_1\\"",
      "type": "one of the exact type strings listed above",
      "name": "short human-readable label for this node instance",
      "position": { "x": number, "y": number },
      "config": { "...fields specific to this node type, matching what its config panel shows..." }
    }
  ],
  "connections": {
    "connection_id (any unique string)": {
      "source": "id of the source node",
      "sourceHandle": "\\"out\\" for a single-output node, or the specific output port id (e.g. \\"true\\"/\\"false\\" for an IF node)",
      "target": "id of the target node",
      "targetHandle": "\\"in\\" for a single-input node"
    }
  }
}

Space nodes roughly 260px apart horizontally (or vertically for parallel branches) so they don't overlap on the canvas.

### Absolute Rules
- Only use "type" values from the list above — never invent a node type, never use n8n's real node type names (no "n8n-nodes-base.*" strings)
- Never destroy existing logic unless explicitly requested — when editing, preserve nodes/connections not related to the request
- Keep connections, naming, and structure clean and professional
- Ask clarifying questions when the request is ambiguous (respond with "clarification_needed" instead of a workflow)
- Never put API keys, tokens, or secrets into a node's "config" — Vorrex stores those separately in an encrypted per-client credential store the user connects through each node's "Credentials" section in the UI. Leave a new integration node's config exactly as its default (no "__credential" key) so it shows as "Not connected" until the user connects an account themselves.
- Whenever you add a node whose type requires credentials (any node in the reference list above tagged with a "Communication", "Database & Storage", "Productivity & Docs", or "ai" category typically does), call this out explicitly in "explanation" — name the node and tell the user it needs an account connected before it will run, e.g. "I added a WhatsApp node — open it and click '+ Add new credential' to connect your WhatsApp Business account before running this."

### Output contract (mandatory)
Respond with ONLY a single JSON object, no prose outside it, in exactly this shape:
{
  "understanding": "brief restatement of the request",
  "plan": ["change 1", "change 2"],
  "workflow": { ...complete workflow JSON in the shape defined above... },
  "explanation": "what changed and why",
  "suggestions": ["optional improvement 1", "optional improvement 2"],
  "clarification_needed": null
}

If the request is too ambiguous to act on safely, instead respond with:
{
  "understanding": "brief restatement",
  "plan": [],
  "workflow": null,
  "explanation": "",
  "suggestions": [],
  "clarification_needed": "the specific question to ask the user"
}

Think like a senior automation engineer. Be precise and correct above all else.`;

function getSessionToken(req: NextRequest) {
  return (req.headers.get("authorization") || "").replace("Bearer ", "");
}

export async function POST(req: NextRequest) {
  const token = getSessionToken(req);
  let claims;
  try {
    claims = verifySession(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { workflow_id, prompt } = await req.json();
  if (!workflow_id || !prompt) {
    return NextResponse.json({ error: "workflow_id and prompt are required." }, { status: 400 });
  }

  // Load the workflow — scoped so a client can only ever edit their own.
  const db = claims.app_role === "owner" ? supabaseAdmin : getScopedSupabaseClient(token);
  const { data: wf, error: loadError } = await db
    .from("workflows")
    .select("id, client_id, name, workflow_json")
    .eq("id", workflow_id)
    .single();

  if (loadError || !wf) return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  const userMessage = `Current Workflow:
\`\`\`json
${JSON.stringify(wf.workflow_json, null, 2)}
\`\`\`

Request:
${prompt}`;

  const groqRes = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 8000,
      temperature: 0.2,
      response_format: { type: "json_object" }, // JSON mode — supported by current Groq models
      messages: [
        { role: "system", content: VORREX_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
    }),
  });

  if (!groqRes.ok) {
    const detail = await groqRes.text();
    return NextResponse.json(
      { error: `Groq request failed (HTTP ${groqRes.status}).`, detail: detail.slice(0, 500) },
      { status: 502 }
    );
  }

  const groqData = await groqRes.json();
  const rawText: string | undefined = groqData.choices?.[0]?.message?.content;
  if (!rawText) {
    return NextResponse.json({ error: "AI returned no usable content." }, { status: 502 });
  }

  let parsed;
  try {
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "AI response was not valid JSON.", raw: rawText }, { status: 502 });
  }

  if (parsed.clarification_needed) {
    return NextResponse.json({ clarification_needed: parsed.clarification_needed });
  }

  // Defense in depth: even with the schema spelled out in the prompt above,
  // don't trust the model's output blindly. Reject (rather than silently
  // save) any workflow that references a node type the canvas doesn't
  // know how to render — this is exactly the class of bug that produced
  // "Unknown node type" cards on the canvas before this check existed.
  const validTypes = new Set(NODE_DEFINITIONS.map((d) => d.type));
  const badTypes = Array.from(
    new Set((parsed.workflow?.nodes || []).map((n: { type: string }) => n.type).filter((t: string) => !validTypes.has(t)))
  );
  if (badTypes.length > 0) {
    return NextResponse.json(
      { error: `AI generated an unsupported node type: ${badTypes.join(", ")}. Nothing was saved — try rephrasing the request.` },
      { status: 502 }
    );
  }

  // Persist the updated workflow
  const { error: updateError } = await db
    .from("workflows")
    .update({ workflow_json: parsed.workflow })
    .eq("id", workflow_id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await supabaseAdmin.from("audit_log").insert({
    actor_type: claims.app_role,
    actor_id: claims.app_role === "owner" ? "00000000-0000-0000-0000-000000000000" : (claims as { client_id: string }).client_id,
    action: "workflow.ai_edit",
    workflow_id,
    client_id: wf.client_id,
    details: { prompt },
  });

  return NextResponse.json(parsed);
}
