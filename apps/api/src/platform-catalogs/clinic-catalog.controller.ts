import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators.js';
import { CatalogsService } from './catalogs.service.js';

@Controller('clinic/catalog')
export class ClinicCatalogController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Roles('clinic_manager')
  @Get('specializations')
  searchSpecializations(@Query('q') q?: string) {
    return this.catalogs.searchActive('specialization', q);
  }

  @Roles('clinic_manager')
  @Get('qualifications')
  searchQualifications(@Query('q') q?: string) {
    return this.catalogs.searchActive('qualification', q);
  }
}
