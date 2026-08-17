-- VORREX AGENTS — ENCRYPTED CREDENTIALS MIGRATION
-- Apply after sql/schema.sql. Safe for installations that already have the
-- previous Phase 1 credentials table.

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

alter table credentials add column if not exists credential_type text;
alter table credentials add column if not exists node_type text;
alter table credentials add column if not exists version integer not null default 1;
alter table credentials add column if not exists rotated_at timestamptz;
alter table credentials add column if not exists expires_at timestamptz;
alter table credentials add column if not exists updated_at timestamptz not null default now();

update credentials set credential_type = coalesce(credential_type, node_type, 'apiKey') where credential_type is null;
update credentials set node_type = coalesce(node_type, credential_type) where node_type is null;
alter table credentials alter column credential_type set not null;

create index if not exists idx_credentials_client_id on credentials(client_id);
create index if not exists idx_credentials_type on credentials(client_id, credential_type);
create index if not exists idx_credentials_node_type on credentials(client_id, node_type);

alter table credentials enable row level security;
drop policy if exists credentials_select_own on credentials;
create policy credentials_select_own on credentials for select using (client_id::text = auth.jwt() ->> 'client_id');
drop policy if exists credentials_insert_own on credentials;
create policy credentials_insert_own on credentials for insert with check (client_id::text = auth.jwt() ->> 'client_id');
drop policy if exists credentials_update_own on credentials;
create policy credentials_update_own on credentials for update using (client_id::text = auth.jwt() ->> 'client_id') with check (client_id::text = auth.jwt() ->> 'client_id');
drop policy if exists credentials_delete_own on credentials;
create policy credentials_delete_own on credentials for delete using (client_id::text = auth.jwt() ->> 'client_id');

-- Existing rows encrypted with CREDENTIAL_ENCRYPTION_KEY must be re-encrypted
-- under CREDENTIALS_ENCRYPTION_KEY by an application-side migration. SQL must
-- never receive either plaintext or encryption key.
