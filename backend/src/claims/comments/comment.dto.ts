import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ description: 'Comment body', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class CommentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() claimId!: number;
  @ApiProperty() authorAddress!: string;
  @ApiProperty() body!: string;
  @ApiProperty() createdAt!: Date;
}
