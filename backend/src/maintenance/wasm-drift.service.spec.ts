import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WasmDriftService } from './wasm-drift.service';

// Mock the entire @stellar/stellar-sdk so Server is replaceable
const mockGetLedgerEntries = jest.fn();
jest.mock('@stellar/stellar-sdk', () => {
  const actual = jest.requireActual('@stellar/stellar-sdk');
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Server: jest.fn().mockImplementation(() => ({
        getLedgerEntries: mockGetLedgerEntries,
      })),
    },
  };
});

// Mock axios — static import in service, so jest.mock works reliably
jest.mock('axios');
import axios from 'axios';
const mockAxiosPost = axios.post as jest.Mock;
// Valid Stellar C-address for use in tests
const VALID_CONTRACT_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';

describe('WasmDriftService', () => {
  let service: WasmDriftService;
  let mockConfig: jest.Mocked<ConfigService>;
  let mockPrisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGetLedgerEntries.mockReset();
    mockAxiosPost.mockReset();

    const mockConfigService = { get: jest.fn() };
    const mockPrismaService = {
      wasmDriftAlert: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WasmDriftService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<WasmDriftService>(WasmDriftService);
    mockConfig = module.get(ConfigService);
    mockPrisma = module.get(PrismaService);
  });

  // ── checkDrift ────────────────────────────────────────────────────────────

  describe('checkDrift', () => {
    const setupRegistry = (contracts: object[]) => {
      jest.spyOn(service as any, 'loadRegistry').mockReturnValue({ contracts });
      mockConfig.get.mockImplementation((key: string, defaultVal?: unknown) => {
        if (key === 'SOROBAN_RPC_URL') return 'https://soroban-testnet.stellar.org';
        if (key === 'DEPLOYMENT_REGISTRY_PATH') return 'contracts/deployment-registry.json';
        return defaultVal ?? '';  // return empty string for unknown keys so resolveEnv produces ''
      });
    };

    it('skips contracts with missing config', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
      setupRegistry([{ name: 'test', contractId: '${MISSING_VAR}', expectedWasmHash: 'hash' }]);
      await service.checkDrift();
      expect(loggerSpy).toHaveBeenCalledWith(
        'Skipping test: CONTRACT_ID or expected hash not configured',
      );
    });

    it('detects and handles drift', async () => {
      setupRegistry([{ name: 'test', contractId: 'test-id', expectedWasmHash: 'expected-hash' }]);
      jest.spyOn(service as any, 'fetchOnChainWasmHash').mockResolvedValue('actual-hash');
      (mockPrisma.wasmDriftAlert.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wasmDriftAlert.create as jest.Mock).mockResolvedValue({} as any);
      jest.spyOn(service as any, 'sendWebhookAlert').mockResolvedValue(undefined);
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      await service.checkDrift();

      expect(mockPrisma.wasmDriftAlert.create).toHaveBeenCalledWith({
        data: {
          dedupKey: 'test:actual-hash',
          contractName: 'test',
          contractId: 'test-id',
          expectedHash: 'expected-hash',
          actualHash: 'actual-hash',
        },
      });
      expect(loggerSpy).toHaveBeenCalledWith(
        '[wasm-drift] DRIFT DETECTED on test | expected=expected-hash | actual=actual-hash',
      );
    });

    it('skips already-alerted drift', async () => {
      setupRegistry([{ name: 'test', contractId: 'test-id', expectedWasmHash: 'expected-hash' }]);
      jest.spyOn(service as any, 'fetchOnChainWasmHash').mockResolvedValue('actual-hash');
      (mockPrisma.wasmDriftAlert.findUnique as jest.Mock).mockResolvedValue({} as any);
      const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

      await service.checkDrift();

      expect(mockPrisma.wasmDriftAlert.create).not.toHaveBeenCalled();
      expect(loggerSpy).toHaveBeenCalledWith(
        '[wasm-drift] DRIFT on test already alerted (dedup key: test:actual-hash)',
      );
    });

    it('logs OK for matching hashes', async () => {
      setupRegistry([{ name: 'test', contractId: 'test-id', expectedWasmHash: 'matching-hash' }]);
      jest.spyOn(service as any, 'fetchOnChainWasmHash').mockResolvedValue('matching-hash');
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await service.checkDrift();

      // Service uses slice(0, 12) — 'matching-has' + '…'
      expect(loggerSpy).toHaveBeenCalledWith('[wasm-drift] test: OK (matching-has…)');
    });

    it('handles fetch errors gracefully', async () => {
      setupRegistry([{ name: 'test', contractId: 'test-id', expectedWasmHash: 'hash' }]);
      jest.spyOn(service as any, 'fetchOnChainWasmHash').mockRejectedValue(new Error('RPC error'));
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      await service.checkDrift();

      expect(loggerSpy).toHaveBeenCalledWith('[wasm-drift] Failed to check test: RPC error');
    });
  });

  // ── fetchOnChainWasmHash ──────────────────────────────────────────────────

  describe('fetchOnChainWasmHash', () => {
    it('uses getContractWasmByContractId when available', async () => {
      const mockSrv = {
        getLedgerEntries: mockGetLedgerEntries,
        getContractWasmByContractId: jest.fn().mockResolvedValue({ wasmHash: 'hash-from-method' }),
      };
      const result = await (service as any).fetchOnChainWasmHash(mockSrv, VALID_CONTRACT_ID);
      expect(mockSrv.getContractWasmByContractId).toHaveBeenCalledWith(VALID_CONTRACT_ID);
      expect(result).toBe('hash-from-method');
    });

    it('falls back to manual ledger entry parsing', async () => {
      const mockEntry = {
        key: {} as any,
        val: {
          contractData: () => ({
            val: () => ({
              instance: () => ({
                executable: () => ({
                  wasmHash: () => Buffer.from('manual-hash', 'utf-8'),
                }),
              }),
            }),
          }),
        },
      };
      mockGetLedgerEntries.mockResolvedValue({ entries: [mockEntry], latestLedger: 1000 });
      const mockSrv = { getLedgerEntries: mockGetLedgerEntries };
      const result = await (service as any).fetchOnChainWasmHash(mockSrv, VALID_CONTRACT_ID);
      expect(mockGetLedgerEntries).toHaveBeenCalled();
      expect(result).toBe('6d616e75616c2d68617368');
    });

    it('throws if no ledger entry found', async () => {
      mockGetLedgerEntries.mockResolvedValue({ entries: [], latestLedger: 1000 });
      const mockSrv = { getLedgerEntries: mockGetLedgerEntries };
      await expect(
        (service as any).fetchOnChainWasmHash(mockSrv, VALID_CONTRACT_ID),
      ).rejects.toThrow(`No ledger entry for contract ${VALID_CONTRACT_ID}`);
    });
  });

  // ── handleDrift ───────────────────────────────────────────────────────────

  describe('handleDrift', () => {
    it('creates alert and calls sendWebhookAlert', async () => {
      (mockPrisma.wasmDriftAlert.findUnique as jest.Mock).mockResolvedValue(null);
      (mockPrisma.wasmDriftAlert.create as jest.Mock).mockResolvedValue({} as any);
      jest.spyOn(service as any, 'sendWebhookAlert').mockResolvedValue(undefined);

      await (service as any).handleDrift('test', 'id', 'exp', 'act');

      expect(mockPrisma.wasmDriftAlert.create).toHaveBeenCalledWith({
        data: { dedupKey: 'test:act', contractName: 'test', contractId: 'id', expectedHash: 'exp', actualHash: 'act' },
      });
      expect((service as any).sendWebhookAlert).toHaveBeenCalledWith({
        name: 'test', contractId: 'id', expected: 'exp', actual: 'act',
      });
    });
  });

  // ── sendWebhookAlert ──────────────────────────────────────────────────────

  describe('sendWebhookAlert', () => {
    it('skips when URL not configured', async () => {
      mockConfig.get.mockReturnValue(undefined);
      const loggerSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();
      await (service as any).sendWebhookAlert({ name: 'test', contractId: 'id', expected: 'exp', actual: 'act' });
      expect(loggerSpy).toHaveBeenCalledWith('[wasm-drift] WASM_DRIFT_WEBHOOK_URL not set — alert logged only');
    });

    it('sends webhook when URL configured', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'WASM_DRIFT_WEBHOOK_URL') return 'https://webhook.example.com';
        if (key === 'WASM_DRIFT_WEBHOOK_SECRET') return 'secret';
        return undefined;
      });
      mockAxiosPost.mockResolvedValue({});
      const loggerSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      await (service as any).sendWebhookAlert({ name: 'test', contractId: 'id', expected: 'exp', actual: 'act' });

      expect(mockAxiosPost).toHaveBeenCalledWith(
        'https://webhook.example.com',
        expect.objectContaining({ event: 'wasm_drift_detected', contract: 'test' }),
        expect.objectContaining({ headers: expect.objectContaining({ 'X-Webhook-Secret': 'secret' }) }),
      );
      expect(loggerSpy).toHaveBeenCalledWith('[wasm-drift] Alert webhook delivered for test');
    });

    it('handles webhook delivery failure', async () => {
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'WASM_DRIFT_WEBHOOK_URL') return 'https://webhook.example.com';
        return undefined;
      });
      mockAxiosPost.mockRejectedValue(new Error('Network error'));
      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      await (service as any).sendWebhookAlert({ name: 'test', contractId: 'id', expected: 'exp', actual: 'act' });

      expect(loggerSpy).toHaveBeenCalledWith('[wasm-drift] Webhook delivery failed: Network error');
    });
  });

  // ── resolveEnv ────────────────────────────────────────────────────────────

  describe('resolveEnv', () => {
    it('resolves environment variables', () => {
      mockConfig.get.mockImplementation((key: string) => key === 'TEST_VAR' ? 'resolved-value' : '');
      expect((service as any).resolveEnv('${TEST_VAR} and ${MISSING_VAR}')).toBe('resolved-value and ');
    });

    it('returns unchanged if no placeholders', () => {
      expect((service as any).resolveEnv('no-vars-here')).toBe('no-vars-here');
    });
  });
});
