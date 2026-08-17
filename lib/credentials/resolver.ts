import { supabaseAdmin } from "../supabaseAdmin";
import { recordAudit } from "../observability";
import { decryptCredential, encryptCredential } from "./crypto";
import { getCredentialType, type CredentialMetadata, type CredentialResolutionContext, type CredentialTypeId } from "./types";

const OWNER_AUDIT_ID = "00000000-0000-0000-0000-000000000000";

function metadata(row: Record<string, unknown>): CredentialMetadata {
  return {
    id: String(row.id),
    client_id: row.client_id ? String(row.client_id) : undefined,
    credential_type: String(row.credential_type || row.node_type) as CredentialTypeId,
    node_type: row.node_type ? String(row.node_type) : null,
    name: String(row.name),
    field_names: Array.isArray(row.field_names) ? row.field_names.map(String) : [],
    created_at: String(row.created_at),
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    last_used_at: row.last_used_at ? String(row.last_used_at) : null,
    rotated_at: row.rotated_at ? String(row.rotated_at) : null,
    expires_at: row.expires_at ? String(row.expires_at) : null,
    version: row.version ? Number(row.version) : 1,
  };
}

function assertCredentialFields(credentialType: string, fields: Record<string, string>) {
  const definition = getCredentialType(credentialType);
  if (!definition) throw new Error(`Unsupported credential type: ${credentialType}`);
  if (Object.keys(fields).length === 0) throw new Error("Credential must contain at least one field.");
  for (const [key, value] of Object.entries(fields)) {
    if (!key || typeof value !== "string") throw new Error("Credential fields must be string values.");
  }
}

export class CredentialResolver {
  async list(clientId: string, credentialType?: string, nodeType?: string): Promise<CredentialMetadata[]> {
    let query = supabaseAdmin.from("credentials").select("id,client_id,credential_type,node_type,name,field_names,created_at,updated_at,last_used_at,rotated_at,expires_at,version").eq("client_id", clientId).order("created_at", { ascending: false });
    if (credentialType) query = query.eq("credential_type", credentialType);
    if (nodeType) query = query.or(`node_type.eq.${nodeType},node_type.is.null`);
    const { data, error } = await query;
    if (error) throw new Error(`Failed to list credentials: ${error.message}`);
    return (data || []).map((row) => metadata(row as Record<string, unknown>));
  }

  async create(input: { clientId: string; credentialType: string; nodeType?: string | null; name: string; fields: Record<string, string>; actorType: "owner" | "client"; actorId?: string | null }): Promise<CredentialMetadata> {
    if (!input.name.trim()) throw new Error("Credential name is required.");
    assertCredentialFields(input.credentialType, input.fields);
    const fieldNames = Object.keys(input.fields);
    const { data, error } = await supabaseAdmin.from("credentials").insert({ client_id: input.clientId, credential_type: input.credentialType, node_type: input.nodeType || null, name: input.name.trim(), data: encryptCredential(input.fields), field_names: fieldNames, created_by_type: input.actorType, created_by_id: input.actorId || OWNER_AUDIT_ID }).select("id,client_id,credential_type,node_type,name,field_names,created_at,updated_at,last_used_at,rotated_at,expires_at,version").single();
    if (error || !data) throw new Error(`Failed to store credential: ${error?.message || "unknown error"}`);
    await recordAudit({ actorType: input.actorType, actorId: input.actorId || OWNER_AUDIT_ID, action: "credential.create", clientId: input.clientId, details: { credential_type: input.credentialType, node_type: input.nodeType || null, name: input.name, field_names: fieldNames } });
    return metadata(data as Record<string, unknown>);
  }

  async resolve(context: CredentialResolutionContext): Promise<Record<string, string>> {
    const { data, error } = await supabaseAdmin.from("credentials").select("id,client_id,credential_type,node_type,data,expires_at").eq("id", context.credentialId).eq("client_id", context.clientId).single();
    if (error || !data) throw new Error("Credential not found or not available to this client.");
    if (data.node_type && context.nodeType && data.node_type !== context.nodeType) throw new Error("Credential is not valid for this node type.");
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) throw new Error("Credential has expired.");
    const fields = decryptCredential(String(data.data));
    void supabaseAdmin.from("credentials").update({ last_used_at: new Date().toISOString() }).eq("id", context.credentialId).eq("client_id", context.clientId);
    void recordAudit({ actorType: "client", actorId: context.clientId, action: "credential.resolve", clientId: context.clientId, details: { credential_id: context.credentialId, credential_type: data.credential_type, node_type: data.node_type, workflow_id: context.workflowId, run_id: context.runId } });
    return fields;
  }

  async rotate(input: { clientId: string; credentialId: string; fields: Record<string, string>; actorType: "owner" | "client"; actorId?: string | null; expiresAt?: string | null }): Promise<CredentialMetadata> {
    const { data: existing, error: readError } = await supabaseAdmin.from("credentials").select("id,credential_type,node_type,name,version").eq("id", input.credentialId).eq("client_id", input.clientId).single();
    if (readError || !existing) throw new Error("Credential not found.");
    assertCredentialFields(String(existing.credential_type), input.fields);
    const nextVersion = Number(existing.version || 1) + 1;
    const { data, error } = await supabaseAdmin.from("credentials").update({ data: encryptCredential(input.fields), field_names: Object.keys(input.fields), version: nextVersion, rotated_at: new Date().toISOString(), expires_at: input.expiresAt ?? null }).eq("id", input.credentialId).eq("client_id", input.clientId).select("id,client_id,credential_type,node_type,name,field_names,created_at,updated_at,last_used_at,rotated_at,expires_at,version").single();
    if (error || !data) throw new Error(`Failed to rotate credential: ${error?.message || "unknown error"}`);
    await recordAudit({ actorType: input.actorType, actorId: input.actorId || OWNER_AUDIT_ID, action: "credential.rotate", clientId: input.clientId, details: { credential_id: input.credentialId, credential_type: existing.credential_type, version: nextVersion } });
    return metadata(data as Record<string, unknown>);
  }

  async remove(input: { clientId: string; credentialId: string; actorType: "owner" | "client"; actorId?: string | null }): Promise<void> {
    const { data: existing } = await supabaseAdmin.from("credentials").select("credential_type,node_type,name").eq("id", input.credentialId).eq("client_id", input.clientId).single();
    const { error } = await supabaseAdmin.from("credentials").delete().eq("id", input.credentialId).eq("client_id", input.clientId);
    if (error) throw new Error(`Failed to delete credential: ${error.message}`);
    await recordAudit({ actorType: input.actorType, actorId: input.actorId || OWNER_AUDIT_ID, action: "credential.delete", clientId: input.clientId, details: existing || {} });
  }
}

export const credentialResolver = new CredentialResolver();
export { OWNER_AUDIT_ID };
