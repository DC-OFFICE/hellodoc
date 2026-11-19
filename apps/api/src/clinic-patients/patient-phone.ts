import { parsePhoneNumberFromString } from 'libphonenumber-js';

const DEFAULT_REGION = 'LK' as const;

/**
 * Normalize phone numbers for Sri Lankan clinics.
 * Accepts national (0771234567) and international (+94771234567) forms.
 * Returns E.164 when parseable; otherwise a digits-only fallback for search.
 */
export function normalizePhone(raw: string, defaultRegion: typeof DEFAULT_REGION | string = DEFAULT_REGION): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parsed = parsePhoneNumberFromString(trimmed, defaultRegion as 'LK');
  if (parsed?.isValid()) {
    return parsed.format('E.164');
  }

  // Soft fallback for incomplete local typing during search (not for storage of invalid numbers).
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 9 && digits.length <= 15) {
    if (digits.startsWith('94') && digits.length === 11) return `+${digits}`;
    if (digits.startsWith('0') && digits.length === 10) return `+94${digits.slice(1)}`;
    if (digits.length === 9) return `+94${digits}`;
  }
  return null;
}

export function assertValidPhone(raw: string): string {
  const normalized = normalizePhone(raw);
  if (!normalized) {
    throw new Error('Invalid phone number');
  }
  return normalized;
}

export function maskPhone(normalizedOrDisplay: string): string {
  const digits = normalizedOrDisplay.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

export function formatPatientNumber(seq: number, prefix = 'PAT'): string {
  return `${prefix}-${String(seq).padStart(6, '0')}`;
}
