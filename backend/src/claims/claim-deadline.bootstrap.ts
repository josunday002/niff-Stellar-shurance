import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ClaimDeadlineProcessorService } from './claim-deadline.processor.service';
import {
  closeClaimDeadlineQueue,
  ensureClaimDeadlineRepeatableJob,
  startClaimDeadlineWorker,
} from './claim-deadline.queue';

@Injectable()
export class ClaimDeadlineBootstrap implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClaimDeadlineBootstrap.name);

  constructor(private readonly processor: ClaimDeadlineProcessorService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.DISABLE_CLAIM_DEADLINE_PROCESSOR === 'true') {
      this.logger.log('Claim deadline processor disabled (DISABLE_CLAIM_DEADLINE_PROCESSOR=true)');
      return;
    }

    await ensureClaimDeadlineRepeatableJob();
    startClaimDeadlineWorker(() => this.processor.runScan());
    this.logger.log('Claim deadline BullMQ repeatable scan registered');
  }

  async onModuleDestroy(): Promise<void> {
    await closeClaimDeadlineQueue();
  }
}
