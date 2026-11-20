import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeCatalogName } from '../common/identifiers.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { AuditService } from '../audit/audit.service.js';
import { CreateCatalogItemDto, ListCatalogQueryDto, UpdateCatalogItemDto } from './dto/catalog.dto.js';

type CatalogKind = 'specialization' | 'qualification' | 'relationship';

@Injectable()
export class CatalogsService {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly audit: AuditService,
  ) {}

  async listAdmin(kind: CatalogKind, query: ListCatalogQueryDto = {}) {
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = {
      ...(query.q?.trim()
        ? { name: { contains: query.q.trim(), mode: 'insensitive' as const } }
        : {}),
    };
    const orderBy = [{ active: 'desc' as const }, { name: 'asc' as const }];
    if (kind === 'specialization') {
      const [total, items] = await this.prisma.$transaction([
        this.prisma.specialization.count({ where }),
        this.prisma.specialization.findMany({ where, orderBy, skip: offset, take: limit }),
      ]);
      return { items, total, limit, offset };
    }
    if (kind === 'qualification') {
      const [total, items] = await this.prisma.$transaction([
        this.prisma.qualification.count({ where }),
        this.prisma.qualification.findMany({ where, orderBy, skip: offset, take: limit }),
      ]);
      return { items, total, limit, offset };
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.relationship.count({ where }),
      this.prisma.relationship.findMany({ where, orderBy, skip: offset, take: limit }),
    ]);
    return { items, total, limit, offset };
  }

  async searchActive(kind: CatalogKind, q?: string, limit = 50) {
    const take = Math.min(Math.max(limit, 1), 100);
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
    if (kind === 'qualification') {
      return this.prisma.qualification.findMany({
        where,
        orderBy: { name: 'asc' },
        take,
        select: { id: true, name: true },
      });
    }
    return this.prisma.relationship.findMany({
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
      let item;
      if (kind === 'specialization') {
        item = await this.prisma.specialization.create({
          data: { name, nameNormalized, active: true },
        });
      } else if (kind === 'qualification') {
        item = await this.prisma.qualification.create({
          data: { name, nameNormalized, active: true },
        });
      } else {
        item = await this.prisma.relationship.create({
          data: { name, nameNormalized, active: true },
        });
      }
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
    let existing;
    if (kind === 'specialization') {
      existing = await this.prisma.specialization.findUnique({ where: { id } });
    } else if (kind === 'qualification') {
      existing = await this.prisma.qualification.findUnique({ where: { id } });
    } else {
      existing = await this.prisma.relationship.findUnique({ where: { id } });
    }
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
      let item;
      if (kind === 'specialization') {
        item = await this.prisma.specialization.update({ where: { id }, data });
      } else if (kind === 'qualification') {
        item = await this.prisma.qualification.update({ where: { id }, data });
      } else {
        item = await this.prisma.relationship.update({ where: { id }, data });
      }
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
    let item;
    if (kind === 'specialization') {
      item = await this.prisma.specialization.findUnique({ where: { id } });
    } else if (kind === 'qualification') {
      item = await this.prisma.qualification.findUnique({ where: { id } });
    } else {
      item = await this.prisma.relationship.findUnique({ where: { id } });
    }
    if (!item || !item.active) {
      throw new BadRequestException(`Invalid or inactive ${kind}`);
    }
    return item;
  }
}
