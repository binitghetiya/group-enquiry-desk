import { createHmac } from 'node:crypto';

/** Keyed hash of the client IP: lets us group abuse without storing the raw address. */
export function hashIp(secret: string, ip: string | undefined): string {
  return createHmac('sha256', secret)
    .update(`ip:${ip ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32);
}
