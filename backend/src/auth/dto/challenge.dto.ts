import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

const STELLAR_KEY_REGEX = /^G[A-Z2-7]{55}$/;
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ChallengeDto {
  @ApiProperty({
    description: 'Stellar Ed25519 public key (G...)',
    example: 'GDVOEGATQV4FGUJKDEBEYT5NAPWJ55MEMJVLC5TU7Y74WD73PPAS4TYW',
  })
  @IsString()
  @Matches(STELLAR_KEY_REGEX, { message: 'publicKey must be a valid Stellar public key (G...)' })
  publicKey!: string;
}

export class VerifyDto {
  @ApiProperty({ description: 'Stellar public key' })
  @IsString()
  @Matches(STELLAR_KEY_REGEX, { message: 'publicKey must be a valid Stellar public key (G...)' })
  publicKey!: string;

  @ApiProperty({ description: 'UUID nonce returned from POST /auth/challenge' })
  @IsString()
  @Matches(UUID_V4_REGEX, { message: 'nonce must be a valid UUID v4' })
  nonce!: string;

  @ApiProperty({
    description: 'Base64-encoded 64-byte Ed25519 signature of the challenge message string.',
  })
  @IsString()
  signature!: string;
}

/** GET /auth/nonce?address= */
export class NonceQueryDto {
  @ApiPropertyOptional({
    description: 'Stellar Ed25519 wallet address (G...)',
    example: 'GDVOEGATQV4FGUJKDEBEYT5NAPWJ55MEMJVLC5TU7Y74WD73PPAS4TYW',
  })
  @IsString()
  @Matches(STELLAR_KEY_REGEX, { message: 'address must be a valid Stellar public key (G...)' })
  address!: string;
}

/** POST /auth/verify — nonce-based challenge-response */
export class VerifyWalletDto {
  @ApiProperty({ description: 'Stellar wallet address (G...)' })
  @IsString()
  @Matches(STELLAR_KEY_REGEX, { message: 'address must be a valid Stellar public key (G...)' })
  address!: string;

  @ApiProperty({ description: 'UUID nonce obtained from GET /auth/nonce' })
  @IsString()
  @Matches(UUID_V4_REGEX, { message: 'nonce must be a valid UUID v4' })
  nonce!: string;

  @ApiProperty({
    description: 'Base64-encoded Ed25519 signature of the challenge message.',
  })
  @IsString()
  signature!: string;
}
