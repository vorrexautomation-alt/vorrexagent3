import { Worker } from "bullmq";
import { getRedisConnection } from "@/lib/queue/connection";
import { POLLING_QUEUE_NAME, executePollingJob, markPollingFailure, materializePollingJobs } from "./polling";

const intervalMs = Math.max(5_000, Number(process.env.POLLING_MATERIALIZER_INTERVAL_MS || 30_000));

async function main() {
  const worker = new Worker(POLLING_QUEUE_NAME, async (job) => executePollingJob(job.data.triggerId), { connection: getRedisConnection(), concurrency: Number(process.env.POLLING_CONCURRENCY || 8) });
  worker.on("failed", async (job, error) => { if (job) await markPollingFailure(job.data.triggerId, error); });
  await materializePollingJobs();
  const timer = setInterval(() => materializePollingJobs().catch((error) => console.error("polling materializer failed", error)), intervalMs);
  const shutdown = async () => { clearInterval(timer); await worker.close(); process.exit(0); };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((error) => { console.error(error); process.exit(1); });
