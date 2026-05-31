import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CLAIM_BATCH_GET_MAX } from '../chain.constants';

export class GetClaimsBatchDto {
  @ApiProperty({
    type: [Number],
    maxItems: CLAIM_BATCH_GET_MAX,
    description: `Up to ${CLAIM_BATCH_GET_MAX} claim IDs; order is preserved and missing claims return null.`,
  })
  @IsArray()
  @ArrayMaxSize(CLAIM_BATCH_GET_MAX, {
    message: `ids must contain at most ${CLAIM_BATCH_GET_MAX} entries (on-chain CLAIM_BATCH_GET_MAX)`,
  })
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];

  @ApiPropertyOptional({
    description: 'Account used as the Soroban transaction source for simulation.',
  })
  @IsOptional()
  @IsString()
  source_account?: string;
}
