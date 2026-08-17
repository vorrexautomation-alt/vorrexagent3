import { credentialResolver, OWNER_AUDIT_ID } from "./credentials/resolver";
import { decryptCredential, encryptCredential } from "./credentials/crypto";
import type { CredentialMetadata } from "./credentials/types";

export type { CredentialMetadata } from "./credentials/types";
export { decryptCredential, encryptCredential } from "./credentials/crypto";

export async function listCredentials(clientId: string, nodeType?: string): Promise<CredentialMetadata[]> {
  return credentialResolver.list(clientId, undefined, nodeType);
}

export async function createCredential(params: {
  clientId: string;
  nodeType: string;
  name: string;
  fields: Record<string, string>;
  createdByType: "owner" | "client";
  createdById: string;
}): Promise<CredentialMetadata> {
  return credentialResolver.create({
    clientId: params.clientId,
    credentialType: params.nodeType,
    nodeType: params.nodeType,
    name: params.name,
    fields: params.fields,
    actorType: params.createdByType,
    actorId: params.createdById,
  });
}

export async function resolveCredential(credentialId: string, clientId: string, runContext?: { workflowId?: string; runId?: string; nodeType?: string }): Promise<Record<string, string>> {
  return credentialResolver.resolve({ credentialId, clientId, workflowId: runContext?.workflowId, runId: runContext?.runId, nodeType: runContext?.nodeType });
}

export async function deleteCredential(params: { clientId: string; credentialId: string; deletedByType: "owner" | "client"; deletedById: string }): Promise<void> {
  return credentialResolver.remove({ clientId: params.clientId, credentialId: params.credentialId, actorType: params.deletedByType, actorId: params.deletedById });
}

export async function rotateCredential(params: { clientId: string; credentialId: string; fields: Record<string, string>; rotatedByType: "owner" | "client"; rotatedById: string; expiresAt?: string | null }): Promise<CredentialMetadata> {
  return credentialResolver.rotate({ clientId: params.clientId, credentialId: params.credentialId, fields: params.fields, actorType: params.rotatedByType, actorId: params.rotatedById, expiresAt: params.expiresAt });
}

export { OWNER_AUDIT_ID };
