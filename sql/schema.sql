-- ============================================
-- VORREX AGENTS — CORE SCHEMA (v2)
-- Run this in Supabase SQL Editor
-- ============================================

create extension if not exists "pgcrypto";

-- ============================================
-- OWNERS
-- ============================================
create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  name text,
  created_at timestamptz default now()
);

-- ============================================
-- CLIENTS
-- ============================================
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  key_hash text not null,              -- hashed special key (never store plaintext)
  key_prefix text not null,            -- first 8 chars shown for identification, e.g. VX-A8F3
  created_by uuid references owners(id) on delete set null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_clients_email on clients(email);
create index if not exists idx_clients_key_prefix on clients(key_prefix);

-- ============================================
-- WORKFLOWS
-- ============================================
create table if not exists workflows (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  name text not null,
  description text,
  workflow_json jsonb not null default '{}'::jsonb,
  n8n_workflow_id text,                -- id of the live workflow inside n8n, once deployed
  is_active boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_workflows_client_id on workflows(client_id);

-- ============================================
-- ENCRYPTED CREDENTIALS
-- ============================================
-- `data` is an AES-256-GCM envelope. Plaintext is only handled by the
-- server-only resolver and is never selected by browser-facing API routes.
create table if not exists credentials (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete cascade not null,
  credential_type text not null,
  node_type text,
  name text not null,
  data text not null,
  field_names text[] not null default '{}',
  created_by_type text not null check (created_by_type in ('owner','client')),
  created_by_id uuid not null,
  version integer not null default 1,
  rotated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_credentials_client_id on credentials(client_id);
create index if not exists idx_credentials_type on credentials(client_id, credential_type);
create index if not exists idx_credentials_node_type on credentials(client_id, node_type);

-- ============================================
-- AUDIT LOG
-- ============================================
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_type text not null check (actor_type in ('owner','client')),
  actor_id uuid not null,
  action text not null,                -- e.g. 'workflow.update', 'client.create'
  workflow_id uuid references workflows(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  details jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_audit_log_client_id on audit_log(client_id);
create index if not exists idx_audit_log_workflow_id on audit_log(workflow_id);

-- ============================================
-- EXECUTION LOG
-- ============================================
-- One row per workflow run (manual "Run" button or webhook trigger). Each
-- run stores per-node results as JSON rather than a normalized per-node
-- table — the node count and shape vary per workflow, so this keeps the
-- schema stable while lib/execution/runtime.ts evolves.
create table if not exists execution_log (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  trigger_type text not null check (trigger_type in ('manual','webhook')),
  status text not null check (status in ('success','error')),
  error text,
  node_results jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists idx_execution_log_workflow_id on execution_log(workflow_id);
create index if not exists idx_execution_log_client_id on execution_log(client_id);

alter table execution_log enable row level security;

drop policy if exists execution_log_select_own on execution_log;
create policy execution_log_select_own
on execution_log for select
using (client_id::text = auth.jwt() ->> 'client_id');

-- Inserts always go through supabaseAdmin (see app/api/workflows/[id]/run
-- and app/api/webhooks/[workflowId]) rather than a client-scoped insert
-- policy, since the webhook trigger route runs with no client session at
-- all — it looks the workflow up by id instead.

-- ============================================
-- AUTO-UPDATE updated_at
-- ============================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_workflows_updated_at on workflows;
create trigger trg_workflows_updated_at
before update on workflows
for each row
execute function set_updated_at();

drop trigger if exists trg_credentials_updated_at on credentials;
create trigger trg_credentials_updated_at
before update on credentials
for each row
execute function set_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table clients enable row level security;
alter table workflows enable row level security;
alter table credentials enable row level security;
alter table owners enable row level security;
alter table audit_log enable row level security;

-- Clients can read their own row only
drop policy if exists clients_select_own on clients;
create policy clients_select_own
on clients for select
using (id::text = auth.jwt() ->> 'client_id');

-- Workflows scoped strictly to the client_id in the JWT claim
drop policy if exists workflows_select_own on workflows;
create policy workflows_select_own
on workflows for select
using (client_id::text = auth.jwt() ->> 'client_id');

drop policy if exists workflows_insert_own on workflows;
create policy workflows_insert_own
on workflows for insert
with check (client_id::text = auth.jwt() ->> 'client_id');

drop policy if exists workflows_update_own on workflows;
create policy workflows_update_own
on workflows for update
using (client_id::text = auth.jwt() ->> 'client_id')
with check (client_id::text = auth.jwt() ->> 'client_id');

drop policy if exists workflows_delete_own on workflows;
create policy workflows_delete_own
on workflows for delete
using (client_id::text = auth.jwt() ->> 'client_id');

-- Credentials follow the same client_id claim boundary. Decryption is never
-- performed through these policies; only the server-side service role reads
-- the encrypted `data` column during execution.
drop policy if exists credentials_select_own on credentials;
create policy credentials_select_own on credentials for select
using (client_id::text = auth.jwt() ->> 'client_id');

drop policy if exists credentials_insert_own on credentials;
create policy credentials_insert_own on credentials for insert
with check (client_id::text = auth.jwt() ->> 'client_id');

drop policy if exists credentials_update_own on credentials;
create policy credentials_update_own on credentials for update
using (client_id::text = auth.jwt() ->> 'client_id')
with check (client_id::text = auth.jwt() ->> 'client_id');

drop policy if exists credentials_delete_own on credentials;
create policy credentials_delete_own on credentials for delete
using (client_id::text = auth.jwt() ->> 'client_id');

-- owners + audit_log: no public policies. All access goes through the
-- server-side service_role key (see lib/supabaseAdmin.ts), never exposed
-- to the browser. This is what gives the Owner full cross-client access
-- without needing complex RLS bypass logic.

-- ============================================
-- PREREQUISITE FOR CLIENT-SESSION RLS TO WORK AT ALL
-- ============================================
-- Client sessions authenticate to PostgREST with a custom JWT (see
-- lib/auth.ts), not Supabase Auth. For PostgREST to accept that token and
-- for `auth.jwt() ->> 'client_id'` above to resolve, the app's JWT_SECRET
-- env var MUST be set to the exact same value as this Supabase project's
-- JWT Secret (Project Settings -> API -> JWT Settings). If these two
-- secrets don't match, PostgREST silently treats every client-session
-- request as unauthenticated/anon, and inserts/selects that should be
-- allowed by the policies above fail instead.
