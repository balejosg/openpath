import type { Express, Request, Response } from 'express';

import * as groupsStorage from '../lib/groups-storage.js';
import { config } from '../config.js';
import { buildWhitelistEtag, matchesIfNoneMatch } from '../lib/server-assets.js';
import { createAsyncRouteHandler, sendTextInternalError } from './route-helpers.js';

export function registerCoreRoutes(app: Express): void {
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'openpath-api' });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      googleClientId: config.googleClientId,
    });
  });

  app.get('/export/:name.txt', (req: Request, res: Response): void => {
    const name = Array.isArray(req.params.name) ? req.params.name[0] : req.params.name;
    if (!name) {
      res.status(400).type('text/plain').send('Group name required');
      return;
    }

    createAsyncRouteHandler(
      'Public export route failed',
      sendTextInternalError,
      async (_req: Request, response: Response): Promise<void> => {
        const group = await groupsStorage.getGroupMetaByName(name);
        if (!group) {
          response.status(404).type('text/plain').send('Group not found');
          return;
        }

        if (group.visibility !== 'instance_public') {
          response.status(404).type('text/plain').send('Group not found');
          return;
        }

        const etag = buildWhitelistEtag({
          groupId: group.id,
          updatedAt: group.updatedAt,
          enabled: group.enabled,
        });
        response.setHeader('ETag', etag);
        response.setHeader('Cache-Control', 'no-cache');
        if (matchesIfNoneMatch(req, etag)) {
          response.status(304).end();
          return;
        }

        if (!group.enabled) {
          response
            .type('text/plain')
            .send(`# Group "${group.displayName}" is currently disabled\n`);
          return;
        }

        const content = await groupsStorage.exportGroup(group.id);
        if (!content) {
          response.status(500).type('text/plain').send('Error exporting group');
          return;
        }

        response.type('text/plain').send(content);
      }
    )(req, res);
  });
}
