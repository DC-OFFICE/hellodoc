import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function resolveKey(): Buffer | null {
  const raw = process.env.SMS_PAYLOAD_ENCRYPTION_KEY?.trim();
  if (!raw) return null;
  // Accept 64-char hex or arbitrary passphrase (hashed to 32 bytes).
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return createHash('sha256').update(raw).digest();
}

export function encryptPayload(obj: Record<string, unknown>): {
  ciphertext: string;
  nonce: string;
} | null {
  const key = resolveKey();
  if (!key) return null;
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64url'),
    nonce: nonce.toString('base64url'),
  };
}

export function decryptPayload(
  ciphertext: string,
  nonce: string,
): Record<string, unknown> | null {
  const key = resolveKey();
  if (!key) return null;
  try {
    const buf = Buffer.from(ciphertext, 'base64url');
    const tag = buf.subarray(buf.length - 16);
    const data = buf.subarray(0, buf.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
    return JSON.parse(plain) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function hashRecipient(e164: string): string {
  return createHash('sha256').update(e164).digest('hex');
}
