export type CredentialTypeId =
  | "httpHeaderAuth"
  | "apiKey"
  | "openAiApi"
  | "anthropicApi"
  | "googleApi"
  | "oauth2Api"
  | "smtp"
  | "postgres"
  | "mysql"
  | "slackApi"
  | "telegramApi"
  | "notionApi"
  | "airtableApi"
  | "discordApi"
  | "stripeApi"
  | "twilioApi"
  | "whatsappBusinessApi";

export interface CredentialFieldDefinition {
  name: string;
  label: string;
  type: "string" | "password" | "url" | "number";
  required?: boolean;
  description?: string;
}

export interface CredentialTypeDefinition {
  id: CredentialTypeId;
  displayName: string;
  fields: CredentialFieldDefinition[];
}

export interface CredentialMetadata {
  id: string;
  client_id?: string;
  credential_type: CredentialTypeId;
  node_type?: string | null;
  name: string;
  field_names: string[];
  created_at: string;
  updated_at?: string;
  last_used_at: string | null;
  rotated_at?: string | null;
  expires_at?: string | null;
  version?: number;
}

export interface CredentialResolutionContext {
  credentialId: string;
  clientId: string;
  nodeType?: string;
  workflowId?: string;
  runId?: string;
}

export const CREDENTIAL_TYPES: Record<CredentialTypeId, CredentialTypeDefinition> = {
  httpHeaderAuth: { id: "httpHeaderAuth", displayName: "HTTP Header Auth", fields: [{ name: "headerName", label: "Header name", type: "string", required: true }, { name: "headerValue", label: "Header value", type: "password", required: true }] },
  apiKey: { id: "apiKey", displayName: "API Key", fields: [{ name: "apiKey", label: "API key", type: "password", required: true }] },
  openAiApi: { id: "openAiApi", displayName: "OpenAI API", fields: [{ name: "apiKey", label: "API key", type: "password", required: true }, { name: "organization", label: "Organization", type: "string" }] },
  anthropicApi: { id: "anthropicApi", displayName: "Anthropic API", fields: [{ name: "apiKey", label: "API key", type: "password", required: true }] },
  googleApi: { id: "googleApi", displayName: "Google API", fields: [{ name: "apiKey", label: "API key", type: "password", required: true }] },
  oauth2Api: { id: "oauth2Api", displayName: "OAuth2 API", fields: [{ name: "accessToken", label: "Access token", type: "password", required: true }, { name: "refreshToken", label: "Refresh token", type: "password" }, { name: "clientId", label: "Client ID", type: "string" }, { name: "clientSecret", label: "Client secret", type: "password" }] },
  smtp: { id: "smtp", displayName: "SMTP", fields: [{ name: "host", label: "Host", type: "string", required: true }, { name: "port", label: "Port", type: "number" }, { name: "user", label: "Username", type: "string" }, { name: "password", label: "Password", type: "password" }, { name: "from", label: "From address", type: "string" }] },
  postgres: { id: "postgres", displayName: "Postgres", fields: [{ name: "host", label: "Host", type: "string", required: true }, { name: "port", label: "Port", type: "number" }, { name: "database", label: "Database", type: "string", required: true }, { name: "user", label: "User", type: "string", required: true }, { name: "password", label: "Password", type: "password", required: true }] },
  mysql: { id: "mysql", displayName: "MySQL", fields: [{ name: "host", label: "Host", type: "string", required: true }, { name: "port", label: "Port", type: "number" }, { name: "database", label: "Database", type: "string", required: true }, { name: "user", label: "User", type: "string", required: true }, { name: "password", label: "Password", type: "password", required: true }] },
  slackApi: { id: "slackApi", displayName: "Slack", fields: [{ name: "token", label: "Bot token", type: "password", required: true }] },
  telegramApi: { id: "telegramApi", displayName: "Telegram", fields: [{ name: "token", label: "Bot token", type: "password", required: true }] },
  notionApi: { id: "notionApi", displayName: "Notion", fields: [{ name: "apiKey", label: "Integration token", type: "password", required: true }] },
  airtableApi: { id: "airtableApi", displayName: "Airtable", fields: [{ name: "apiKey", label: "Personal access token", type: "password", required: true }] },
  discordApi: { id: "discordApi", displayName: "Discord", fields: [{ name: "token", label: "Bot token", type: "password", required: true }] },
  stripeApi: { id: "stripeApi", displayName: "Stripe", fields: [{ name: "apiKey", label: "Secret key", type: "password", required: true }] },
  twilioApi: { id: "twilioApi", displayName: "Twilio", fields: [{ name: "accountSid", label: "Account SID", type: "string", required: true }, { name: "authToken", label: "Auth token", type: "password", required: true }] },
  whatsappBusinessApi: { id: "whatsappBusinessApi", displayName: "WhatsApp Business API", fields: [{ name: "accessToken", label: "Access token", type: "password", required: true }, { name: "phoneNumberId", label: "Phone number ID", type: "string", required: true }, { name: "businessAccountId", label: "Business account ID", type: "string" }, { name: "apiVersion", label: "Graph API version", type: "string" }] },
};

export function getCredentialType(id: string): CredentialTypeDefinition | undefined {
  return CREDENTIAL_TYPES[id as CredentialTypeId];
}
