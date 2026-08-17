-- VORREX AGENTS — PHASES 4–6
-- Apply after sql/003_execution_engine.sql.

create table if not exists webhook_routes (
  id uuid primary key default gen_random_uuid(),
  path text unique not null,
  workflow_id uuid references workflows(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  trigger_type text not null default 'webhook',
  secret_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  last_delivery_at timestamptz
);
create index if not exists idx_webhook_routes_workflow on webhook_routes(workflow_id);
create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  route_id uuid references webhook_routes(id) on delete cascade not null,
  delivery_id text unique not null,
  status text not null default 'received' check (status in ('received','accepted','rejected','failed','replayed')),
  payload jsonb,
  headers jsonb,
  run_id uuid references workflow_runs(id) on delete set null,
  error text,
  accepted_at timestamptz,
  replayed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_webhook_deliveries_route on webhook_deliveries(route_id, created_at desc);
create table if not exists polling_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  url text not null,
  method text not null default 'GET',
  headers jsonb not null default '{}'::jsonb,
  interval_ms integer not null default 60000 check (interval_ms >= 5000),
  timeout_ms integer not null default 10000 check (timeout_ms between 1000 and 30000),
  enabled boolean not null default true,
  next_run_at timestamptz,
  last_scheduled_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  failure_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_polling_due on polling_triggers(enabled, next_run_at);
create table if not exists execution_node_logs (
  id bigint generated always as identity primary key,
  run_id uuid references workflow_runs(id) on delete cascade,
  workflow_id uuid,
  client_id uuid,
  node_id text not null,
  node_type text not null,
  status text not null,
  attempt integer not null default 0,
  input jsonb,
  output jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_execution_node_logs_run on execution_node_logs(run_id, created_at);
create table if not exists system_metrics (
  id bigint generated always as identity primary key,
  name text not null,
  value numeric not null,
  labels jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_system_metrics_name_time on system_metrics(name, created_at desc);

alter table credentials add column if not exists version integer not null default 1;
alter table credentials add column if not exists rotated_at timestamptz;
alter table credentials add column if not exists expires_at timestamptz;

create or replace function increment_polling_failure(trigger_id uuid, failure_message text)
returns void language sql security definer as $$
  update polling_triggers set failure_count = failure_count + 1, last_error = failure_message where id = trigger_id;
$$;
