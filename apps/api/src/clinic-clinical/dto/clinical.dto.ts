import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class InviteDoctorDto {
  @IsString()
  email!: string;
}

export class AcceptDoctorInviteDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(10)
  password!: string;
}

export class ReviewCredentialsDto {
  @IsIn(['VERIFIED', 'SUSPENDED', 'PENDING_REVIEW'])
  status!: 'VERIFIED' | 'SUSPENDED' | 'PENDING_REVIEW';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreateEncounterDto {
  @IsUUID()
  appointmentId!: string;
}

export class SaveEncounterDraftDto {
  @IsOptional()
  @IsString()
  chiefComplaint?: string;

  @IsOptional()
  @IsString()
  historyPresentIllness?: string;

  @IsOptional()
  @IsString()
  examinationFindings?: string;

  @IsOptional()
  @IsString()
  assessment?: string;

  @IsOptional()
  @IsString()
  treatmentPlan?: string;

  @IsOptional()
  @IsString()
  followUpInstructions?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class SignDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class AddendumDto {
  @IsString()
  @MinLength(3)
  body!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}

export class AllergyDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  @MinLength(2)
  substance!: string;

  @IsOptional()
  @IsString()
  reaction?: string;

  @IsOptional()
  @IsIn(['MILD', 'MODERATE', 'SEVERE', 'UNKNOWN'])
  severity?: string;

  @IsOptional()
  @IsString()
  informationSource?: string;
}

export class AllergyStatusDto {
  @IsIn(['UNKNOWN', 'NO_KNOWN_ALLERGIES'])
  status!: 'UNKNOWN' | 'NO_KNOWN_ALLERGIES';
}

export class HistoryDto {
  @IsUUID()
  patientId!: string;

  @IsIn(['CONDITION', 'PROCEDURE', 'LONG_TERM_TREATMENT', 'BACKGROUND'])
  category!: string;

  @IsString()
  @MinLength(2)
  summary!: string;
}

export class VitalsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  systolicMmhg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  diastolicMmhg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pulseBpm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  temperatureC?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  weightKg?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  heightCm?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  spo2Percent?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  respiratoryRate?: number | null;
}

export class PrescriptionItemDto {
  @IsString()
  @MinLength(2)
  medicineName!: string;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  dosageForm?: string;

  @IsString()
  @MinLength(1)
  dose!: string;

  @IsOptional()
  @IsString()
  route?: string;

  @IsString()
  @MinLength(1)
  frequency!: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  quantity?: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class SavePrescriptionDraftDto {
  @IsOptional()
  @IsString()
  clinicalInstructions?: string;

  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

export class VoidPrescriptionDto {
  @IsString()
  @MinLength(3)
  reason!: string;
}
