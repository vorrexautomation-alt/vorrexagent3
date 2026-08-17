# Phase 1 — Credential Management: Security Notes

## What changed

Before this phase, every integration secret (Slack bot token, Postgres
password, Gmail refresh token, etc.) lived in a process-wide environment
variable, shared by every client on the deployment. There was no
per-client isolation and no encryption story beyond whatever the hosting
provider does for env vars at rest.

This phase adds an encrypted, per-client credential store
(`credentials` table, `sql/002_credentials.sql`) alongside — not instead
of — the env var path. Nothing that already worked stops working; see
"Migration path" below.

## Env vars

| Var | Required by | Notes |
|---|---|---|
| `CREDENTIALS_ENCRYPTION_KEY` | `lib/credentials/crypto.ts`, on first encrypt/decrypt call | 32 bytes, hexadecimal. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. **Never reuse `JWT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY` here.** |
| All existing per-integration vars (`SLACK_BOT_TOKEN`, `POSTGRES_HOST`, etc.) | Every executor's fallback path | Now optional in the sense that a client can bypass them entirely by storing a real credential instead — but still the *only* path until at least one credential is stored for a given node type. |

`CREDENTIALS_ENCRYPTION_KEY` is read lazily (first use, not at module
load) and then **cached in memory for the life of the process** — see
`getKey()` in `lib/credentials/crypto.ts`. This matters for two things:

1. **Rotation is not just "change the env var and redeploy."** Every
   existing row's `data` column is ciphertext under the *old* key. Simply
   swapping the key makes every stored credential permanently
   undecryptable (the GCM auth tag check will fail closed — see
   "Failure modes"). A real rotation needs a script that: reads every
   row with the old key still active, decrypts, re-encrypts under the
   new key, writes back — then the env var can be swapped. This script
   does not exist yet; it's a Phase 6 (Hardening) follow-up, not
   something to attempt ad hoc in production.
2. Tests that need to exercise "wrong key" or "key missing" behavior
   within a single process must call `__resetCredentialKeyCacheForTests()`
   (exported from `lib/credentials/crypto.ts`, intentionally test-only) after
   mutating `process.env.CREDENTIALS_ENCRYPTION_KEY` — see
   `lib/__tests__/crypto.test.ts`.

## Threat model / security guarantees

- **Encryption at rest**: every credential's field values are encrypted
  with AES-256-GCM before the INSERT ever reaches Postgres. Supabase —
  and anyone with read access to the `credentials` table via the
  Supabase dashboard, a DB backup, or a misconfigured RLS policy — sees
  only ciphertext, never plaintext.
- **Authenticated encryption, fails closed**: GCM's auth tag means a
  single flipped bit anywhere in the envelope (ciphertext, tag, or a
  corrupted row) makes `decryptCredential()` throw, not return garbage
  that then gets silently sent to Slack/Postgres/etc. as a bad
  credential. Confirmed by test (`lib/__tests__/crypto.test.ts`,
  "tampering ... is detected").
- **Per-client isolation**: `resolveCredential(credentialId, clientId)`
  scopes the query by `client_id` *at the database level*
  (`.eq("client_id", clientId)`), not just checked after the fact in
  application code. A workflow belonging to client A can never resolve a
  credential row belonging to client B, even if a bug elsewhere caused a
  foreign credential id to reach this call — the row simply won't be
  found (see "Failure modes").
- **RLS as defense-in-depth, not the only layer**: `credentials` has RLS
  policies mirroring `workflows` (`sql/002_credentials.sql`), so even a
  client-scoped Supabase query can only ever see its own rows. But the
  actual secret-bearing value (`data`) is unreadable ciphertext even to
  someone who *did* get past RLS (e.g. via the service_role key) without
  also having `CREDENTIALS_ENCRYPTION_KEY` — two independent things have
  to be compromised together, not just one.
- **Decryption is always server-only**: `lib/credentials/resolver.ts and lib/credentials.ts` always uses
  `supabaseAdmin` (service_role), and `CREDENTIALS_ENCRYPTION_KEY` is a
  server-only env var (never `NEXT_PUBLIC_*`). The plaintext secret value
  exists in memory only for the duration of a single `resolveCredential`
  call inside a running executor — it is never sent to the browser, never
  written into `workflow_json` (only the credential's opaque UUID is,
  via `node.config.__credential`), and never logged.
- **Audit trail**: every resolve, create, and delete writes an
  `audit_log` row (`credential.resolve` / `credential.create` /
  `credential.delete`). `credential.resolve` is the one that matters for
  incident response — it's the only durable record of *when a secret was
  actually decrypted and used*, independent of what the workflow itself
  logged in `execution_log`. This write is deliberately fire-and-forget
  (a logging failure must never block a workflow run) but is not silent —
  failures are `console.error`'d for operational visibility.
- **Encrypted rotation path**: Credentials support an authenticated PATCH rotation endpoint. The resolver
re-encrypts the complete field map, increments the version, records rotated_at,
and writes a credential.rotate audit event without returning plaintext to the
browser.

## What this phase does *not* cover

- **Bulk key rotation tooling** — changing the encryption key still requires an application-side decrypt/re-encrypt migration before retiring the old key.
- **OAuth "Connect account" flows** — `credentialType: "oauth2"` nodes
  (Slack, Gmail, Google Sheets) still expect a long-lived token/refresh
  token to be pasted in, same as the env var path did. A real OAuth
  authorization-code flow (redirect → consent → token exchange) is a
  separate, larger feature.
- **Secret scanning / accidental exposure in `workflow_json`** — the
  `code` node still runs arbitrary JS in-process (Phase 0 audit, Pillar
  3) and *could* read `process.env` directly, bypassing the credential
  store entirely for whoever wrote that code node. This phase doesn't
  change the code node's trust level — see Phase 2 (Sandboxing) for that.
- **Per-field encryption** — the whole field map for one credential is
  one envelope, not one envelope per field. Fine for this use case
  (fields of one credential are always used together), but means you
  can't rotate one field (e.g. just the password) without re-encrypting
  the whole credential.

## Failure modes (what happens when things go wrong)

| Situation | What happens |
|---|---|
| `CREDENTIALS_ENCRYPTION_KEY` unset | Any encrypt/decrypt throws immediately. There is no silent fallback to plaintext. |
| `CREDENTIALS_ENCRYPTION_KEY` malformed | Throws at first use unless it is exactly 64 hexadecimal characters (32 bytes). |
| Stored credential decrypted under the wrong key (e.g. key was rotated without re-encrypting) | `decryptCredential` throws a generic "could not be decrypted" error — deliberately generic, doesn't leak whether the problem was the key, corruption, or tampering, since that distinction isn't useful to an attacker-adjacent error message. The workflow run fails with that node in `error` status; nothing partial or corrupted is returned. |
| Credential row deleted while a `__credential` reference to it still exists in a saved workflow | `resolveCredential` returns "Credential not found ..." — the executor throws, the run fails at that node. The ConfigPanel's picker also surface this in the UI (a workflow open in the builder that references a deleted credential id shows a warning under the dropdown). |
| Credential belongs to a different `client_id` than the running workflow | Same as "not found" above — the query-level `client_id` scoping means a cross-tenant reference (however it got there) can't be distinguished from "doesn't exist," which is the safe default. |
| Stored credential is missing a field the node needs (e.g. created before a node type added a new required field) | `resolveNodeCredential` checks the resolved field map against the executor's required env names and throws listing exactly which are missing, before ever making an outbound request with a partial credential. |
| `audit_log` insert fails (e.g. Supabase is briefly unavailable) during `credential.resolve` | Does not fail the workflow run — logged via `console.error` only. (`credential.create` / `credential.delete` audit writes are *not* fire-and-forget in the same way, since those happen outside a time-sensitive execution path and a failure there is worth surfacing to the caller.) |
| A node's `__credential` is `"env"`, `"none"`, or simply absent (default state for every workflow created before this phase) | Falls back to `process.env`, exactly the pre-Phase-1 behavior — including the same "Missing required environment variable(s): ..." error if unset. |

## Migration path for existing deployments

No action required to keep working. Every workflow saved before this
phase has no `__credential` key in any node's config, which
`resolveNodeCredential` treats the same as `"env"` — the legacy env var
path. Migrating a specific workflow's specific node to a stored
credential is opt-in, done from that node's Credentials panel in the
builder ("+ Add new credential…").

There is intentionally no bulk-migration script that reads existing env
vars and auto-creates credential rows from them — doing that safely
would require knowing which `client_id` each legacy env var "belongs" to
in a multi-tenant deployment, and today's env vars are process-wide with
no such mapping to infer it from.
