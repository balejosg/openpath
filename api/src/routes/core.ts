import type { Express, Request, Response } from 'express';

import * as groupsStorage from '../lib/groups-storage.js';
import { config } from '../config.js';
import { buildWhitelistEtag, matchesIfNoneMatch } from '../lib/server-assets.js';

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

    void (async (): Promise<void> => {
      const group = await groupsStorage.getGroupMetaByName(name);
      if (!group) {
        res.status(404).type('text/plain').send('Group not found');
        return;
      }

      if (group.visibility !== 'instance_public') {
        res.status(404).type('text/plain').send('Group not found');
        return;
      }

      const etag = buildWhitelistEtag({
        groupId: group.id,
        updatedAt: group.updatedAt,
        enabled: group.enabled,
      });
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');
      if (matchesIfNoneMatch(req, etag)) {
        res.status(304).end();
        return;
      }

      if (!group.enabled) {
        res.type('text/plain').send(`# Group "${group.displayName}" is currently disabled\n`);
        return;
      }

      const content = await groupsStorage.exportGroup(group.id);
      if (!content) {
        res.status(500).type('text/plain').send('Error exporting group');
        return;
      }

      res.type('text/plain').send(content);
    })();
  });
}
