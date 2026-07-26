import crypto from 'node:crypto';

// Tunables
const NONCE_BYTES = 18;

export class DirectorAuth {
  constructor(private readonly passphrase: string) {}

  generateNonce(): string { return crypto.randomBytes(NONCE_BYTES).toString('hex'); }
  
  verify(nonce: string, digestHex: string): boolean {
    const expected = crypto.createHmac('sha256', this.passphrase).update(nonce).digest();
    const provided = Buffer.from(digestHex, 'hex');
    if (provided.length !== expected.length) { return false; }
    return crypto.timingSafeEqual(provided, expected);
  }
}
