import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSmsGatewayDto {
  @IsBoolean()
  enabled!: boolean;

  @IsString()
  @MaxLength(200)
  baseUrl!: string;

  @IsString()
  @MaxLength(32)
  userId!: string;

  @IsString()
  @MaxLength(20)
  senderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120_000)
  connectionTimeoutMs!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120_000)
  readTimeoutMs!: number;

  /** Omit or leave blank to keep the stored key. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;
}
