import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListClinicSmsUsageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(['ALL', 'ENABLED', 'DISABLED'])
  status?: 'ALL' | 'ENABLED' | 'DISABLED' = 'ALL';

  @IsOptional()
  @IsIn(['today', 'yesterday', '7d', '30d', 'month', 'all'])
  preset?: 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'all';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
