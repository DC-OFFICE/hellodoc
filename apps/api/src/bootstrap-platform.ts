import argon2 from 'argon2';
import { sealSecret } from './common/secret-box.js';
import { PrismaPlatformService } from './platform/prisma-platform.service.js';

const DEFAULT_SPECIALIZATIONS = [
  'General Practitioner',
  'Family Medicine',
  'Internal Medicine',
  'Pediatrics',
  'Obstetrics and Gynaecology',
  'Cardiology',
  'Dermatology',
  'Orthopaedics',
  'ENT',
  'Ophthalmology',
  'Psychiatry',
  'Radiology',
  'Anaesthesiology',
  'Emergency Medicine',
  'Dental Surgery',
  'Ayurvedic Medicine',
];

const DEFAULT_QUALIFICATIONS = [
  'MBBS',
  'MD',
  'MS',
  'MRCP',
  'FRCS',
  'DCH',
  'DO',
  'MDS',
  'BDS',
  'Diploma in Family Medicine',
  'Board Certified Specialist',
  'Consultant Physician',
];

const DEFAULT_RELATIONSHIPS = [
  'Father',
  'Mother',
  'Spouse',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Guardian',
  'Grandparent',
  'Relative',
  'Friend',
  'Other',
];

export async function bootstrapPlatform(prisma: PrismaPlatformService): Promise<void> {
  try {
    // 1. Seed Platform Admin if none exists
    const adminCount = await prisma.platformAdmin.count({ where: { active: true } });
    if (adminCount === 0) {
      const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@dartcodes.lk').trim().toLowerCase();
      const name = process.env.BOOTSTRAP_ADMIN_NAME ?? 'DartCodes Admin';
      const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'AdminPassword123!';

      const passwordHash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });

      const user = await prisma.platformUser.upsert({
        where: { emailNormalized: email },
        update: {
          name,
          email,
          passwordHash,
          active: true,
        },
        create: {
          name,
          email,
          emailNormalized: email,
          passwordHash,
          active: true,
        },
      });

      await prisma.platformAdmin.upsert({
        where: { userId: user.id },
        update: { active: true },
        create: { userId: user.id, active: true },
      });

      console.log(`[Bootstrap] Created initial platform administrator: ${email}`);
    }

    // 2. Seed Specializations if none exist
    const specCount = await prisma.specialization.count();
    if (specCount === 0) {
      for (const name of DEFAULT_SPECIALIZATIONS) {
        const nameNormalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
        await prisma.specialization.upsert({
          where: { nameNormalized },
          update: { active: true },
          create: { name: name.trim(), nameNormalized, active: true },
        });
      }
      console.log(`[Bootstrap] Seeded ${DEFAULT_SPECIALIZATIONS.length} specializations`);
    }

    // 3. Seed Qualifications if none exist
    const qualCount = await prisma.qualification.count();
    if (qualCount === 0) {
      for (const name of DEFAULT_QUALIFICATIONS) {
        const nameNormalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
        await prisma.qualification.upsert({
          where: { nameNormalized },
          update: { active: true },
          create: { name: name.trim(), nameNormalized, active: true },
        });
      }
      console.log(`[Bootstrap] Seeded ${DEFAULT_QUALIFICATIONS.length} qualifications`);
    }

    // 4. Seed Relationships if none exist
    const relCount = await prisma.relationship.count();
    if (relCount === 0) {
      for (const name of DEFAULT_RELATIONSHIPS) {
        const nameNormalized = name.trim().replace(/\s+/g, ' ').toLowerCase();
        await prisma.relationship.upsert({
          where: { nameNormalized },
          update: { active: true },
          create: { name: name.trim(), nameNormalized, active: true },
        });
      }
      console.log(`[Bootstrap] Seeded ${DEFAULT_RELATIONSHIPS.length} relationships`);
    }

    // 5. Seed default SMSLenz Gateway configuration if unconfigured or missing credentials
    try {
      const existingGateway = await prisma.platformSmsGateway.findUnique({
        where: { id: 'default' },
      });
      if (!existingGateway || !existingGateway.userId || !existingGateway.apiKeyCiphertext) {
        const defaultApiKey = 'b706c1f8-0231-4d15-bb1a-d4616f3e3ef6';
        const sealed = sealSecret(defaultApiKey);
        await prisma.platformSmsGateway.upsert({
          where: { id: 'default' },
          update: {
            enabled: true,
            baseUrl: 'https://smslenz.lk',
            userId: '1862',
            senderId: 'DARTCODES',
            connectionTimeoutMs: 30000,
            readTimeoutMs: 30000,
            apiKeyCiphertext: sealed.ciphertext,
            apiKeyNonce: sealed.nonce,
          },
          create: {
            id: 'default',
            enabled: true,
            baseUrl: 'https://smslenz.lk',
            userId: '1862',
            senderId: 'DARTCODES',
            connectionTimeoutMs: 30000,
            readTimeoutMs: 30000,
            apiKeyCiphertext: sealed.ciphertext,
            apiKeyNonce: sealed.nonce,
          },
        });
        console.log('[Bootstrap] Seeded default SMSLenz gateway configuration (User ID: 1862, Sender ID: DARTCODES)');
      }
    } catch (gatewayErr) {
      console.warn('[Bootstrap] Note: Could not auto-seed SMS gateway credentials:', gatewayErr instanceof Error ? gatewayErr.message : gatewayErr);
    }
  } catch (error) {
    console.error('[Bootstrap] Failed to bootstrap platform defaults:', error);
  }
}
