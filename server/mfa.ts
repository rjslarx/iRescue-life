import { authenticator } from 'otplib';
import crypto from 'crypto';
import QRCode from 'qrcode';
import bcrypt from 'bcrypt';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY!;
const APP_NAME = 'iRescue.life';

// Encryption/Decryption for MFA secret
export function encryptMfaSecret(secret: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptMfaSecret(encryptedSecret: string): string {
  const parts = encryptedSecret.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted secret format');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Generate MFA secret
export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

// Generate QR code data URL
export async function generateQRCode(email: string, secret: string): Promise<string> {
  const otpauthUrl = authenticator.keyuri(email, APP_NAME, secret);
  return await QRCode.toDataURL(otpauthUrl);
}

// Verify TOTP token
export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch (error) {
    return false;
  }
}

// Generate backup codes
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Generate 8-character alphanumeric codes
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
}

// Hash backup codes for storage
export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  const hashed = await Promise.all(
    codes.map(code => bcrypt.hash(code, 10))
  );
  return hashed;
}

// Verify backup code
export async function verifyBackupCode(code: string, hashedCodes: string[]): Promise<number | null> {
  for (let i = 0; i < hashedCodes.length; i++) {
    const isMatch = await bcrypt.compare(code, hashedCodes[i]);
    if (isMatch) {
      return i; // Return index of matched code
    }
  }
  return null;
}
