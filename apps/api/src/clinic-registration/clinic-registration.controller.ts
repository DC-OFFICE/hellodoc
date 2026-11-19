import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators.js';
import { ClinicRegistrationService } from './clinic-registration.service.js';
import { CreateRegistrationDto } from './dto/create-registration.dto.js';

@Controller('clinic-registrations')
export class ClinicRegistrationController {
  constructor(private readonly registrations: ClinicRegistrationService) {}

  @Public()
  @Throttle({
    default: {
      limit: Number(process.env.THROTTLE_REGISTRATION_LIMIT ?? 5),
      ttl: 60_000,
    },
  })
  @Post()
  @HttpCode(200)
  create(@Body() dto: CreateRegistrationDto) {
    return this.registrations.register(dto);
  }
}
