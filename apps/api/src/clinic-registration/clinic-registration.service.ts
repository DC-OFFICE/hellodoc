import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { normalizeEmail } from '../common/identifiers.js';
import { validatePasswordStrength } from '../common/password-policy.js';
import { PasswordService } from '../common/password.service.js';
import { PrismaPlatformService } from '../platform/prisma-platform.service.js';
import { CreateRegistrationDto } from './dto/create-registration.dto.js';

@Injectable()
export class ClinicRegistrationService {
  constructor(
    private readonly prisma: PrismaPlatformService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: CreateRegistrationDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    const passwordError = validatePasswordStrength(dto.password);
    if (passwordError) throw new BadRequestException(passwordError);

    const emailNormalized = normalizeEmail(dto.email);
    const clinicName = dto.clinicName.trim().replace(/\s+/g, ' ');
    const ownerName = dto.ownerName.trim().replace(/\s+/g, ' ');
    const mobile = dto.mobile.trim();
    const address = dto.address.trim();

    const existingPending = await this.prisma.clinicRegistration.findFirst({
      where: {
        OR: [
          { emailNormalized, status: 'PENDING_APPROVAL' },
          { clinicName: { equals: clinicName, mode: 'insensitive' }, status: 'PENDING_APPROVAL' },
        ],
      },
    });

    const existingActiveTenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { clinicName: { equals: clinicName, mode: 'insensitive' }, status: { in: ['ACTIVE', 'PROVISIONING', 'SUSPENDED'] } },
        ],
      },
    });

    const existingUser = await this.prisma.platformUser.findUnique({
      where: { emailNormalized },
      include: {
        memberships: {
          where: { active: true },
          include: { tenant: true },
        },
        platformAdmin: true,
      },
    });

    // Generic response to avoid account enumeration.
    const generic = {
      message:
        'Registration received. If the details are valid, a DartCodes administrator will review your request.',
    };

    if (existingPending || existingActiveTenant) {
      return generic;
    }

    if (existingUser?.platformAdmin?.active) {
      return generic;
    }

    if (
      existingUser?.memberships.some(
        (m) => m.tenant.status === 'ACTIVE' || m.tenant.status === 'PROVISIONING' || m.tenant.status === 'SUSPENDED',
      )
    ) {
      return generic;
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const created = await this.prisma.clinicRegistration.create({
      data: {
        clinicName,
        ownerName,
        email: dto.email.trim(),
        emailNormalized,
        mobile,
        address,
        passwordHash,
        status: 'PENDING_APPROVAL',
        applicantUserId: existingUser?.id,
      },
    });

    await this.audit.record({
      actorId: existingUser?.id,
      action: 'registration.submitted',
      targetType: 'clinic_registration',
      targetId: created.id,
      metadata: { clinicName },
    });

    return generic;
  }

  async listRegistrations(query: { status?: string; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(query.limit ?? 10, 1), 100);
    const offset = Math.max(query.offset ?? 0, 0);
    const where = query.status ? { status: query.status } : {};
    const [total, items] = await this.prisma.$transaction([
      this.prisma.clinicRegistration.count({ where }),
      this.prisma.clinicRegistration.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          clinicName: true,
          ownerName: true,
          email: true,
          mobile: true,
          address: true,
          status: true,
          createdAt: true,
          reviewedAt: true,
          tenantId: true,
          tenant: {
            select: {
              id: true,
              status: true,
              provisioningStatus: true,
              schemaName: true,
            },
          },
        },
      }),
    ]);
    return { items, total, limit, offset };
  }

  async reject(registrationId: string, adminUserId: string, reason?: string) {
    const registration = await this.prisma.clinicRegistration.findUnique({
      where: { id: registrationId },
    });
    if (!registration) {
      throw new BadRequestException('Registration not found');
    }
    if (registration.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only pending registrations can be rejected');
    }
    await this.prisma.clinicRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'REJECTED',
        reviewedById: adminUserId,
        reviewedAt: new Date(),
        rejectionReason: reason?.slice(0, 300) ?? null,
      },
    });
    await this.audit.record({
      actorId: adminUserId,
      action: 'registration.rejected',
      targetType: 'clinic_registration',
      targetId: registrationId,
    });
    return { id: registrationId, status: 'REJECTED' };
  }
}
