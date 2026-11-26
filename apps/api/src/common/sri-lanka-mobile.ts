import { registerDecorator, type ValidationOptions } from 'class-validator';

/**
 * Sri Lankan mobile numbers: 07XXXXXXXX, +947XXXXXXXX or 947XXXXXXXX.
 * Spaces, dashes and brackets are ignored. Mobile prefixes are 070–072 and 074–078.
 */
const SRI_LANKA_MOBILE_RE = /^(?:\+94|94|0)7[0124-8]\d{7}$/;

export const SRI_LANKA_MOBILE_MESSAGE =
  'Enter a valid Sri Lankan mobile number, e.g. 0771234567 or +94771234567';

export function isSriLankanMobile(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  return SRI_LANKA_MOBILE_RE.test(raw.trim().replace(/[\s\-()]/g, ''));
}

export function IsSriLankanMobile(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isSriLankanMobile',
      target: object.constructor,
      propertyName,
      options: { message: SRI_LANKA_MOBILE_MESSAGE, ...options },
      validator: { validate: (value: unknown) => isSriLankanMobile(value) },
    });
  };
}
