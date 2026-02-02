import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import * as auth from '../lib/auth.js';
import type { JWTPayload } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

export interface Context {
  user: JWTPayload | null;
  req: CreateExpressContextOptions['req'];
  res: CreateExpressContextOptions['res'];
}

export async function createContext({ req, res }: CreateExpressContextOptions): Promise<Context> {
  const authHeader = req.headers.authorization;
  let user: JWTPayload | null = null;

  if (authHeader?.startsWith('Bearer ') === true) {
    const token = authHeader.slice(7);
    user = await auth.verifyAccessToken(token);

    // Fallback to legacy admin token
    const adminToken = process.env.ADMIN_TOKEN;
    if (!user && adminToken && adminToken === token) {
      logger.info('Legacy admin token used for request context');
      user = auth.createLegacyAdminPayload() as unknown as JWTPayload;
    }
  }

  return { user, req, res };
}
