import { IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class DashboardMetricsQueryDto {
  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsIn(['today', 'yesterday', '7days', 'month', 'custom'])
  preset?: 'today' | 'yesterday' | '7days' | 'month' | 'custom';

  @IsOptional()
  @IsString()
  doctorId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
