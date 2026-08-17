# Vorrex Agents — Phase 4–6 Delivery

## Implemented

The project now includes a path-based webhook gateway backed by `webhook_routes` and `webhook_deliveries`. Requests are rate-limited, verified using a per-route secret hash or optional HMAC, deduplicated by delivery ID, durably logged, and enqueued into BullMQ. The original `/api/webhooks/[workflowId]` endpoint remains available as a compatibility route. Delivery records can be replayed through `replayWebhookDelivery`.

Polling triggers are stored in `polling_triggers`. `materializePollingJobs` converts due rows into BullMQ jobs, and `executePollingJob` performs bounded HTTP polling before enqueueing a workflow run. Start the trigger process with `npm run triggers`; run it as a separate long-lived process alongside `npm run worker`.

Canvas node data now accepts `idle`, `running`, `success`, `error`, and `waiting` statuses. The renderer shows status color, text, and a live dot without changing persisted workflow JSON. Configuration rendering supports an optional JSON Schema declaration on `NodeTypeDefinition`; legacy `configFields` remain supported and continue to handle custom controls and credentials.

Hardening includes structured JSON logs, durable per-node logs in `execution_node_logs`, metrics storage in `system_metrics`, auth and webhook rate limiting, credential access auditing, and credential rotation metadata plus a server-side `rotateCredential` helper. Apply `sql/004_triggers_observability.sql` after the existing migrations.

## Operational setup

1. Apply `sql/schema.sql`, `sql/002_credentials.sql`, `sql/003_execution_engine.sql`, and then `sql/004_triggers_observability.sql` in order.
2. Configure Redis, Supabase, and the existing environment variables. Optionally set `POLLING_MATERIALIZER_INTERVAL_MS`, `POLLING_CONCURRENCY`, and `WEBHOOK_HMAC_SECRET`.
3. Run the Next.js application, the workflow worker (`npm run worker`), and the trigger process (`npm run triggers`) as separate managed processes.
4. Create webhook route rows with a SHA-256 hash of the secret and send the plaintext secret in `x-vorrex-secret`. For a shared HMAC mode, send `x-vorrex-signature: sha256=<hex>` and configure `WEBHOOK_HMAC_SECRET`.

## Verification

The supplied test suite passes: **33 tests passed, 0 failed**. The production Next.js build also completes successfully and includes both `/api/webhooks` and `/api/webhooks/[workflowId]` routes.
