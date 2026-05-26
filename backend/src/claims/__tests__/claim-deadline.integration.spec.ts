/**
 * Claim deadline processor integration tests (issue #650) — mocked Soroban RPC.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ClaimStatus } from '@prisma/client';
import { ClaimDeadlineProcessorService } from '../claim-deadline.processor.service';
import { SorobanService } from '../../rpc/soroban.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CLAIM_VOTING_WINDOW_LEDGERS } from '../claim-deadline.constants';

const sorobanMock = {
  finalizeClaim: jest.fn(),
};

const prismaMock = {
  ledgerCursor: { findUnique: jest.fn() },
  claim: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};

describe('ClaimDeadlineProcessorService (integration)', () => {
  let service: ClaimDeadlineProcessorService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimDeadlineProcessorService,
        { provide: SorobanService, useValue: sorobanMock },
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, def?: unknown) => (key === 'STELLAR_NETWORK' ? 'testnet' : def)) },
        },
      ],
    }).compile();

    service = moduleRef.get(ClaimDeadlineProcessorService);
  });

  it('finalizes expired claim and updates DB on successful RPC', async () => {
    prismaMock.ledgerCursor.findUnique.mockResolvedValue({ lastProcessedLedger: 200_000 });
    prismaMock.claim.findMany.mockResolvedValue([{ id: 42, createdAtLedger: 50_000 }]);
    prismaMock.claim.findUnique.mockResolvedValue({
      id: 42,
      isFinalized: false,
      status: 'PENDING',
    });
    sorobanMock.finalizeClaim.mockResolvedValue({
      txHash: 'abc123',
      ledger: 200_001,
      onChainStatus: 'Approved',
    });

    const outcome = await service.processClaim(42);

    expect(outcome).toBe('finalized');
    expect(sorobanMock.finalizeClaim).toHaveBeenCalledWith(42);
    expect(prismaMock.claim.update).toHaveBeenCalledWith({
      where: { id: 42 },
      data: expect.objectContaining({
        isFinalized: true,
        status: ClaimStatus.APPROVED,
        txHash: 'abc123',
      }),
    });
  });

  it('logs RPC failure and returns failed without throwing', async () => {
    prismaMock.claim.findUnique.mockResolvedValue({
      id: 7,
      isFinalized: false,
      status: 'PENDING',
    });
    sorobanMock.finalizeClaim.mockRejectedValue(new Error('RPC timeout'));

    const outcome = await service.processClaim(7);

    expect(outcome).toBe('failed');
    expect(prismaMock.claim.update).not.toHaveBeenCalled();
  });

  it('skips already-finalized claim cleanly', async () => {
    prismaMock.claim.findUnique.mockResolvedValue({
      id: 9,
      isFinalized: true,
      status: ClaimStatus.APPROVED,
    });

    const outcome = await service.processClaim(9);

    expect(outcome).toBe('skipped');
    expect(sorobanMock.finalizeClaim).not.toHaveBeenCalled();
  });

  it('scan selects claims past deadline ledger', async () => {
    const currentLedger = CLAIM_VOTING_WINDOW_LEDGERS + 1_000;
    prismaMock.ledgerCursor.findUnique.mockResolvedValue({ lastProcessedLedger: currentLedger });
    prismaMock.claim.findMany.mockResolvedValue([]);

    await service.runScan();

    expect(prismaMock.claim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PENDING',
          isFinalized: false,
          createdAtLedger: { lte: currentLedger - CLAIM_VOTING_WINDOW_LEDGERS },
        }),
      }),
    );
  });
});
