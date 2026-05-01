import { normalizeAddress, tryNormalizeAddress } from '../common/utils/normalize-address';
import { BadRequestException } from '@nestjs/common';

// Valid test fixtures
const G_ADDRESS = 'GB7UW6GUZ4ZNLNOA2W5TUB2WK4AT5ZN4VVBVSXN3URPQGCEO6SNSCA4Q';
const C_ADDRESS = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM';
// Muxed address derived from G_ADDRESS with mux ID 1
const M_ADDRESS = 'MB7UW6GUZ4ZNLNOA2W5TUB2WK4AT5ZN4VVBVSXN3URPQGCEO6SNSCAAAAAAAAAAAAFI4U';

describe('normalizeAddress', () => {
  it('returns G-address unchanged', () => {
    expect(normalizeAddress(G_ADDRESS)).toBe(G_ADDRESS);
  });

  it('returns C-address unchanged', () => {
    expect(normalizeAddress(C_ADDRESS)).toBe(C_ADDRESS);
  });

  it('strips mux ID from M-address and returns base G-address', () => {
    const result = normalizeAddress(M_ADDRESS);
    expect(result).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('trims whitespace before validating', () => {
    expect(normalizeAddress(`  ${G_ADDRESS}  `)).toBe(G_ADDRESS);
  });

  it('throws BadRequestException for empty string', () => {
    expect(() => normalizeAddress('')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for garbage input', () => {
    expect(() => normalizeAddress('not-an-address')).toThrow(BadRequestException);
  });

  it('throws BadRequestException with INVALID_ADDRESS code', () => {
    try {
      normalizeAddress('BADADDRESS');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      const response = (err as BadRequestException).getResponse() as Record<string, string>;
      expect(response.code).toBe('INVALID_ADDRESS');
    }
  });
});

describe('tryNormalizeAddress', () => {
  it('returns normalized address on valid input', () => {
    expect(tryNormalizeAddress(G_ADDRESS)).toBe(G_ADDRESS);
  });

  it('returns null on invalid input', () => {
    expect(tryNormalizeAddress('garbage')).toBeNull();
  });
});
