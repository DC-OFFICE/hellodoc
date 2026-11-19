import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').toUpperCase().replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: Buffer, counter: bigint): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(counter);
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return bin.toString().padStart(6, '0');
}

export function totpCode(secret: Buffer, nowMs: number): string {
  const counter = BigInt(Math.floor(nowMs / 30_000));
  return hotp(secret, counter);
}

export function acceptedTotpStep(secret: Buffer, code: string, nowMs = Date.now(), window = 1): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const counter = BigInt(Math.floor(nowMs / 30_000));
  for (let offset = -window; offset <= window; offset += 1) {
    const step = counter + BigInt(offset);
    const expected = hotp(secret, step);
    const left = Buffer.from(expected);
    const right = Buffer.from(code);
    if (left.length === right.length && timingSafeEqual(left, right)) return step;
  }
  return null;
}

export function verifyTotp(secret: Buffer, code: string, nowMs = Date.now(), window = 1): boolean {
  return acceptedTotpStep(secret, code, nowMs, window) !== null;
}

export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`HelloDoc:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=HelloDoc&algorithm=SHA1&digits=6&period=30`;
}
