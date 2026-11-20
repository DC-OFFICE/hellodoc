import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListRegistrationsQueryDto {
  @IsOptional()
  @IsIn(['PENDING_APPROVAL', 'APPROVED', 'REJECTED'])
  status?: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class ListClinicsQueryDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'PROVISIONING', 'SUSPENDED'])
  status?: 'ACTIVE' | 'PROVISIONING' | 'SUSPENDED';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
