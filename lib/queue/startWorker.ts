// Standalone worker process entrypoint. Run this as its own long-lived
// process — separate from the Next.js app — since a Next.js API route
// handler is request-scoped and gets torn down between requests rather
// than staying alive to keep polling Redis.
//
// Local dev:   npx tsx lib/queue/startWorker.ts
// Production:  build this file (or run it directly via tsx/ts-node) as
//              its own service — a Railway/Render/Fly "worker" service
//              type, a separate Dockerfile CMD, or a PM2 process — with
//              the same REDIS_URL, NEXT_PUBLIC_SUPABASE_URL,
//              SUPABASE_SERVICE_ROLE_KEY, and CREDENTIAL_ENCRYPTION_KEY
//              env vars as the main app (it needs all three: Redis to
//              pull jobs, Supabase to read workflows and write run
//              state, and the credential key because executors resolve
//              stored credentials exactly the same way the debug path
//              does — see lib/credentials.ts).
//
// Concurrency: WORKER_CONCURRENCY env var, default 4 — how many runs
// this process will work on at once. Scale by running more worker
// processes (horizontally), not just raising this number arbitrarily;
// each concurrent run can itself burst into many concurrent node
// executions within a single "wave" (see worker.ts), so this number is
// runs-in-flight, not a hard cap on total concurrent work.

import { startWorker } from "./worker";

const concurrency = Number(process.env.WORKER_CONCURRENCY) || 4;
const worker = startWorker(concurrency);

console.log(`[vorrex worker] listening on queue "workflow-runs" (concurrency=${concurrency})`);

async function shutdown(signal: string) {
  console.log(`[vorrex worker] received ${signal}, closing gracefully...`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
