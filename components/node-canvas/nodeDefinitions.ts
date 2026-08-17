// components/node-canvas/nodeDefinitions.ts
//
// The single source of truth for every node type the palette offers. Each
// entry drives: the palette list, the node card's icon/ports, and the
// config panel's form fields. Add a node type by adding one entry here —
// nothing else needs to change.

import type { NodeTypeDefinition } from "./types";
import { CORE_NODE_CATALOG } from "./coreNodeCatalog";
import { FULL_NODE_CATALOG } from "./fullNodeCatalog";

const OUT = { id: "out" };
const IN = { id: "in" };

const BASE_NODE_DEFINITIONS: NodeTypeDefinition[] = [
  // ---------------------------------------------------------------- triggers
  {
    type: "webhook",
    label: "Webhook",
    category: "trigger",
    description: "Starts the workflow when an HTTP request hits a unique URL.",
    icon: "webhook",
    iconKind: "outline",
    inputs: [],
    outputs: [OUT],
    defaultConfig: { method: "POST", path: "" },
    configFields: [
      { key: "path", label: "Path", type: "text", placeholder: "/my-webhook" },
      {
        key: "method",
        label: "HTTP Method",
        type: "select",
        options: ["GET", "POST", "PUT", "DELETE"].map((m) => ({ label: m, value: m })),
      },
      { key: "responseMode", label: "Respond", type: "select", options: [
        { label: "Immediately", value: "immediately" },
        { label: "When workflow finishes", value: "lastNode" },
      ] },
    ],
  },
  {
    type: "schedule",
    label: "Schedule",
    category: "trigger",
    description: "Runs the workflow on a recurring interval or cron expression.",
    icon: "clock",
    iconKind: "outline",
    inputs: [],
    outputs: [OUT],
    defaultConfig: { mode: "interval", interval: "5", unit: "minutes", cron: "" },
    configFields: [
      { key: "mode", label: "Trigger mode", type: "select", options: [
        { label: "Interval", value: "interval" },
        { label: "Cron expression", value: "cron" },
      ] },
      { key: "interval", label: "Every", type: "number", placeholder: "5" },
      { key: "unit", label: "Unit", type: "select", options: [
        { label: "Minutes", value: "minutes" },
        { label: "Hours", value: "hours" },
        { label: "Days", value: "days" },
      ] },
      { key: "cron", label: "Cron expression", type: "text", placeholder: "0 */6 * * *" },
    ],
  },
  {
    type: "manualTrigger",
    label: "Manual Trigger",
    category: "trigger",
    description: "Runs only when you click \"Run\" — useful while building.",
    icon: "cursorClick",
    iconKind: "outline",
    inputs: [],
    outputs: [OUT],
    defaultConfig: {},
    configFields: [],
  },
  {
    type: "chatTrigger",
    label: "Chat Message",
    category: "trigger",
    description: "Starts the workflow when a message arrives in a connected chat.",
    icon: "chat",
    iconKind: "outline",
    inputs: [],
    outputs: [OUT],
    defaultConfig: { channel: "" },
    configFields: [
      { key: "channel", label: "Listen on", type: "text", placeholder: "e.g. #support" },
    ],
  },
  {
    type: "formTrigger",
    label: "Form Trigger",
    category: "trigger",
    description: "Starts the workflow when someone submits a hosted form.",
    icon: "form",
    iconKind: "outline",
    inputs: [],
    outputs: [OUT],
    defaultConfig: { title: "", fields: [{ key: "", value: "" }] },
    configFields: [
      { key: "title", label: "Form title", type: "text", placeholder: "Contact us", group: "parameters" },
      { key: "fields", label: "Form fields", type: "keyvalue", group: "parameters" },
    ],
  },

  // ------------------------------------------------------------ core/logic
  {
    type: "if",
    label: "IF",
    category: "core",
    description: "Splits the flow in two branches based on a condition.",
    icon: "branch",
    iconKind: "outline",
    inputs: [IN],
    outputs: [
      { id: "true", label: "True" },
      { id: "false", label: "False" },
    ],
    defaultConfig: { conditions: [{ field: "", operator: "equals", value: "" }] },
    configFields: [
      { key: "conditions", label: "Conditions", type: "conditionList" },
    ],
  },
  {
    type: "filter",
    label: "Filter",
    category: "core",
    description: "Keeps only the items that match a condition, drops the rest.",
    icon: "filter",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    defaultConfig: { conditions: [{ field: "", operator: "equals", value: "" }] },
    configFields: [
      { key: "conditions", label: "Keep items where", type: "conditionList", group: "parameters" },
    ],
  },
  {
    type: "switch",
    label: "Switch",
    category: "core",
    description: "Routes to one of several branches based on a matched value.",
    icon: "split",
    iconKind: "outline",
    inputs: [IN],
    outputs: [
      { id: "0", label: "Output 0" },
      { id: "1", label: "Output 1" },
      { id: "2", label: "Output 2" },
    ],
    defaultConfig: { field: "", rules: [{ value: "", output: "0" }] },
    configFields: [
      { key: "field", label: "Value to check", type: "text", placeholder: "{{$json.status}}" },
      { key: "rules", label: "Routing rules", type: "conditionList" },
    ],
  },
  {
    type: "merge",
    label: "Merge",
    category: "core",
    description: "Combines two or more input branches back into one.",
    icon: "merge",
    iconKind: "outline",
    inputs: [{ id: "in0", label: "Input 1" }, { id: "in1", label: "Input 2" }],
    outputs: [OUT],
    defaultConfig: { mode: "append" },
    configFields: [
      { key: "mode", label: "Mode", type: "select", options: [
        { label: "Append", value: "append" },
        { label: "Merge by key", value: "mergeByKey" },
        { label: "Wait for all", value: "waitAll" },
      ] },
    ],
  },
  {
    type: "loop",
    label: "Loop",
    category: "core",
    description: "Splits items into batches and iterates over them.",
    icon: "loop",
    iconKind: "outline",
    inputs: [IN],
    outputs: [
      { id: "loop", label: "Loop" },
      { id: "done", label: "Done" },
    ],
    defaultConfig: { batchSize: 1 },
    configFields: [
      { key: "batchSize", label: "Batch size", type: "number", placeholder: "1" },
    ],
  },
  {
    type: "set",
    label: "Set",
    category: "core",
    description: "Sets or overwrites fields on the data passing through.",
    icon: "pencil",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    defaultConfig: { fields: [{ key: "", value: "" }] },
    configFields: [
      { key: "fields", label: "Fields to set", type: "keyvalue" },
    ],
  },
  {
    type: "code",
    label: "Code",
    category: "core",
    description: "Runs custom JavaScript against the incoming data, in an isolated sandbox.",
    icon: "code",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    defaultConfig: { code: "// return items;\nreturn items;", timeoutMs: 5000, memoryLimitMb: 64 },
    configFields: [
      { key: "code", label: "JavaScript", type: "code", rows: 10 },
      {
        key: "timeoutMs",
        label: "Timeout (ms)",
        type: "text",
        group: "advanced",
        helpText: "Hard cap 30000ms regardless of what's entered here.",
      },
      {
        key: "memoryLimitMb",
        label: "Memory limit (MB)",
        type: "text",
        group: "advanced",
        helpText: "Hard cap 256MB regardless of what's entered here.",
      },
    ],
  },
  {
    type: "wait",
    label: "Wait",
    category: "core",
    description: "Pauses the workflow for a fixed duration before continuing.",
    icon: "wait",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    defaultConfig: { duration: "5", unit: "seconds" },
    configFields: [
      { key: "duration", label: "Duration", type: "number", placeholder: "5" },
      { key: "unit", label: "Unit", type: "select", options: [
        { label: "Seconds", value: "seconds" },
        { label: "Minutes", value: "minutes" },
        { label: "Hours", value: "hours" },
      ] },
    ],
  },
  {
    type: "noOp",
    label: "No Operation",
    category: "core",
    description: "Passes data through unchanged. Useful as a placeholder.",
    icon: "noop",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    defaultConfig: {},
    configFields: [],
  },

  // ---------------------------------------------------------- integrations
  {
    type: "httpRequest",
    label: "HTTP Request",
    category: "integration",
    subcategory: "Network & Web",
    description: "Calls any external API over HTTP.",
    icon: "globe",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    defaultConfig: { url: "", method: "GET", headers: [], body: "" },
    configFields: [
      { key: "method", label: "Method", type: "select", group: "resource", options: ["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ label: m, value: m })) },
      { key: "url", label: "URL", type: "text", placeholder: "https://api.example.com/...", group: "parameters" },
      { key: "body", label: "Body (JSON)", type: "code", rows: 6, group: "parameters", showWhen: { field: "method", oneOf: ["POST", "PUT", "PATCH"] } },
      { key: "headers", label: "Headers", type: "keyvalue", group: "advanced" },
    ],
  },
  {
    type: "aiAgent",
    label: "AI Agent",
    category: "ai",
    description: "Runs an LLM agent with tools against the incoming data.",
    icon: "bot",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Model provider API key",
    defaultConfig: { provider: "anthropic", model: "claude-sonnet-5", systemPrompt: "", temperature: "0.7" },
    configFields: [
      {
        key: "provider",
        label: "Provider",
        type: "select",
        group: "resource",
        options: [
          { label: "Anthropic (Claude)", value: "anthropic" },
          { label: "OpenAI (GPT)", value: "openai" },
          { label: "Google (Gemini)", value: "google" },
          { label: "Groq", value: "groq" },
        ],
      },
      {
        key: "modelAnthropic",
        configKey: "model",
        label: "Model",
        type: "select",
        group: "resource",
        showWhen: { field: "provider", oneOf: ["anthropic"] },
        options: [
          { label: "Claude Sonnet 5", value: "claude-sonnet-5" },
          { label: "Claude Opus 4.8", value: "claude-opus-4-8" },
          { label: "Claude Haiku 4.5", value: "claude-haiku-4-5-20251001" },
        ],
      },
      {
        key: "modelOpenAI",
        configKey: "model",
        label: "Model",
        type: "select",
        group: "resource",
        showWhen: { field: "provider", oneOf: ["openai"] },
        options: [
          { label: "GPT-5.1", value: "gpt-5.1" },
          { label: "GPT-5.1 mini", value: "gpt-5.1-mini" },
          { label: "GPT-5.1 nano", value: "gpt-5.1-nano" },
        ],
      },
      {
        key: "modelGoogle",
        configKey: "model",
        label: "Model",
        type: "select",
        group: "resource",
        showWhen: { field: "provider", oneOf: ["google"] },
        options: [
          { label: "Gemini 3 Pro", value: "gemini-3-pro" },
          { label: "Gemini 3 Flash", value: "gemini-3-flash" },
        ],
      },
      {
        key: "modelGroq",
        configKey: "model",
        label: "Model",
        type: "select",
        group: "resource",
        showWhen: { field: "provider", oneOf: ["groq"] },
        options: [
          { label: "Llama 3.3 70B Versatile", value: "llama-3.3-70b-versatile" },
          { label: "Llama 3.1 8B Instant", value: "llama-3.1-8b-instant" },
        ],
      },
      {
        key: "apiKeyNote",
        label: "API key",
        type: "text",
        readOnly: true,
        group: "advanced",
        placeholder: "Configured via environment variable — see below",
        helpText:
          "Not entered here on purpose: a key typed into this field would be saved as plain text inside the workflow (workflow_json in the database) and sent to the browser every time this workflow loads. Instead, the server reads it from an environment variable matching the provider above — ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or GROQ_API_KEY — set in your hosting provider's dashboard (e.g. Vercel → Project → Settings → Environment Variables). This field is read-only/disabled in the UI.",
      },
      { key: "systemPrompt", label: "System prompt", type: "textarea", rows: 5, group: "parameters" },
      { key: "temperature", label: "Temperature", type: "text", placeholder: "0.7", group: "advanced" },
    ],
  },
  {
    type: "email",
    label: "Send Email",
    category: "integration",
    subcategory: "Communication",
    description: "Sends an email over SMTP.",
    icon: "mail",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "SMTP connection",
    credentialType: "smtp",
    credentialFields: [
      { label: "Host", envVar: "SMTP_HOST" },
      { label: "Port", envVar: "SMTP_PORT" },
      { label: "Username", envVar: "SMTP_USER" },
      { label: "Password", envVar: "SMTP_PASSWORD" },
    ],
    defaultConfig: { resource: "message", operation: "send", to: "", subject: "", body: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["message"] }, options: [
        { label: "Send", value: "send" },
      ] },
      { key: "to", label: "To", type: "text", placeholder: "someone@example.com", group: "parameters" },
      { key: "subject", label: "Subject", type: "text", group: "parameters" },
      { key: "body", label: "Body", type: "textarea", rows: 6, group: "parameters" },
    ],
  },
  {
    type: "database",
    label: "Database",
    category: "integration",
    subcategory: "Database & Storage",
    description: "Runs a custom SQL query against a connected database.",
    icon: "database",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Database connection",
    credentialType: "database",
    credentialFields: [
      { label: "Host", envVar: "DB_HOST" },
      { label: "Port", envVar: "DB_PORT" },
      { label: "Database name", envVar: "DB_NAME" },
      { label: "Username", envVar: "DB_USER" },
      { label: "Password", envVar: "DB_PASSWORD" },
    ],
    defaultConfig: { resource: "query", operation: "execute", query: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Query", value: "query" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["query"] }, options: [
        { label: "Execute query", value: "execute" },
      ] },
      { key: "query", label: "SQL query", type: "code", rows: 6, group: "parameters" },
    ],
  },

  // ------------------------------------------------------ integrations (brand)
  {
    type: "slack",
    label: "Slack",
    category: "integration",
    subcategory: "Communication",
    description: "Sends a message to a Slack channel or user.",
    icon: "slack",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Slack account",
    credentialType: "oauth2",
    credentialFields: [
      { label: "Client ID", envVar: "SLACK_CLIENT_ID" },
      { label: "Client secret", envVar: "SLACK_CLIENT_SECRET" },
      { label: "Bot token", envVar: "SLACK_BOT_TOKEN" },
    ],
    defaultConfig: { resource: "message", operation: "post", channel: "", message: "", asUser: false },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
        { label: "Channel", value: "channel" },
        { label: "Reaction", value: "reaction" },
      ] },
      { key: "operation_message", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["message"] }, options: [
        { label: "Post", value: "post" },
        { label: "Update", value: "update" },
        { label: "Delete", value: "delete" },
      ] },
      { key: "operation_channel", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["channel"] }, options: [
        { label: "Create", value: "create" },
        { label: "Archive", value: "archive" },
        { label: "Invite user", value: "invite" },
      ] },
      { key: "channel", label: "Channel", type: "text", placeholder: "#general", group: "parameters", showWhen: { field: "resource", oneOf: ["message", "channel"] } },
      { key: "message", label: "Message text", type: "textarea", rows: 4, group: "parameters", showWhen: { field: "resource", oneOf: ["message"] } },
      { key: "asUser", label: "Send as connected user (not bot)", type: "boolean", group: "advanced", showWhen: { field: "resource", oneOf: ["message"] } },
    ],
  },
  {
    type: "telegram",
    label: "Telegram",
    category: "integration",
    subcategory: "Communication",
    description: "Sends a message via a Telegram bot.",
    icon: "telegram",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Telegram bot token",
    credentialType: "apiKey",
    credentialFields: [
      { label: "Bot token", envVar: "TELEGRAM_BOT_TOKEN" },
    ],
    defaultConfig: { resource: "message", operation: "send", chatId: "", message: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["message"] }, options: [
        { label: "Send", value: "send" },
        { label: "Edit", value: "edit" },
        { label: "Delete", value: "delete" },
      ] },
      { key: "chatId", label: "Chat ID", type: "text", group: "parameters" },
      { key: "message", label: "Message", type: "textarea", rows: 4, group: "parameters", showWhen: { field: "operation", oneOf: ["send", "edit"] } },
    ],
  },
  {
    type: "whatsapp",
    label: "WhatsApp",
    category: "integration",
    subcategory: "Communication",
    description: "Sends a WhatsApp message via the Business API.",
    icon: "whatsapp",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "WhatsApp Business account",
    credentialType: "whatsappBusinessApi",
    acceptedCredentialTypes: ["whatsappBusinessApi", "apiKey", "httpHeaderAuth"],
    credentialFields: [
      { label: "Access token", envVar: "WHATSAPP_ACCESS_TOKEN" },
      { label: "Phone number ID", envVar: "WHATSAPP_PHONE_NUMBER_ID" },
    ],
    defaultConfig: { resource: "message", operation: "sendText", to: "", message: "", templateLanguage: "en_US", mediaUrl: "", mediaCaption: "", templateParameters: [] },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["message"] }, options: [
        { label: "Send text message", value: "sendText" },
        { label: "Send template message", value: "sendTemplate" },
        { label: "Send image", value: "sendImage" },
        { label: "Send document", value: "sendDocument" },
        { label: "Send audio", value: "sendAudio" },
        { label: "Send video", value: "sendVideo" },
        { label: "Send location", value: "sendLocation" },
        { label: "React to message", value: "react" },
      ] },
      { key: "to", label: "To (phone number)", type: "text", placeholder: "+1... or {{$json.phone}}", group: "parameters" },
      { key: "message", label: "Message body", type: "textarea", rows: 4, placeholder: "Hello from Vorrex", group: "parameters", showWhen: { field: "operation", oneOf: ["sendText"] } },
      { key: "templateName", label: "Template name", type: "text", group: "parameters", showWhen: { field: "operation", oneOf: ["sendTemplate"] } },
      { key: "templateLanguage", label: "Template language", type: "text", placeholder: "en_US", group: "parameters", showWhen: { field: "operation", oneOf: ["sendTemplate"] } },
      { key: "templateParameters", label: "Template parameters", type: "keyvalue", group: "advanced", helpText: "Values are sent as body text parameters in order of the rows." , showWhen: { field: "operation", oneOf: ["sendTemplate"] } },
      { key: "mediaUrl", label: "Media URL", type: "text", placeholder: "https://...", group: "parameters", showWhen: { field: "operation", oneOf: ["sendImage", "sendDocument", "sendAudio", "sendVideo"] } },
      { key: "mediaCaption", label: "Caption / filename", type: "text", group: "advanced", showWhen: { field: "operation", oneOf: ["sendImage", "sendDocument", "sendVideo"] } },
      { key: "latitude", label: "Latitude", type: "text", group: "parameters", showWhen: { field: "operation", oneOf: ["sendLocation"] } },
      { key: "longitude", label: "Longitude", type: "text", group: "parameters", showWhen: { field: "operation", oneOf: ["sendLocation"] } },
      { key: "locationName", label: "Location name", type: "text", group: "advanced", showWhen: { field: "operation", oneOf: ["sendLocation"] } },
      { key: "locationAddress", label: "Location address", type: "text", group: "advanced", showWhen: { field: "operation", oneOf: ["sendLocation"] } },
      { key: "messageId", label: "Message ID", type: "text", group: "parameters", showWhen: { field: "operation", oneOf: ["react"] } },
      { key: "reactionEmoji", label: "Reaction emoji", type: "text", placeholder: "👍", group: "parameters", showWhen: { field: "operation", oneOf: ["react"] } },
    ],
  },
  {
    type: "instagram",
    label: "Instagram",
    category: "integration",
    subcategory: "Communication",
    description: "Posts or replies to Instagram DMs and comments.",
    icon: "instagram",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Instagram account",
    credentialType: "apiKey",
    credentialFields: [
      { label: "Access token", envVar: "INSTAGRAM_ACCESS_TOKEN" },
    ],
    defaultConfig: { resource: "message", operation: "sendDM", to: "", message: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
        { label: "Comment", value: "comment" },
      ] },
      { key: "operation_message", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["message"] }, options: [
        { label: "Send DM", value: "sendDM" },
      ] },
      { key: "operation_comment", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["comment"] }, options: [
        { label: "Reply to comment", value: "replyComment" },
      ] },
      { key: "to", label: "To", type: "text", group: "parameters" },
      { key: "message", label: "Message", type: "textarea", rows: 4, group: "parameters" },
    ],
  },
  {
    type: "facebook",
    label: "Facebook",
    category: "integration",
    subcategory: "Communication",
    description: "Posts to a Facebook Page or replies to Messenger.",
    icon: "facebook",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Facebook Page account",
    credentialType: "apiKey",
    credentialFields: [
      { label: "Page access token", envVar: "FACEBOOK_PAGE_ACCESS_TOKEN" },
    ],
    defaultConfig: { resource: "post", operation: "create", pageId: "", message: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Page post", value: "post" },
        { label: "Messenger message", value: "messenger" },
      ] },
      { key: "operation_post", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["post"] }, options: [
        { label: "Create", value: "create" },
        { label: "Delete", value: "delete" },
      ] },
      { key: "operation_messenger", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["messenger"] }, options: [
        { label: "Send reply", value: "reply" },
      ] },
      { key: "pageId", label: "Page ID", type: "text", group: "parameters" },
      { key: "message", label: "Message", type: "textarea", rows: 4, group: "parameters" },
    ],
  },
  {
    type: "notion",
    label: "Notion",
    category: "integration",
    subcategory: "Productivity & Docs",
    description: "Creates or updates a page/database row in Notion.",
    icon: "notion",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Notion integration",
    credentialType: "apiKey",
    credentialFields: [
      { label: "Internal integration secret", envVar: "NOTION_API_KEY" },
    ],
    defaultConfig: { resource: "databaseRow", operation: "create", databaseId: "", properties: [] },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Database row", value: "databaseRow" },
        { label: "Page", value: "page" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", options: [
        { label: "Create", value: "create" },
        { label: "Update", value: "update" },
      ] },
      { key: "databaseId", label: "Database ID", type: "text", group: "parameters" },
      { key: "properties", label: "Properties", type: "keyvalue", group: "parameters" },
    ],
  },
  {
    type: "airtable",
    label: "Airtable",
    category: "integration",
    subcategory: "Productivity & Docs",
    description: "Creates or updates a record in an Airtable base.",
    icon: "airtable",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Airtable account",
    credentialType: "apiKey",
    credentialFields: [
      { label: "Personal access token", envVar: "AIRTABLE_API_KEY" },
    ],
    defaultConfig: { resource: "record", operation: "create", baseId: "", table: "", fields: [] },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Record", value: "record" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["record"] }, options: [
        { label: "Create", value: "create" },
        { label: "List", value: "list" },
        { label: "Update", value: "update" },
        { label: "Delete", value: "delete" },
      ] },
      { key: "baseId", label: "Base ID", type: "text", group: "parameters" },
      { key: "table", label: "Table", type: "text", group: "parameters" },
      { key: "fields", label: "Fields", type: "keyvalue", group: "parameters", showWhen: { field: "operation", oneOf: ["create", "update"] } },
    ],
  },
  {
    type: "gmail",
    label: "Gmail",
    category: "integration",
    subcategory: "Communication",
    description: "Sends an email through a connected Gmail account.",
    icon: "gmail",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Gmail account",
    credentialType: "oauth2",
    credentialFields: [
      { label: "Client ID", envVar: "GMAIL_CLIENT_ID" },
      { label: "Client secret", envVar: "GMAIL_CLIENT_SECRET" },
      { label: "Refresh token", envVar: "GMAIL_REFRESH_TOKEN" },
    ],
    defaultConfig: { resource: "message", operation: "send", to: "", subject: "", body: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["message"] }, options: [
        { label: "Send", value: "send" },
        { label: "Save as draft", value: "draft" },
      ] },
      { key: "to", label: "To", type: "text", group: "parameters" },
      { key: "subject", label: "Subject", type: "text", group: "parameters" },
      { key: "body", label: "Body", type: "textarea", rows: 6, group: "parameters" },
    ],
  },
  {
    type: "googleSheets",
    label: "Google Sheets",
    category: "integration",
    subcategory: "Productivity & Docs",
    description: "Reads, appends, or updates rows in a spreadsheet.",
    icon: "googleSheets",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Google account",
    credentialType: "oauth2",
    credentialFields: [
      { label: "Client ID", envVar: "GOOGLE_CLIENT_ID" },
      { label: "Client secret", envVar: "GOOGLE_CLIENT_SECRET" },
      { label: "Refresh token", envVar: "GOOGLE_REFRESH_TOKEN" },
    ],
    defaultConfig: { resource: "sheet", spreadsheetId: "", sheet: "", operation: "append", row: [], filter: [] },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Sheet within document", value: "sheet" },
        { label: "Spreadsheet (whole document)", value: "spreadsheet" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["sheet"] }, options: [
        { label: "Append row", value: "append" },
        { label: "Read rows", value: "read" },
        { label: "Update row", value: "update" },
        { label: "Delete row", value: "delete" },
      ] },
      { key: "spreadsheetId", label: "Spreadsheet ID", type: "text", placeholder: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms", group: "parameters" },
      { key: "sheet", label: "Sheet name", type: "text", placeholder: "Sheet1", group: "parameters", showWhen: { field: "resource", oneOf: ["sheet"] } },
      { key: "row", label: "Row values", type: "keyvalue", group: "parameters", showWhen: { field: "operation", oneOf: ["append", "update"] } },
      { key: "filter", label: "Filter (rows matching)", type: "keyvalue", group: "parameters", showWhen: { field: "operation", oneOf: ["read", "update", "delete"] } },
    ],
  },
  {
    type: "postgres",
    label: "Postgres",
    category: "integration",
    subcategory: "Database & Storage",
    description: "Runs a query against a PostgreSQL database.",
    icon: "postgres",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Postgres connection",
    credentialType: "database",
    credentialFields: [
      { label: "Host", envVar: "POSTGRES_HOST" },
      { label: "Port", envVar: "POSTGRES_PORT" },
      { label: "Database name", envVar: "POSTGRES_DB" },
      { label: "Username", envVar: "POSTGRES_USER" },
      { label: "Password", envVar: "POSTGRES_PASSWORD" },
    ],
    defaultConfig: { resource: "query", operation: "execute", query: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Query", value: "query" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["query"] }, options: [
        { label: "Execute query", value: "execute" },
      ] },
      { key: "query", label: "SQL query", type: "code", rows: 6, group: "parameters" },
    ],
  },
  {
    type: "mysql",
    label: "MySQL",
    category: "integration",
    subcategory: "Database & Storage",
    description: "Runs a query against a MySQL database.",
    icon: "mysql",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "MySQL connection",
    credentialType: "database",
    credentialFields: [
      { label: "Host", envVar: "MYSQL_HOST" },
      { label: "Port", envVar: "MYSQL_PORT" },
      { label: "Database name", envVar: "MYSQL_DB" },
      { label: "Username", envVar: "MYSQL_USER" },
      { label: "Password", envVar: "MYSQL_PASSWORD" },
    ],
    defaultConfig: { resource: "query", operation: "execute", query: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Query", value: "query" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["query"] }, options: [
        { label: "Execute query", value: "execute" },
      ] },
      { key: "query", label: "SQL query", type: "code", rows: 6, group: "parameters" },
    ],
  },
  {
    type: "discord",
    label: "Discord",
    category: "integration",
    subcategory: "Communication",
    description: "Sends a message to a Discord channel via a bot or webhook.",
    icon: "discord",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Discord bot",
    credentialType: "apiKey",
    credentialFields: [{ label: "Bot token", envVar: "DISCORD_BOT_TOKEN" }],
    defaultConfig: { resource: "message", operation: "send", channelId: "", message: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Message", value: "message" },
      ] },
      { key: "operation", label: "Operation", type: "select", group: "resource", options: [
        { label: "Send message", value: "send" },
      ] },
      { key: "channelId", label: "Channel ID", type: "text", placeholder: "1103…", group: "parameters" },
      { key: "message", label: "Message", type: "textarea", rows: 4, group: "parameters" },
    ],
  },
  {
    type: "stripe",
    label: "Stripe",
    category: "integration",
    subcategory: "Other",
    description: "Creates or looks up customers, charges, and invoices in Stripe.",
    icon: "stripe",
    iconKind: "brand",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Stripe account",
    credentialType: "apiKey",
    credentialFields: [{ label: "Secret key", envVar: "STRIPE_SECRET_KEY" }],
    defaultConfig: { resource: "customer", operation: "create", email: "", amount: "", currency: "usd" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "Customer", value: "customer" },
        { label: "Payment", value: "payment" },
        { label: "Invoice", value: "invoice" },
      ] },
      { key: "operation_customer", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["customer"] }, options: [
        { label: "Create", value: "create" },
        { label: "Retrieve", value: "retrieve" },
      ] },
      { key: "operation_payment", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["payment"] }, options: [
        { label: "Create payment intent", value: "create" },
      ] },
      { key: "operation_invoice", configKey: "operation", label: "Operation", type: "select", group: "resource", showWhen: { field: "resource", oneOf: ["invoice"] }, options: [
        { label: "Create", value: "create" },
        { label: "Send", value: "send" },
      ] },
      { key: "email", label: "Customer email", type: "text", placeholder: "customer@example.com", group: "parameters", showWhen: { field: "resource", oneOf: ["customer"] } },
      { key: "customerId", label: "Customer ID", type: "text", placeholder: "cus_…", group: "parameters", showWhen: { field: "resource", oneOf: ["payment", "invoice"] } },
      { key: "amount", label: "Amount (cents)", type: "number", placeholder: "2000", group: "parameters", showWhen: { field: "resource", oneOf: ["payment"] } },
      { key: "currency", label: "Currency", type: "text", placeholder: "usd", group: "parameters", showWhen: { field: "resource", oneOf: ["payment"] } },
    ],
  },
  {
    type: "twilio",
    label: "Twilio",
    category: "integration",
    subcategory: "Communication",
    description: "Sends an SMS or makes a voice call via Twilio.",
    icon: "phone",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "Twilio account",
    credentialType: "apiKey",
    credentialFields: [
      { label: "Account SID", envVar: "TWILIO_ACCOUNT_SID" },
      { label: "Auth token", envVar: "TWILIO_AUTH_TOKEN" },
      { label: "From number", envVar: "TWILIO_FROM_NUMBER" },
    ],
    defaultConfig: { resource: "sms", to: "", message: "" },
    configFields: [
      { key: "resource", label: "Resource", type: "select", group: "resource", options: [
        { label: "SMS", value: "sms" },
      ] },
      { key: "to", label: "To (phone number)", type: "text", placeholder: "+1...", group: "parameters" },
      { key: "message", label: "Message", type: "textarea", rows: 4, group: "parameters" },
    ],
  },
  {
    type: "openaiChat",
    label: "OpenAI",
    category: "ai",
    subcategory: "Other",
    description: "Calls the OpenAI Chat Completions API directly (no agent loop or tools).",
    icon: "sparkles",
    iconKind: "outline",
    inputs: [IN],
    outputs: [OUT],
    requiresCredentials: true,
    credentialLabel: "OpenAI API key",
    credentialType: "apiKey",
    credentialFields: [{ label: "API key", envVar: "OPENAI_API_KEY" }],
    defaultConfig: { model: "gpt-4.1", systemPrompt: "", prompt: "", temperature: "0.7" },
    configFields: [
      { key: "model", label: "Model", type: "select", group: "resource", options: [
        { label: "GPT-4.1", value: "gpt-4.1" },
        { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "o4-mini (reasoning)", value: "o4-mini" },
      ] },
      { key: "systemPrompt", label: "System prompt", type: "textarea", rows: 3, group: "parameters" },
      { key: "prompt", label: "Prompt", type: "textarea", rows: 4, group: "parameters", helpText: "Supports {{$json.field}} to insert data from the previous node." },
      { key: "temperature", label: "Temperature", type: "text", placeholder: "0.7", group: "advanced" },
    ],
  },
]; 

const customTypes = new Set(BASE_NODE_DEFINITIONS.map((definition) => definition.type));
const customLabels = new Set(BASE_NODE_DEFINITIONS.map((definition) => definition.label.toLowerCase()));
const mergedCatalog = [...CORE_NODE_CATALOG, ...FULL_NODE_CATALOG];
const seenCatalogTypes = new Set<string>();
const seenCatalogLabels = new Set<string>();
const deduplicatedCatalog = mergedCatalog.filter((definition) => {
  const label = definition.label.toLowerCase();
  if (customTypes.has(definition.type) || customLabels.has(label) || seenCatalogTypes.has(definition.type) || seenCatalogLabels.has(label)) return false;
  seenCatalogTypes.add(definition.type);
  seenCatalogLabels.add(label);
  return true;
});
export const NODE_DEFINITIONS: NodeTypeDefinition[] = [
  ...BASE_NODE_DEFINITIONS,
  ...deduplicatedCatalog,
];

const ACCEPTED_CREDENTIAL_TYPES: Record<string, string[]> = {
  apiKey: ["apiKey", "httpHeaderAuth"],
  oauth2: ["oauth2Api"],
  database: ["postgres", "mysql"],
  smtp: ["smtp"],
};

for (const definition of NODE_DEFINITIONS) {
  if (definition.credentialType && !definition.acceptedCredentialTypes) {
    definition.acceptedCredentialTypes = ACCEPTED_CREDENTIAL_TYPES[definition.credentialType] || [definition.credentialType];
  }
  if (!definition.groups) {
    definition.groups = definition.category === "trigger"
      ? ["Triggers"]
      : definition.category === "ai"
        ? ["AI & LangChain"]
        : definition.category === "integration"
          ? [definition.subcategory || "Other"]
          : ["Core"];
  }
}

export const NODE_DEFINITIONS_BY_TYPE: Record<string, NodeTypeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((d) => [d.type, d])
);

export const CATEGORY_LABELS: Record<NodeTypeDefinition["category"], string> = {
  trigger: "Triggers",
  core: "Core / Logic",
  ai: "AI & LLM",
  integration: "Integrations",
};

// Display order for the integration subcategories in the palette's left
// rail. Any integration node without a matching subcategory falls back to
// "Other" so nothing silently disappears if a new one is added without one.
export const INTEGRATION_SUBCATEGORY_ORDER = [
  "Communication",
  "Productivity & Docs",
  "Database & Storage",
  "Network & Web",
  "Other",
];
