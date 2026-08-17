// Shared Redis connection for the durable execution engine (Phase 3).
//
// Lazy, same reasoning as lib/supabaseAdmin.ts: constructing an ioredis
// client eagerly at module load would mean a missing REDIS_URL crashes
// every route that transitively imports this module (any route that
// imports lib/queue/queue.ts to enqueue a run) at Next's build-time
// "Collecting page data" step, rather than failing cleanly at the one
// request that actually needed Redis.
//
// SERVER-ONLY. Never import from a client component.

import { Redis } from "ioredis";

let _connection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (_connection) return _connection;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set. The durable execution engine (queue-backed runs) needs a Redis instance — " +
        "set REDIS_URL (e.g. redis://default:password@host:6379) in your environment. " +
        "The synchronous debug path (the builder's \"Run\" button, and incoming webhooks) does not need this " +
        "and keeps working without it — see docs/phase3-execution-engine.md."
    );
  }

  // BullMQ requires this exact option on the connection it's given —
  // without it, ioredis's own retry behavior on blocking commands
  // conflicts with BullMQ's, and jobs intermittently fail to be picked
  // up. This is a BullMQ requirement (documented in its own README),
  // not a project-specific choice.
  _connection = new Redis(url, { maxRetriesPerRequest: null });
  return _connection;
}
