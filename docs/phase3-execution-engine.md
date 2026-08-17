# Phase 3 — Execution Engine & Scheduler: Notes

## What changed

Two things happened in this phase, and they're separable:

1. **The graph walk itself got fixed**, in `lib/execution/runtime.ts` (the
   existing synchronous "debug" path — `/run`, and the webhook receiver —
   both still call `runWorkflow()` with the exact same signature as
   before; neither route needed to change). This is a correctness fix
   that applies whether or not you ever touch the new queue.
2. **A new, separate durable/async path was added** (`lib/queue/`):
   `POST /api/workflows/[id]/runs` enqueues a run, a BullMQ worker
   (`lib/queue/worker.ts`) executes it, `GET .../runs/[runId]` polls
   status and per-node results.

## Part 1: the graph walk fix (tested, verifiable right now)

The old runtime walked the graph breadth-first with no join/barrier
step: a "merge" node with two upstream branches ran once per branch that
happened to arrive, instead of waiting for both. Flagged explicitly in
the Phase 0 audit as the sharpest correctness gap in pillar 2.

**The fix**: `lib/execution/planner.ts` (pure graph indexing) +
`lib/execution/joinResolver.ts` (a small state machine — see its own
extensive comment for the full reasoning) replace the walk. The key
insight the fix depends on: a downstream join node can have an incoming
edge from a branch that will *never* fire (the other side of an `If`).
Waiting for literally every wired edge to carry data would deadlock.
`JoinResolver` fixes this with a skip signal that propagates through the
graph exactly like data does — a node that receives all-skips is itself
skipped, and that skip propagates further downstream — so a join node
only ever waits for branches that are actually reachable in that
specific run.

This is **fully tested and passing**, with zero external dependencies:

- `lib/execution/__tests__/joinResolver.test.ts` — 5 tests against the
  pure resolver logic directly: linear chains, a real diamond join
  (proves a two-branch merge waits for both), an If→Merge graph (proves
  the untaken branch doesn't block the merge), a node erroring
  propagating a skip, and a "both branches into a join skipped" cascade
  that should itself skip everything further downstream.
- `lib/execution/__tests__/runtime.test.ts` — 4 tests against the real
  `runWorkflow()` with actual registered executors (not mocks): the
  If→Merge scenario end-to-end, `continueOnFail` letting independent
  branches keep going, `retryOnFail` actually retrying (this test caught
  a real bug — see below), and the no-trigger-found error path.

Run both with `npx tsx --test lib/execution/__tests__/`.

**A bug the tests caught, worth mentioning because it's exactly the kind
of thing tests are for**: the first version of `readNodeSettings` used
`Number(raw.waitBetweenTries) || 5` to fall back to a 5-second default.
That's wrong for an intentionally-configured `0` (retry immediately) —
`0 || 5` evaluates to `5`, silently overriding the user's explicit
choice. The `retryOnFail` test took 10 seconds to pass on the first run
(3 retries × the wrongly-defaulted 5s wait) instead of milliseconds,
which is what caught it. Fixed with an explicit `Number.isFinite` check
instead of a truthiness fallback.

**Two other real behavior changes** (both intentional, both new):

- **Per-node retry and continue-on-fail are now honored.**
  `ConfigPanel.tsx`'s "Error handling" tab (`continueOnFail`,
  `retryOnFail`, `maxTries`, `waitBetweenTries`) already existed in the
  UI but the old runtime silently ignored all of it — every node
  effectively behaved as `continueOnFail: false, retryOnFail: false`
  regardless of what was configured. `lib/execution/nodeStep.ts` now
  actually reads and applies it, shared identically by both the debug
  path and the durable worker.
- **Nodes in the same "wave" of readiness now run concurrently**
  (`Promise.all`), not strictly one at a time. Two independent branches
  no longer serialize behind each other for no reason. Join barriers
  (waiting for *all* of a join node's branches before it's even part of
  a wave) are still enforced — that's `JoinResolver`'s job, unaffected
  by within-wave concurrency.

**The `merge` node's behavior changed too**, in the way the original
"documented limitation" comment said it should: it now receives an
array of every branch that actually fired (not invoked once per branch)
and flattens them together. A single-input merge (only one edge wired
to it) behaves exactly as before — this only changes behavior for a
merge node that genuinely has two or more incoming edges.

## Part 2: the durable queue-backed engine (code complete, NOT verified end-to-end)

**Read this before deploying it.** This sandbox has no network access
and no Redis instance, so `lib/queue/` (BullMQ + ioredis) could not be
installed or run against a real queue here — unlike Part 1 above, which
is fully tested. What follows is what the code is designed to do, not a
confirmed "it works."

### Architecture

```
POST /api/workflows/[id]/runs          -> enqueueRun() (lib/queue/queue.ts)
  creates a `workflow_runs` row (status: queued)
  adds a BullMQ job {runId} to the "workflow-runs" queue

lib/queue/worker.ts (a separate long-running process — see startWorker.ts)
  pulls the job, loads the workflow + run
  runs the SAME planner.ts / joinResolver.ts / nodeStep.ts as runtime.ts
  persists workflow_run_nodes rows as it goes (running -> success/error)
  checks for cancellation + a max-run-duration timeout between "waves"

GET /api/workflows/[id]/runs/[runId]   -> polls workflow_runs + workflow_run_nodes
POST .../runs/[runId]/cancel           -> flips status to "cancelling"
```

### Deliberate scope decision: one BullMQ job = one whole run

The target architecture's language ("worker queue pattern," "job
enqueue layer," "durable execution state... retries") could be read as
calling for per-*node* BullMQ jobs, where the next wave is computed by
reconstructing `JoinResolver` state from `workflow_run_nodes` on every
single node completion — that's a real, more sophisticated design that
survives a worker process crashing mid-run without losing progress
(the next available worker just picks up the next ready node).

This phase does **not** build that. Instead, one BullMQ job runs an
entire workflow to completion inside one worker process's memory
(the `JoinResolver` instance lives for the job's duration, same as
`runtime.ts`), while still persisting per-node state to Postgres
continuously as it goes. Why:

- It reuses the exact same in-memory wave loop as the already-tested
  debug path, instead of a second, harder-to-verify implementation of
  the same join logic driven by database reads.
- **Job-level retry is deliberately OFF** (`attempts: 1` in
  `queue.ts`). If BullMQ retried a failed job, it would re-run the
  *entire* workflow from its trigger — re-executing nodes that already
  succeeded and had real side effects (an already-sent Slack message, an
  already-inserted Postgres row). Per-node retry already exists
  (`nodeStep.ts`, shared with the debug path) and is the right layer for
  "this specific step failed transiently, try it again" — a whole-job
  retry is not a safe substitute for that.
- If the worker process crashes mid-run, the run is left in
  `status: 'running'` with real partial visibility (whatever nodes
  completed are genuinely in `workflow_run_nodes`, not lost) — but
  nothing automatically resumes it. It needs to be re-enqueued from
  scratch (a new run), which — see the point above — is exactly why job
  retry being on-by-default would already be being unsafe with side
  effects, so this isn't a regression the "safer" per-node-job design
  would avoid for free; that design would still need to reason carefully
  about "was this node's real-world side effect actually completed
  before the crash," which is a hard problem this phase didn't try to
  solve. The schema (`workflow_run_nodes`) is already shaped to support
  building that resume logic on top later, deliberately, rather than
  rushed in now.

### Cancellation and timeouts

Cancellation is **cooperative**, checked once between each wave of
concurrent node executions — an in-flight `await fetch(...)` inside a
currently-running node cannot be aborted from outside it. Requesting a
cancel takes effect as soon as the current wave finishes, not instantly.
A run still `queued` (worker hasn't picked it up yet) is caught by the
same mechanism the moment the worker does start processing it.

A run-level timeout (`DEFAULT_MAX_RUN_DURATION_MS`, 15 minutes,
overridable via `workflow_json.settings.maxRunDurationMs`) is checked
the same way — independent of Phase 2's per-code-node timeout and the
existing per-node Wait cap, this bounds the *whole run*.

### Env vars

| Var | Required by | Notes |
|---|---|---|
| `REDIS_URL` | `lib/queue/connection.ts`, lazily on first use | `redis://` or `rediss://` (TLS). The debug path (`/run`, webhooks) does not need this. |
| `WORKER_CONCURRENCY` | `lib/queue/startWorker.ts` | Default 4. How many runs one worker process works on at once — each run can itself burst into many concurrent node executions within a wave, so this is runs-in-flight, not a hard cap on total work. |

### Deploying the worker

`lib/queue/startWorker.ts` must run as its **own long-lived process**,
separate from the Next.js app — a Next.js API route is request-scoped
and torn down between requests, so it can't stay alive polling Redis.
Concretely: a separate Railway/Render/Fly "worker" service, a second
Dockerfile `CMD`, or a PM2 process, running `npm run worker`, with the
same `REDIS_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, and `CREDENTIAL_ENCRYPTION_KEY` as the main
app (the worker resolves stored credentials the exact same way the
debug path does).

## Failure modes

| Situation | What happens |
|---|---|
| `REDIS_URL` unset, someone calls `POST /api/workflows/[id]/runs` | `enqueueRun()` throws a clear "REDIS_URL is not set" error before ever touching Postgres or the queue — no orphaned run row. |
| Postgres insert into `workflow_runs` succeeds but the BullMQ `queue.add()` call fails (Redis briefly down) | The run row exists with `status: 'queued'` but no job will ever process it — deliberately not rolled back (see `queue.ts`'s comment). This is a real gap: nothing currently detects and flags a run stuck in `queued`. A background reconciliation check for this is real Phase 6 (Observability) work, not solved here. |
| Worker process crashes mid-run | Run stays `status: 'running'` forever (no automatic timeout marks it failed from outside — the *worker's own* mid-run timeout check can't run if the worker itself is dead). `workflow_run_nodes` shows exactly which nodes completed before the crash. Needs manual intervention (or, again, Phase 6 monitoring) to notice and requeue. |
| A node fails without `continueOnFail` | Same as the debug path: the run stops, `workflow_runs.status` becomes `error` with that node's error message. Nodes already in flight in the same wave still finish and get their results persisted; nothing past that wave starts. |
| Cancellation requested while a wave is mid-flight | The in-flight nodes finish normally (their results are persisted), then the *next* wave check sees `cancelling` and settles to `cancelled` instead of starting more work — no half-updated node rows. |
| `workflow_run_nodes` upsert fails (e.g. transient Postgres hiccup) | Logged via `console.error`, does not fail the actual workflow run — same "logging must never block execution" principle as `credential.resolve` audit logging in Phase 1. |
| Someone runs the SQL migration but never sets `REDIS_URL` or starts a worker | `POST /api/workflows/[id]/runs` fails cleanly (see the `REDIS_URL unset` row above); every other existing endpoint (`/run`, webhooks, credentials, everything from Phases 1–2) is completely unaffected — this phase adds new capability, it doesn't gate anything that already worked. |

## What's explicitly deferred

- **Per-node BullMQ jobs / true crash-resume** — see the scope decision
  above.
- **Automatic detection of orphaned `queued`/`running` runs** — Phase 6
  territory.
- **Webhook and polling triggers enqueuing durable runs instead of
  running synchronously** — the webhook receiver
  (`app/api/webhooks/[workflowId]`) still calls the synchronous debug
  path, unchanged. Wiring high-throughput webhook delivery to the
  durable engine instead is Phase 4's job, not this one's — this phase
  only had to keep the existing webhook endpoint working, which it does.
