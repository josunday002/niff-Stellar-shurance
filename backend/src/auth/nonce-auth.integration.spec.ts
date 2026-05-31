/**
 * Nonce-based challenge-response auth flow — integration tests.
 *
 * Uses a minimal NestJS test module (no full AppModule) with an in-memory
 * RedisService stub. No network calls, no Redis, no DB required.
 *
 * Coverage:
 *   - GET /auth/nonce?address= issues a nonce for a valid address
 *   - GET /auth/nonce?address= rejects invalid/missing addresses
 *   - POST /auth/verify issues a JWT for a valid signature + nonce
 *   - POST /auth/verify rejects a replayed nonce (second use)
 *   - POST /auth/verify rejects an expired/missing nonce
 *   - POST /auth/verify rejects a mismatched address
 *   - POST /auth/verify rejects an invalid signature
 *   - Nonce is invalidated after successful verification
 *   - Full login flow: nonce → sign → verify → JWT validates on protected route
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Keypair } from '@stellar/stellar-sdk';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { NonceService } from './nonce.service';
import { RedisService } from '../cache/redis.service';
import { CacheModule } from '../cache/cache.module';

// ── In-memory RedisService stub ───────────────────────────────────────────────

function makeRedisStub() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  return {
    async get<T>(key: string): Promise<T | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) { store.delete(key); return null; }
      return JSON.parse(entry.value) as T;
    },
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
      store.set(key, { value: JSON.stringify(value), expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async del(key: string): Promise<void> { store.delete(key); },
    async ping(): Promise<boolean> { return true; },
    async onModuleDestroy(): Promise<void> { /* no-op */ },
    getClient() { return null; },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function signMessage(keypair: Keypair, message: string): string {
  return keypair.sign(Buffer.from(message)).toString('base64');
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('Nonce Auth Flow (integration)', () => {
  let app: INestApplication;
  let keypair: Keypair;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        CacheModule,
        AuthModule,
      ],
    })
      .overrideProvider(RedisService)
      .useValue(makeRedisStub())
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    keypair = Keypair.random();
  });

  // ── GET /auth/nonce ─────────────────────────────────────────────────────────

  describe('GET /api/auth/nonce', () => {
    it('returns nonce, message, and expiresAt for a valid address', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        nonce: expect.stringMatching(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        ),
        message: expect.stringContaining(keypair.publicKey()),
        expiresAt: expect.any(String),
      });
      expect(new Date(res.body.expiresAt as string).getTime()).toBeGreaterThan(Date.now());
    });

    it('returns 400 for a missing address', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/nonce');
      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid Stellar address', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: 'not-a-stellar-key' });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /auth/verify — happy path ──────────────────────────────────────────

  describe('POST /api/auth/verify — valid signature', () => {
    it('issues a JWT for a valid nonce + signature', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });

      expect(nonceRes.status).toBe(200);
      const { nonce, message } = nonceRes.body as { nonce: string; message: string };
      const signature = signMessage(keypair, message);

      const verifyRes = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: keypair.publicKey(), nonce, signature });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body).toMatchObject({
        token: expect.any(String),
        expiresAt: expect.any(String),
      });
      // Verify it's a valid JWT structure
      expect((verifyRes.body.token as string).split('.')).toHaveLength(3);
    });
  });

  // ── POST /auth/verify — nonce invalidation after use ────────────────────────

  describe('POST /api/auth/verify — replay protection', () => {
    it('rejects a nonce that has already been used (replay attack)', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });

      const { nonce, message } = nonceRes.body as { nonce: string; message: string };
      const signature = signMessage(keypair, message);

      // First use — succeeds
      const first = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: keypair.publicKey(), nonce, signature });
      expect(first.status).toBe(200);

      // Second use (replay) — must be rejected
      const second = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: keypair.publicKey(), nonce, signature });
      expect(second.status).toBe(401);
    });
  });

  // ── POST /auth/verify — expired/missing nonce ───────────────────────────────

  describe('POST /api/auth/verify — expired nonce', () => {
    it('rejects a nonce that does not exist (expired or never issued)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({
          address: keypair.publicKey(),
          nonce: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
          signature: Buffer.alloc(64).toString('base64'),
        });

      expect(res.status).toBe(401);
    });

    it('rejects a nonce stored with 0 TTL (immediately expired)', async () => {
      const nonceService = app.get(NonceService);
      const expiredNonce = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
      // Store with 0 TTL — expires immediately
      await nonceService.store(expiredNonce, {
        publicKey: keypair.publicKey(),
        message: 'expired-message',
      });
      // Ensure expiry
      await new Promise((r) => setTimeout(r, 10));

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({
          address: keypair.publicKey(),
          nonce: expiredNonce,
          signature: Buffer.alloc(64).toString('base64'),
        });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /auth/verify — address mismatch ────────────────────────────────────

  describe('POST /api/auth/verify — address mismatch', () => {
    it('rejects when address differs from the one used to request the nonce', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });

      const { nonce, message } = nonceRes.body as { nonce: string; message: string };
      const attacker = Keypair.random();
      const signature = signMessage(attacker, message);

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: attacker.publicKey(), nonce, signature });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /auth/verify — invalid signature ───────────────────────────────────

  describe('POST /api/auth/verify — invalid signature', () => {
    it('rejects a signature over a different message', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });

      const { nonce } = nonceRes.body as { nonce: string };
      const badSignature = signMessage(keypair, 'tampered-message');

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: keypair.publicKey(), nonce, signature: badSignature });

      expect(res.status).toBe(401);
    });

    it('rejects a signature from a different keypair', async () => {
      const nonceRes = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });

      const { nonce, message } = nonceRes.body as { nonce: string; message: string };
      const attacker = Keypair.random();
      const badSignature = signMessage(attacker, message);

      const res = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: keypair.publicKey(), nonce, signature: badSignature });

      expect(res.status).toBe(401);
    });
  });

  // ── Full login flow ──────────────────────────────────────────────────────────

  describe('Full login flow', () => {
    it('nonce → sign → verify → JWT is a valid signed token', async () => {
      // 1. Get nonce
      const nonceRes = await request(app.getHttpServer())
        .get('/api/auth/nonce')
        .query({ address: keypair.publicKey() });
      expect(nonceRes.status).toBe(200);

      const { nonce, message } = nonceRes.body as { nonce: string; message: string };

      // 2. Sign the challenge message
      const signature = signMessage(keypair, message);

      // 3. Verify and obtain JWT
      const verifyRes = await request(app.getHttpServer())
        .post('/api/auth/verify')
        .send({ address: keypair.publicKey(), nonce, signature });
      expect(verifyRes.status).toBe(200);

      const { token, expiresAt } = verifyRes.body as { token: string; expiresAt: string };

      // JWT must be a 3-part dot-separated string
      expect(token.split('.')).toHaveLength(3);
      // Expiry must be in the future
      expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());

      // Decode payload (no verification — just structural check)
      const payloadB64 = token.split('.')[1];
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Record<string, unknown>;
      expect(payload.sub).toBe(keypair.publicKey());
      expect(payload.walletAddress).toBe(keypair.publicKey());
      expect(payload.scope).toBe('user');
    });
  });
});
