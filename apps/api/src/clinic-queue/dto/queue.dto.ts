import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ReasonDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}

export class RequiredReasonDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class DelaySessionDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  revisedStartHint?: string;
}

export class CloseSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  unresolvedPolicy?: 'KEEP_WAITING' | 'MARK_NO_SHOW';
}
