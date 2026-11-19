import { randomInt } from 'node:crypto';

/** New format: clinic_chamis_place_021452 */
const SAFE_SCHEMA = /^clinic_[a-z0-9]+(?:_[a-z0-9]+)*_[0-9]{6}$/;
/** Legacy UUID-based schemas still present until rename. */
const LEGACY_SCHEMA = /^clinic_[a-f0-9]{32}$/;

const PG_IDENT_MAX = 63;
const SUFFIX_LEN = 6;
const PREFIX = 'clinic_';

export function slugifyClinicName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return base.length > 0 ? base : 'clinic';
}

/** Slug truncated so clinic_<slug>_<6digits> fits Postgres identifier limit. */
export function schemaSlugFromClinicName(clinicName: string): string {
  const raw = slugifyClinicName(clinicName);
  const maxSlug = PG_IDENT_MAX - PREFIX.length - 1 - SUFFIX_LEN;
  return raw.slice(0, maxSlug).replace(/_+$/g, '') || 'clinic';
}

export function buildClinicSchemaName(slug: string, suffix: string): string {
  if (!/^[0-9]{6}$/.test(suffix)) {
    throw new Error('Schema suffix must be exactly 6 digits');
  }
  const name = `${PREFIX}${slug}_${suffix}`;
  return assertSafeClinicSchemaName(name);
}

export function randomSchemaSuffix(): string {
  return String(randomInt(100000, 1000000));
}

/**
 * Build a candidate schema name from clinic display name.
 * Caller must ensure uniqueness against Tenant + pg_namespace.
 */
export function createClinicSchemaName(clinicName: string, suffix = randomSchemaSuffix()): string {
  const slug = schemaSlugFromClinicName(clinicName);
  return buildClinicSchemaName(slug, suffix);
}

export function isLegacyClinicSchemaName(schemaName: string): boolean {
  return LEGACY_SCHEMA.test(schemaName);
}

export function isNewClinicSchemaName(schemaName: string): boolean {
  return SAFE_SCHEMA.test(schemaName);
}

export function assertSafeClinicSchemaName(schemaName: string): string {
  if (!SAFE_SCHEMA.test(schemaName) && !LEGACY_SCHEMA.test(schemaName)) {
    throw new Error('Unsafe clinic schema identifier rejected');
  }
  return schemaName;
}

/** Prefer new-format validation when creating/renaming. */
export function assertNewClinicSchemaName(schemaName: string): string {
  if (!SAFE_SCHEMA.test(schemaName)) {
    throw new Error('Unsafe clinic schema identifier rejected');
  }
  return schemaName;
}

export function quoteIdent(identifier: string): string {
  assertSafeClinicSchemaName(identifier);
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeCatalogName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}
