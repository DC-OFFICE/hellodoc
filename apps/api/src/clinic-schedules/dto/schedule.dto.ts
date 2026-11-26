import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ScheduleSlotDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @Matches(/^\d{2}:\d{2}$/, { message: 'Enter a valid start time' })
  localStartTime!: string;

  @Matches(/^\d{2}:\d{2}$/, { message: 'Enter a valid end time' })
  localEndTime!: string;
}

export class CreateScheduleTemplatesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScheduleSlotDto)
  slots!: ScheduleSlotDto[];

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Capacity must be a whole number' })
  @Min(1, { message: 'Capacity must be at least 1' })
  @Max(500, { message: 'Capacity cannot be more than 500' })
  defaultCapacity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Duration must be a whole number of minutes' })
  @Min(1, { message: 'Duration must be at least 1 minute' })
  @Max(240, { message: 'Duration cannot be more than 240 minutes' })
  expectedDurationMinutes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  materialize?: boolean;
}

export class MaterializeScheduleDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(180)
  horizonDays?: number;
}
