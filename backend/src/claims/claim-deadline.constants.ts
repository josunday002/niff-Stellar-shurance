/** BullMQ queue for scanning and finalizing claims past voting deadline. */
export const CLAIM_DEADLINE_QUEUE_NAME = 'claim-deadline-processor';

/** Repeatable scan job id (deduplicated by BullMQ). */
export const CLAIM_DEADLINE_REPEAT_JOB_ID = 'claim-deadline-scan';

/** Matches claim-view.mapper / on-chain default voting window. */
export const CLAIM_VOTING_WINDOW_LEDGERS = 120_960;

/** Max claims processed per scan tick. */
export const CLAIM_DEADLINE_BATCH_SIZE = 50;

/** Default repeatable cadence when CLAIM_DEADLINE_CRON is unset (every 15 minutes). */
export const DEFAULT_CLAIM_DEADLINE_CRON = '0 */15 * * * *';
