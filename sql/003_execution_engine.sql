-- ============================================
-- VORREX AGENTS — PHASE 3: EXECUTION ENGINE & SCHEDULER
-- Run this in Supabase SQL Editor AFTER sql/002_credentials.sql.
-- ============================================
--
-- Design notes:
--
-- * `workflow_runs` is the durable counterpart to the synchronous
--   /run endpoint's fire-and-forget `execution_log` insert (see
--   schema.sql). A run created via the queue (lib/queue/queue.ts)
--   exists here from the moment it's enqueued (status 'queued'), not
--   only after it finishes — so "is my workflow still running" is a
--   real question this table can answer, which execution_log never
--   could (it's write-once, on completion only).
--
-- * `workflow_run_nodes` is one row per node PER RUN, updated as the
--   run progresses (queued -> running -> success/error/skipped) rather
--   than written once at the end. This is what "durable execution
--   state" in the target architecture doc means concretely: if the
--   worker process dies mid-run, this table still shows exactly which
--   nodes had already completed and with what output, instead of the
--   whole run's progress being lost with the crashed process's memory.
--
-- * `execution_log` (schema.sql) is NOT replaced by this. The
--   synchronous debug path (/run, and the webhook receiver) still
--   writes one summary row to execution_log on completion, unchanged —
--   see the Phase 3 notes doc for why keeping two separate "here's what
--   happened" records for two different execution paths is intentional
--   rather than something to immediately unify.
--
-- * No RLS-bypassing "cancel any run" policy for clients — cancellation
--   requests go through the API route (app/api/workflows/[id]/runs/
--   [runId]/cancel), which uses supabaseAdmin after verifying the
--   caller's session already scopes them to that run's client_id. RLS
--   below still covers direct reads.

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references workflows(id) on delete cascade not null,
  client_id uuid references clients(id) on delete cascade not null,
  trigger_type text not null,                 -- 'manual' | 'webhook' | 'schedule' | 'chat' | 'form'
  trigger_data jsonb,
  status text not null default 'queued'        -- 'queued' | 'running' | 'success' | 'error' | 'cancelling' | 'cancelled'
    check (status in ('queued', 'running', 'success', 'error', 'cancelling', 'cancelled')),
  error text,
  queued_at timestamptz default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists idx_workflow_runs_workflow_id on workflow_runs(workflow_id, queued_at desc);
create index if not exists idx_workflow_runs_client_id on workflow_runs(client_id, queued_at desc);
-- Used by the worker to find runs stuck past their max duration —
-- see the "orphaned run" failure mode in the Phase 3 notes doc.
create index if not exists idx_workflow_runs_running on workflow_runs(status, started_at) where status = 'running';

alter table workflow_runs enable row level security;

drop policy if exists workflow_runs_select_own on workflow_runs;
create policy workflow_runs_select_own
on workflow_runs for select
using (client_id::text = auth.jwt() ->> 'client_id');

-- No client-side insert/update policy: runs are only ever created and
-- transitioned by server code (lib/queue/queue.ts, lib/queue/worker.ts)
-- via supabaseAdmin, which bypasses RLS entirely — same pattern as
-- execution_log in schema.sql.

create table if not exists workflow_run_nodes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references workflow_runs(id) on delete cascade not null,
  node_id text not null,          -- matches WorkflowNode.id from workflow_json, not a DB foreign key (nodes aren't their own table)
  node_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'success', 'error', 'skipped')),
  attempt int not null default 0,  -- how many attempts have been made so far (retryOnFail's maxTries)
  input jsonb,
  output jsonb,
  error text,
  started_at timestamptz,
  finished_at timestamptz,

  unique (run_id, node_id)
);

create index if not exists idx_workflow_run_nodes_run_id on workflow_run_nodes(run_id);

alter table workflow_run_nodes enable row level security;

drop policy if exists workflow_run_nodes_select_own on workflow_run_nodes;
create policy workflow_run_nodes_select_own
on workflow_run_nodes for select
using (
  run_id in (select id from workflow_runs where client_id::text = auth.jwt() ->> 'client_id')
);

-- ============================================
-- AUDIT LOG ACTIONS (no schema change — see credentials migration for
-- the same pattern)
-- ============================================
-- Phase 3 adds:
--   'run.enqueue'  — a run was added to the queue (details: {workflow_id, trigger_type})
--   'run.cancel'   — a run was cancelled by a user action (details: {run_id})
--   (Per-node results are NOT audit-logged individually — that's what
--   workflow_run_nodes is for. audit_log stays for user-initiated
--   actions and security-relevant events, not routine execution data.)
