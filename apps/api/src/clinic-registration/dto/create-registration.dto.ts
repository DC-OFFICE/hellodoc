import {
  Equals,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsSriLankanMobile } from '../../common/sri-lanka-mobile.js';

export class CreateRegistrationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  clinicName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsSriLankanMobile()
  mobile!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(300)
  address!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  confirmPassword!: string;

  @Equals(true, { message: 'Terms must be accepted' })
  acceptTerms!: boolean;
}
