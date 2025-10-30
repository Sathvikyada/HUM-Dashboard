import type { HandlerEvent } from '@netlify/functions';

export function requireAdmin(event: HandlerEvent): void {
  const header = event.headers['authorization'] || event.headers['Authorization'];
  const expected = process.env.ADMIN_API_SECRET;
  if (!expected) throw new Error('ADMIN_API_SECRET not configured');
  if (!header || !header.startsWith('Bearer ')) {
    const err = new Error('Unauthorized');
    // @ts-ignore add status
    (err as any).statusCode = 401;
    throw err;
  }
  const token = header.slice('Bearer '.length);
  if (token !== expected) {
    const err = new Error('Forbidden');
    // @ts-ignore add status
    (err as any).statusCode = 403;
    throw err;
  }
}

