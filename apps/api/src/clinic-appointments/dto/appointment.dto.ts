import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAppointmentDto {
  @IsUUID()
  patientId!: string;

  @IsUUID()
  sessionId!: string;

  @IsIn(['PHONE', 'WALK_IN'])
  bookingSource!: 'PHONE' | 'WALK_IN';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  internalNotes?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;
}

export class CancelAppointmentDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class RescheduleAppointmentDto {
  @IsUUID()
  newSessionId!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;
}

export class ListAppointmentsQueryDto {
  @IsOptional()
  @IsString()
  @Matches(DATE_RE)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE)
  to?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(CONFIRMED|CANCELLED|RESCHEDULED|ALL)$/)
  status?: 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED' | 'ALL';

  @IsOptional()
  @IsIn(['PHONE', 'WALK_IN'])
  bookingSource?: 'PHONE' | 'WALK_IN';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

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
