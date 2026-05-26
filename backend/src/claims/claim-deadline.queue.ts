import { Queue, Worker } from 'bullmq';
import { getBullMQConnection } from '../redis/client';
import {
  CLAIM_DEADLINE_QUEUE_NAME,
  CLAIM_DEADLINE_REPEAT_JOB_ID,
  DEFAULT_CLAIM_DEADLINE_CRON,
} from './claim-deadline.constants';

export const CLAIM_DEADLINE_SCAN_JOB_NAME = 'scan-expired-claims';

let queue: Queue | null = null;
let worker: Worker | null = null;

export function getClaimDeadlineQueue(): Queue {
  if (!queue) {
    queue = new Queue(CLAIM_DEADLINE_QUEUE_NAME, {
      connection: getBullMQConnection(),
    });
  }
  return queue;
}

/** Registers the repeatable scan job (idempotent on job id). */
export async function ensureClaimDeadlineRepeatableJob(
  cron = process.env.CLAIM_DEADLINE_CRON ?? DEFAULT_CLAIM_DEADLINE_CRON,
): Promise<void> {
  const q = getClaimDeadlineQueue();
  await q.add(
    CLAIM_DEADLINE_SCAN_JOB_NAME,
    {},
    {
      jobId: CLAIM_DEADLINE_REPEAT_JOB_ID,
      repeat: { pattern: cron },
      removeOnComplete: 10,
      removeOnFail: 25,
    },
  );
}

export function startClaimDeadlineWorker(handler: () => Promise<void>): Worker {
  if (worker) {
    return worker;
  }

  worker = new Worker(
    CLAIM_DEADLINE_QUEUE_NAME,
    async (job) => {
      if (job.name === CLAIM_DEADLINE_SCAN_JOB_NAME) {
        await handler();
      }
    },
    { connection: getBullMQConnection(), concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    console.error(
      `[${CLAIM_DEADLINE_QUEUE_NAME}] job ${job?.id} failed:`,
      err.message,
    );
  });

  return worker;
}

export async function closeClaimDeadlineQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
