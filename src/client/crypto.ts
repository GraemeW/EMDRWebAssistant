// Export Functions

export function isSecureCryptoAvailable(): boolean { return typeof crypto !== 'undefined' && typeof crypto.subtle !== 'undefined'; }

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign',]);
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
