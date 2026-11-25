/**
 * Sri Lankan mobile numbers: 07XXXXXXXX, +947XXXXXXXX or 947XXXXXXXX.
 * Spaces, dashes and brackets are ignored. Mobile prefixes are 070–072 and 074–078.
 * Keep in sync with apps/api/src/common/sri-lanka-mobile.ts.
 */
const SRI_LANKA_MOBILE_RE = /^(?:\+94|94|0)7[0124-8]\d{7}$/;

export const SRI_LANKA_MOBILE_MESSAGE =
  'Enter a valid Sri Lankan mobile number, e.g. 0771234567 or +94771234567';

export const SRI_LANKA_MOBILE_HINT = 'Format: 07XXXXXXXX or +947XXXXXXXX';

export function isSriLankanMobile(raw: string | undefined | null): boolean {
  if (!raw) return false;
  return SRI_LANKA_MOBILE_RE.test(raw.trim().replace(/[\s\-()]/g, ''));
}
