import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { Queue } from 'bullmq';
import { getBullMQConnection } from '../redis/client';
import { ClaimStatus, Prisma } from '@prisma/client';

export interface BackfillJobInfo {
  jobId: string;
  fromLedger: number;
  toLedger: number;
  batchSize: number;
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);
  private reindexQueue: Queue;
  private backfillQueue: Queue;

  constructor(
    private readonly prisma: PrismaService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {
    const defaultJobOptions = {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    };
    this.reindexQueue = new Queue('reindex', {
      connection: getBullMQConnection(),
      defaultJobOptions,
    });
    this.backfillQueue = new Queue('backfill', {
      connection: getBullMQConnection(),
      defaultJobOptions,
    });
  }

  /**
   * Reset per-network cursor so the next indexer pass starts at `fromLedger`,
   * then enqueue a BullMQ job to drive catch-up (see ReindexWorkerService).
   */
  async enqueueReindex(fromLedger: number, network: string): Promise<string> {
    const lastProcessed = Math.max(0, fromLedger - 1);
    await this.prisma.$transaction(async (tx) => {
      await tx.ledgerCursor.upsert({
        where: { network },
        create: { network, lastProcessedLedger: lastProcessed },
        update: { lastProcessedLedger: lastProcessed },
      });
    });
    const job = await this.reindexQueue.add(
      'reindex',
      { fromLedger, network },
      { jobId: `reindex-${network}-${fromLedger}-${Date.now()}` },
    );
    this.logger.log(`Reindex job enqueued: ${job.id} network=${network} fromLedger=${fromLedger}`);
    return job.id!;
  }

  /**
   * Split [fromLedger, toLedger] into batchSize-sized chunks and enqueue one
   * BullMQ backfill job per chunk. Returns the created job IDs and metadata.
   * Does NOT mutate the ledger cursor — backfill is a replay-only operation.
   */
  async enqueueBackfill(
    fromLedger: number,
    toLedger: number,
    network: string,
    batchSize: number,
  ): Promise<BackfillJobInfo[]> {
    const jobs: BackfillJobInfo[] = [];
    const ts = Date.now();
    let batchIndex = 0;

    for (let start = fromLedger; start <= toLedger; start += batchSize) {
      const end = Math.min(start + batchSize - 1, toLedger);
      const jobId = `backfill-${network}-${start}-${end}-${ts}-${batchIndex}`;
      const job = await this.backfillQueue.add(
        'backfill',
        { fromLedger: start, toLedger: end, network, batchSize },
        { jobId },
      );
      jobs.push({ jobId: job.id!, fromLedger: start, toLedger: end, batchSize });
      batchIndex++;
    }

    this.logger.log(
      `Backfill enqueued: ${jobs.length} job(s) for ${network} ledgers ${fromLedger}–${toLedger}`,
    );
    return jobs;
  }

  /** Retrieve BullMQ job status from the backfill queue. */
  async getBackfillJob(jobId: string): Promise<{
    jobId: string;
    state: string;
    data: unknown;
    progress: unknown;
    failedReason?: string;
    finishedOn?: number;
    processedOn?: number;
  } | null> {
    const job = await this.backfillQueue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      jobId: job.id!,
      state,
      data: job.data,
      progress: job.progress,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  }

  async setFeatureFlag(key: string, enabled: boolean, description: string | undefined, actor: string) {
    const result = await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description, updatedBy: actor },
      update: { enabled, description, updatedBy: actor },
    });
    await this.featureFlagsService.refreshFlags();
    return result;
  }

  async getFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async getClaimForOverride(claimId: number) {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim) {
      throw new NotFoundException(`Claim ${claimId} not found`);
    }
    if (this.isTerminalClaimStatus(claim.status)) {
      throw new BadRequestException({
        code: 'TERMINAL_CLAIM_OVERRIDE_REJECTED',
        message: `Claim ${claimId} is already terminal (${claim.status}) and cannot be overridden.`,
      });
    }
    return claim;
  }

  async overrideClaimStatus(claimId: number, newStatus: ClaimStatus) {
    await this.getClaimForOverride(claimId);
    return this.prisma.claim.update({
      where: { id: claimId },
      data: {
        status: newStatus,
        isFinalized: this.isTerminalClaimStatus(newStatus),
      } satisfies Prisma.ClaimUpdateInput,
    });
  }

  private isTerminalClaimStatus(status: ClaimStatus): boolean {
    return status === ClaimStatus.PAID || status === ClaimStatus.REJECTED;
  }
}
