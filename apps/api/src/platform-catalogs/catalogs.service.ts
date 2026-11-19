import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeCatalogName } from '../common/identifiers.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateCatalogItemDto, UpdateCatalogItemDto } from './dto/catalog.dto.js';

type CatalogKind = 'specialization' | 'qualification';

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly audit: AuditService,
  ) {}

  async listAdmin(kind: CatalogKind, q?: string) {
    const where = {
      ...(q?.trim()
        ? { name: { contains: q.trim(), mode: 'insensitive' as const } }
        : {}),
    };
    if (kind === 'specialization') {
      return this.prisma.specialization.findMany({
        where,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      });
    }
    return this.prisma.qualification.findMany({
      where,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async searchActive(kind: CatalogKind, q?: string, limit = 20) {
    const take = Math.min(Math.max(limit, 1), 50);
    const where = {
      active: true,
      ...(q?.trim()
        ? { name: { contains: q.trim(), mode: 'insensitive' as const } }
        : {}),
    };
    if (kind === 'specialization') {
      return this.prisma.specialization.findMany({
        where,
        orderBy: { name: 'asc' },
        take,
        select: { id: true, name: true },
      });
    }
    return this.prisma.qualification.findMany({
      where,
      orderBy: { name: 'asc' },
      take,
      select: { id: true, name: true },
    });
  }

  async create(kind: CatalogKind, dto: CreateCatalogItemDto, actorId: string) {
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Name is required');
    const nameNormalized = normalizeCatalogName(name);
    try {
      const item =
        kind === 'specialization'
          ? await this.prisma.specialization.create({
              data: { name, nameNormalized, active: true },
            })
          : await this.prisma.qualification.create({
              data: { name, nameNormalized, active: true },
            });
      await this.audit.record({
        actorId,
        action: `${kind}.created`,
        targetType: kind,
        targetId: item.id,
        metadata: { name },
      });
      return item;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`This ${kind} already exists`);
      }
      throw error;
    }
  }

  async update(kind: CatalogKind, id: string, dto: UpdateCatalogItemDto, actorId: string) {
    const existing =
      kind === 'specialization'
        ? await this.prisma.specialization.findUnique({ where: { id } })
        : await this.prisma.qualification.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Catalog item not found');

    const data: { name?: string; nameNormalized?: string; active?: boolean } = {};
    if (dto.name != null) {
      const name = dto.name.trim().replace(/\s+/g, ' ');
      if (!name) throw new BadRequestException('Name is required');
      data.name = name;
      data.nameNormalized = normalizeCatalogName(name);
    }
    if (dto.active != null) data.active = dto.active;

    try {
      const item =
        kind === 'specialization'
          ? await this.prisma.specialization.update({ where: { id }, data })
          : await this.prisma.qualification.update({ where: { id }, data });
      await this.audit.record({
        actorId,
        action: `${kind}.updated`,
        targetType: kind,
        targetId: id,
        metadata: data,
      });
      return item;
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new ConflictException(`This ${kind} already exists`);
      }
      throw error;
    }
  }

  async requireActive(kind: CatalogKind, id: string) {
    const item =
      kind === 'specialization'
        ? await this.prisma.specialization.findUnique({ where: { id } })
        : await this.prisma.qualification.findUnique({ where: { id } });
    if (!item || !item.active) {
      throw new BadRequestException(`Invalid or inactive ${kind}`);
    }
    return item;
  }
}
