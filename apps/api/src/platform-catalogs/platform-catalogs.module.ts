import { Module } from '@nestjs/common';
import { CatalogsService } from './catalogs.service.js';
import { ClinicCatalogController } from './clinic-catalog.controller.js';
import { PlatformCatalogsController } from './platform-catalogs.controller.js';

@Module({
  controllers: [PlatformCatalogsController, ClinicCatalogController],
  providers: [CatalogsService],
  exports: [CatalogsService],
})
export class PlatformCatalogsModule {}
