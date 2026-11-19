import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCatalogItemDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}

export class UpdateCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class CatalogSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}
