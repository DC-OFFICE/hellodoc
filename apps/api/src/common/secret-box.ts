import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function encryptionKey(): Buffer {
  const raw = (process.env.MFA_ENCRYPTION_KEY || process.env.SMS_PAYLOAD_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error('MFA_ENCRYPTION_KEY or SMS_PAYLOAD_ENCRYPTION_KEY is required');
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  return createHash('sha256').update(raw).digest();
}

export function sealSecret(plain: string): { ciphertext: string; nonce: string } {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64url'),
    nonce: nonce.toString('base64url'),
  };
}

export function openSecret(ciphertext: string, nonce: string): string {
  const buf = Buffer.from(ciphertext, 'base64url');
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(nonce, 'base64url'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
