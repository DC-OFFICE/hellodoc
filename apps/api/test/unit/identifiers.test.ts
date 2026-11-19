import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertNewClinicSchemaName,
  assertSafeClinicSchemaName,
  buildClinicSchemaName,
  createClinicSchemaName,
  isLegacyClinicSchemaName,
  isNewClinicSchemaName,
  normalizeEmail,
  quoteIdent,
  schemaSlugFromClinicName,
} from '../../src/common/identifiers.js';

describe('identifiers', () => {
  it('builds clinic schema names from clinic name + 6-digit suffix', () => {
    const name = createClinicSchemaName("Chami's Place", '021452');
    assert.equal(name, 'clinic_chamis_place_021452');
    assert.equal(isNewClinicSchemaName(name), true);
  });

  it('slugifies and truncates safely', () => {
    assert.equal(schemaSlugFromClinicName("Chami's Place"), 'chamis_place');
    assert.equal(buildClinicSchemaName('hello_medi_help', '100001'), 'clinic_hello_medi_help_100001');
  });

  it('accepts legacy uuid schemas for read paths', () => {
    const legacy = 'clinic_5aaa373b476e4c948423084c2ab3d53c';
    assert.equal(isLegacyClinicSchemaName(legacy), true);
    assert.equal(assertSafeClinicSchemaName(legacy), legacy);
    assert.throws(() => assertNewClinicSchemaName(legacy));
  });

  it('rejects unsafe schema identifiers', () => {
    assert.throws(() => assertSafeClinicSchemaName('clinic_drop;--'));
    assert.throws(() => assertSafeClinicSchemaName('public'));
    assert.throws(() => quoteIdent('clinic_"; DROP SCHEMA platform; --'));
    assert.throws(() => assertNewClinicSchemaName('clinic_abc_12'));
  });

  it('normalizes email', () => {
    assert.equal(normalizeEmail('  Admin@Example.COM '), 'admin@example.com');
  });
});
