import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { CurrentSession, Roles } from '../auth/decorators.js';
import type { AuthenticatedSession } from '../auth/session.service.js';
import { CatalogsService } from './catalogs.service.js';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './dto/catalog.dto.js';

@Controller('platform')
export class PlatformCatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  @Roles('platform_admin')
  @Get('specializations')
  listSpecializations(@Query('q') q?: string) {
    return this.catalogs.listAdmin('specialization', q);
  }

  @Roles('platform_admin')
  @Post('specializations')
  createSpecialization(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return this.catalogs.create('specialization', dto, session.userId);
  }

  @Roles('platform_admin')
  @Patch('specializations/:id')
  updateSpecialization(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalogs.update('specialization', id, dto, session.userId);
  }

  @Roles('platform_admin')
  @Get('qualifications')
  listQualifications(@Query('q') q?: string) {
    return this.catalogs.listAdmin('qualification', q);
  }

  @Roles('platform_admin')
  @Post('qualifications')
  createQualification(
    @CurrentSession() session: AuthenticatedSession,
    @Body() dto: CreateCatalogItemDto,
  ) {
    return this.catalogs.create('qualification', dto, session.userId);
  }

  @Roles('platform_admin')
  @Patch('qualifications/:id')
  updateQualification(
    @CurrentSession() session: AuthenticatedSession,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCatalogItemDto,
  ) {
    return this.catalogs.update('qualification', id, dto, session.userId);
  }
}
