import type { Request, Response } from 'express';

import { logger } from '../lib/logger.js';

export type AsyncRouteHandler = (req: Request, res: Response) => Promise<void>;
export type RouteErrorResponder = (res: Response) => void;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sendJsonError(
  res: Response,
  statusCode: number,
  error: string,
  extra: Record<string, unknown> = {}
): void {
  res.status(statusCode).json({
    success: false,
    error,
    ...extra,
  });
}

export function sendTextError(res: Response, statusCode: number, error: string): void {
  res.status(statusCode).send(error);
}

export function sendJsonInternalError(res: Response, message = 'Internal error'): void {
  sendJsonError(res, 500, message);
}

export function sendTextInternalError(res: Response, message = 'Internal error'): void {
  sendTextError(res, 500, message);
}

export function createAsyncRouteHandler(
  logMessage: string,
  onError: RouteErrorResponder,
  handler: AsyncRouteHandler
): (req: Request, res: Response) => void {
  return (req: Request, res: Response): void => {
    void handler(req, res).catch((error: unknown) => {
      logger.error(logMessage, {
        error: getErrorMessage(error),
      });
      if (!res.headersSent) {
        onError(res);
      }
    });
  };
}
