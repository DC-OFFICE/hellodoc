/**
 * Seed global specialization and qualification catalogs.
 *   npm run catalogs:seed -w @hellodoc/api
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const specializations = [
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

const qualifications = [
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

function norm(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();
try {
  for (const name of specializations) {
    await client.query(
      `INSERT INTO platform."Specialization"
        (id, name, "nameNormalized", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,true,NOW(),NOW())
       ON CONFLICT ("nameNormalized") DO UPDATE SET name = EXCLUDED.name, active = true, "updatedAt" = NOW()`,
      [randomUUID(), name, norm(name)],
    );
  }
  for (const name of qualifications) {
    await client.query(
      `INSERT INTO platform."Qualification"
        (id, name, "nameNormalized", active, "createdAt", "updatedAt")
       VALUES ($1,$2,$3,true,NOW(),NOW())
       ON CONFLICT ("nameNormalized") DO UPDATE SET name = EXCLUDED.name, active = true, "updatedAt" = NOW()`,
      [randomUUID(), name, norm(name)],
    );
  }
  console.log(`Seeded ${specializations.length} specializations and ${qualifications.length} qualifications`);
} finally {
  client.release();
  await pool.end();
}
