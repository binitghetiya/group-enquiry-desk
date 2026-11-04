import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { BRAND_IDS, type BrandId } from '../config/brands';

/**
 * Signed, short-lived form token: base64url(JSON{b, iat, n}) + "." + HMAC-SHA256.
 * - b   brand resolved by the server from the page's site key (so the brand is never user input)
 * - iat issue time, used for a minimum fill time (bot check) and expiry
 * - n   random nonce, stored UNIQUE with the enquiry so a token can be used only once
 */
const payloadSchema = z.object({
  b: z.enum(BRAND_IDS),
  iat: z.number().int().nonnegative(),
  n: z.string().min(16).max(64),
});

const MAX_TOKEN_LENGTH = 512;

function mac(secret: string, body: string): string {
  return createHmac('sha256', secret).update(`ged-form:${body}`).digest('base64url');
}

export function signFormToken(
  secret: string,
  brand: BrandId,
  now: number = Date.now(),
  nonce: string = randomBytes(16).toString('base64url'),
): string {
  const body = Buffer.from(JSON.stringify({ b: brand, iat: now, n: nonce })).toString('base64url');
  return `${body}.${mac(secret, body)}`;
}

export type FormTokenResult =
  | { ok: true; brand: BrandId; nonce: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'too_fast' };

export function verifyFormToken(
  secret: string,
  token: unknown,
  opts: { minFillMs: number; ttlMs: number; now?: number },
): FormTokenResult {
  const invalid = { ok: false, reason: 'invalid' } as const;
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return invalid;

  const parts = token.split('.');
  if (parts.length !== 2) return invalid;
  const [body, sig] = parts as [string, string];

  const expected = Buffer.from(mac(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return invalid;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return invalid;
  }
  const parsed = payloadSchema.safeParse(decoded);
  if (!parsed.success) return invalid;

  const age = (opts.now ?? Date.now()) - parsed.data.iat;
  if (age < 0 || age > opts.ttlMs) return { ok: false, reason: 'expired' };
  if (age < opts.minFillMs) return { ok: false, reason: 'too_fast' };
  return { ok: true, brand: parsed.data.b, nonce: parsed.data.n };
}
