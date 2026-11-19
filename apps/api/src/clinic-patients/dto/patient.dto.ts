import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SEX = ['MALE', 'FEMALE', 'OTHER', 'UNKNOWN'] as const;
const CONTACT_TYPE = ['MOBILE', 'LANDLINE', 'GUARDIAN_MOBILE', 'OTHER'] as const;

export class PatientContactInputDto {
  @IsIn(CONTACT_TYPE)
  contactType!: (typeof CONTACT_TYPE)[number];

  @IsString()
  @MinLength(3)
  @MaxLength(40)
  @Matches(PHONE_RE, { message: 'Invalid contact number' })
  value!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactPersonName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  relationship?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  preferredName?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(130)
  approximateAgeYears?: number;

  @IsOptional()
  @IsIn(SEX)
  sex?: (typeof SEX)[number];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PatientContactInputDto)
  contacts?: PatientContactInputDto[];

  @ValidateIf((o: CreatePatientDto) => !o.contacts?.length)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  contactExceptionReason?: string;

  @IsOptional()
  @IsBoolean()
  confirmDuplicate?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSharedPhone?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey?: string;
}

export class UpdatePatientDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  preferredName?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(130)
  approximateAgeYears?: number | null;

  @IsOptional()
  @IsIn(SEX)
  sex?: (typeof SEX)[number] | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  address?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PatientContactInputDto)
  contacts?: PatientContactInputDto[];

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  contactExceptionReason?: string | null;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  version!: number;
}

export class ListPatientsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(ACTIVE|INACTIVE|ALL)$/)
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

  @IsOptional()
  @IsIn(['name', 'createdAt', 'patientNumber'])
  sortBy?: 'name' | 'createdAt' | 'patientNumber';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';

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

export class SearchPatientsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_RE, { message: 'Invalid phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  patientNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(ACTIVE|INACTIVE|ALL)$/)
  status?: 'ACTIVE' | 'INACTIVE' | 'ALL';

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

export class CheckDuplicatesDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @Matches(PHONE_RE)
  primaryPhone?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_RE)
  dateOfBirth?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(130)
  approximateAgeYears?: number;
}

export class DeactivatePatientDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ReactivatePatientDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
