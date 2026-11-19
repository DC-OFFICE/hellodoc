import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatPatientNumber,
  maskPhone,
  normalizePhone,
} from '../../src/clinic-patients/patient-phone.js';
import {
  namesLikelyEqual,
  scoreDuplicateCandidate,
} from '../../src/clinic-patients/patient-duplicate.js';

describe('patient phone normalization', () => {
  it('normalizes Sri Lankan national and international numbers to the same E.164', () => {
    assert.equal(normalizePhone('0771234567'), '+94771234567');
    assert.equal(normalizePhone('+94771234567'), '+94771234567');
    assert.equal(normalizePhone('94771234567'), '+94771234567');
  });

  it('rejects empty / invalid numbers', () => {
    assert.equal(normalizePhone(''), null);
    assert.equal(normalizePhone('123'), null);
  });

  it('masks phone numbers', () => {
    assert.equal(maskPhone('+94771234567'), '*******4567');
  });

  it('formats patient numbers', () => {
    assert.equal(formatPatientNumber(1), 'PAT-000001');
    assert.equal(formatPatientNumber(42), 'PAT-000042');
  });
});

describe('patient duplicate scoring', () => {
  it('treats same name + same phone as strong match', () => {
    const match = scoreDuplicateCandidate({
      incomingName: 'Nimal Perera',
      incomingAge: 41,
      candidate: {
        id: '1',
        patientNumber: 'PAT-000001',
        fullName: 'Nimal Perera',
        dateOfBirth: null,
        approximateAgeYears: 41,
        primaryContactMasked: '****4567',
        status: 'ACTIVE',
        sharedPhone: true,
      },
    });
    assert.equal(match?.strength, 'STRONG');
  });

  it('treats shared phone with different name as SHARED_PHONE', () => {
    const match = scoreDuplicateCandidate({
      incomingName: 'Kamala Perera',
      candidate: {
        id: '1',
        patientNumber: 'PAT-000001',
        fullName: 'Nimal Perera',
        dateOfBirth: null,
        approximateAgeYears: null,
        primaryContactMasked: '****4567',
        status: 'ACTIVE',
        sharedPhone: true,
      },
    });
    assert.equal(match?.strength, 'SHARED_PHONE');
  });

  it('matches unicode-normalized names', () => {
    assert.equal(namesLikelyEqual('Nimal  Perera', 'nimal perera'), true);
  });
});
