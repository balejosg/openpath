/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import 'dotenv/config';

import { createApp } from './app.js';
import { config } from './config.js';
import { createServerRuntime, shouldStartServerModule } from './server-runtime.js';

const { app } = await createApp(config);
const runtime = createServerRuntime(app, config, process.env);

let server: ReturnType<typeof app.listen> | undefined;
async function startServer(): Promise<ReturnType<typeof app.listen>> {
  return await runtime.startServer();
}

const shouldStartServer = shouldStartServerModule(import.meta.url, process.argv[1], process.env);

if (shouldStartServer) {
  server = await startServer();
  runtime.registerProcessHandlers();
}

export { app, server, startServer };
