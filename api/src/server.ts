/**
 * OpenPath - Strict Internet Access Control
 * Copyright (C) 2025 OpenPath Authors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * OpenPath Request API Server
 *
 * Home server deployment for handling domain requests.
 * Runs on your local network, exposed via DuckDNS.
 *
 * tRPC Routers (mounted at /trpc):
 *   auth        - Authentication (login, register, logout, refresh)
 *   users       - User management (admin only)
 *   requests    - Domain request handling
 *   classrooms  - Classroom/machine management
 *   schedules   - Schedule reservations
 *   push        - Push notification subscriptions
 *   healthReports - Client health reporting
 *   setup       - Initial setup endpoints
 *   healthcheck - Server health status
 *
 * Other Endpoints:
 *   GET /health - Basic health check
 */

import express from 'express';
import type { Request, Response, ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

// Structured logging with Winston
import { logger } from './lib/logger.js';

import { cleanRuleValue, getErrorMessage, validateRuleValue } from '@openpath/shared';
// Centralized configuration
import { config } from './config.js';

// Error tracking and request ID middleware
import { requestIdMiddleware, errorTrackingMiddleware } from './lib/error-tracking.js';

import * as roleStorage from './lib/role-storage.js';
import * as userStorage from './lib/user-storage.js';
import * as groupsStorage from './lib/groups-storage.js';
import * as classroomStorage from './lib/classroom-storage.js';
import * as setupStorage from './lib/setup-storage.js';
import { cleanupBlacklist, verifyAccessToken } from './lib/auth.js';
import { verifyEnrollmentToken } from './lib/enrollment-token.js';
import { generateEnrollmentToken } from './lib/enrollment-token.js';
import {
  generateMachineToken,
  hashMachineToken,
  buildWhitelistUrl,
} from './lib/machine-download-token.js';
import { onWhitelistChanged, emitWhitelistChanged, getListenerCount } from './lib/rule-events.js';

// Swagger/OpenAPI (optional - only load if dependencies installed and enabled)
let swaggerUi: typeof import('swagger-ui-express') | undefined;
let getSwaggerSpec: (() => object) | undefined;

if (config.enableSwagger) {
  try {
    swaggerUi = await import('swagger-ui-express');
    const swaggerModule = await import('./lib/swagger.js');
    getSwaggerSpec = swaggerModule.getSwaggerSpec;
    logger.debug('Swagger documentation enabled');
  } catch (err) {
    logger.warn('Swagger dependencies not installed - skipping documentation', { error: err });
  }
} else {
  logger.info('Swagger documentation disabled via configuration');
}

// ES module path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;
const HOST = config.host;

interface AutoRequestPayload {
  domain?: unknown;
  origin_page?: unknown;
  token?: unknown;
  hostname?: unknown;
  reason?: unknown;
}

function normalizeHostInput(value: string): string {
  return value.trim().toLowerCase();
}

function computeMachineProofToken(hostname: string, secret: string): string {
  return createHash('sha256')
    .update(hostname + secret)
    .digest('base64');
}

// =============================================================================
// Security Middleware
// =============================================================================

// Helmet - Security headers (OWASP recommended)
// In test/dev, allow localhost connections for E2E tests
const connectSrcDirectives = ["'self'", 'https://accounts.google.com'];
if (!config.isProduction) {
  connectSrcDirectives.push('http://localhost:*', 'ws://localhost:*');
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://unpkg.com',
          'https://accounts.google.com',
        ],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client', 'https://unpkg.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: connectSrcDirectives,
      },
    },
    frameguard: { action: 'deny' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  })
);

// =============================================================================
// CORS Configuration
// =============================================================================

const corsOrigins = config.corsAllowedOrigins;

// Warn if CORS is empty or wildcard in production
if (config.isProduction) {
  if (corsOrigins.length === 0) {
    logger.warn('CORS_ORIGINS not set in production - all cross-origin requests will be blocked');
  } else if (corsOrigins.includes('*')) {
    logger.warn('CORS_ORIGINS="*" in production - this is insecure, set explicit origins');
  }
}

app.use(
  cors({
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'trpc-batch-mode'],
    credentials: true,
  })
);

// Global rate limiter (skipped in test environment for rapid test execution)
const globalLimiter = rateLimit({
  windowMs: config.globalRateLimitWindowMs,
  max: config.globalRateLimitMax,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later',
    code: 'GLOBAL_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || (config.isTest && !config.enableRateLimitInTest),
});
app.use(globalLimiter);

// Endpoint-specific rate limiters for sensitive operations
// Skip in test environment to allow rapid test execution unless enabled

const authLimiter = rateLimit({
  windowMs: config.authRateLimitWindowMs,
  max: config.authRateLimitMax,
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: () => config.isTest && !config.enableRateLimitInTest,
});

const publicRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5, // 5 domain requests per minute per IP
  message: {
    success: false,
    error: 'Too many domain requests, please try again later',
    code: 'REQUEST_RATE_LIMITED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip ?? 'unknown',
  skip: () => config.isTest && !config.enableRateLimitInTest,
});

// Apply auth rate limiter to auth endpoints
app.use('/trpc/auth.login', authLimiter);
app.use('/trpc/auth.register', authLimiter);

// Apply public request limiter to domain request creation
app.use('/trpc/requests.create', publicRequestLimiter);

// JSON body parser
app.use(express.json({ limit: '10kb' }));

// Request ID middleware
app.use(requestIdMiddleware);

// Request logging with Winston
app.use(logger.requestMiddleware);

// =============================================================================
// Routes
// =============================================================================

// Basic health check for liveness probes
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'openpath-api' });
});

// Public configuration endpoint (no auth required)
// Exposes non-sensitive configuration needed by the SPA
app.get('/api/config', (_req, res) => {
  res.json({
    googleClientId: config.googleClientId,
  });
});

app.post('/api/requests/auto', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const body = req.body as AutoRequestPayload;

    const domainRaw = typeof body.domain === 'string' ? body.domain : '';
    const hostnameRaw = typeof body.hostname === 'string' ? body.hostname : '';
    const token = typeof body.token === 'string' ? body.token : '';
    const originPageRaw = typeof body.origin_page === 'string' ? body.origin_page : '';
    const reasonRaw = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!domainRaw || !hostnameRaw || !token) {
      res.status(400).json({
        success: false,
        error: 'domain, hostname and token are required',
      });
      return;
    }

    const sharedSecret = process.env.SHARED_SECRET;
    if (!sharedSecret) {
      res.status(500).json({ success: false, error: 'SHARED_SECRET not configured' });
      return;
    }

    const hostname = normalizeHostInput(hostnameRaw);
    const expectedToken = computeMachineProofToken(hostname, sharedSecret);
    if (token !== expectedToken) {
      logger.warn('Auto request rejected: invalid proof token', { hostname });
      res.status(403).json({ success: false, error: 'Invalid token proof' });
      return;
    }

    const normalizedDomain = cleanRuleValue(domainRaw, false);
    if (!normalizedDomain) {
      res.status(400).json({ success: false, error: 'Domain is required' });
      return;
    }

    const validation = validateRuleValue(normalizedDomain, 'whitelist');
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error ?? 'Invalid domain format',
      });
      return;
    }

    const groupContext = await classroomStorage.getWhitelistUrlForMachine(hostname);
    if (!groupContext) {
      res.status(404).json({
        success: false,
        error: 'No active group found for machine hostname',
      });
      return;
    }

    const targetGroupId = groupContext.groupId;
    const reasonText = reasonRaw.slice(0, 200);
    const sourceComment = originPageRaw
      ? `Auto-approved via Firefox extension (${originPageRaw.slice(0, 300)})${reasonText ? ` - ${reasonText}` : ''}`
      : `Auto-approved via Firefox extension${reasonText ? ` - ${reasonText}` : ''}`;

    const created = await groupsStorage.createRule(
      targetGroupId,
      'whitelist',
      normalizedDomain,
      sourceComment,
      'auto_extension'
    );

    if (!created.success && created.error !== 'Rule already exists') {
      res.status(400).json({ success: false, error: created.error ?? 'Could not create rule' });
      return;
    }

    res.json({
      success: true,
      approved: true,
      autoApproved: true,
      status: created.error === 'Rule already exists' ? 'duplicate' : 'approved',
      groupId: targetGroupId,
      domain: normalizedDomain,
      source: 'auto_extension',
      duplicate: created.error === 'Rule already exists',
    });

    // Notify SSE clients of the new rule
    if (created.error !== 'Rule already exists') {
      emitWhitelistChanged(targetGroupId);
    }
  })();
});

// Public endpoint for dnsmasq clients to fetch whitelist files
// This endpoint is unauthenticated to allow machines to fetch their whitelist
app.get('/export/:name.txt', (req: Request, res: Response): void => {
  const name = req.params.name;
  if (!name) {
    res.status(400).type('text/plain').send('Group name required');
    return;
  }

  void (async (): Promise<void> => {
    const group = await groupsStorage.getGroupByName(name);
    if (!group) {
      res.status(404).type('text/plain').send('Group not found');
      return;
    }

    // If group is disabled, return empty content (with header comment)
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

// =============================================================================
// Setup REST Endpoints (for SPA compatibility)
// =============================================================================

import { SetupService } from './services/index.js';

// Get setup status
app.get('/api/setup/status', (_req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const status = await SetupService.getStatus();
    res.json(status);
  })();
});

// Create first admin
app.post('/api/setup/first-admin', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const { email, name, password } = req.body as {
      email?: string;
      name?: string;
      password?: string;
    };

    if (!email || !name || !password) {
      res.status(400).json({
        success: false,
        error: 'Email, name, and password are required',
      });
      return;
    }

    const result = await SetupService.createFirstAdmin({ email, name, password });

    if (!result.ok) {
      const statusMap: Record<string, number> = {
        SETUP_ALREADY_COMPLETED: 403,
        EMAIL_EXISTS: 409,
        INVALID_INPUT: 400,
      };
      const statusCode = statusMap[result.error.code] ?? 400;
      res.status(statusCode).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    res.json(result.data);
  })();
});

// Get registration token (admin only)
app.get('/api/setup/registration-token', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    // TODO: Add JWT auth check here when migrating to full REST auth
    const result = await SetupService.getRegistrationToken();

    if (!result.ok) {
      res.status(404).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    res.json(result.data);
  })();
});

// Regenerate registration token (admin only)
app.post('/api/setup/regenerate-token', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    // TODO: Add JWT auth check here when migrating to full REST auth
    const result = await SetupService.regenerateToken();

    if (!result.ok) {
      res.status(404).json({
        success: false,
        error: result.error.message,
      });
      return;
    }

    res.json(result.data);
  })();
});

// =============================================================================
// Token Delivery REST Endpoints
// =============================================================================

const FAIL_OPEN_RESPONSE = '#DESACTIVADO\n';

app.post('/api/setup/validate-token', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const { token } = req.body as { token?: string };
    if (!token || typeof token !== 'string') {
      res.json({ valid: false });
      return;
    }
    const valid = await setupStorage.validateRegistrationToken(token);
    res.json({ valid });
  })();
});

app.post('/api/machines/register', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authorization header required' });
      return;
    }

    const providedToken = authHeader.slice(7);
    const enrollmentPayload = verifyEnrollmentToken(providedToken);

    const { hostname, classroomName, classroomId, version } = req.body as {
      hostname?: string;
      classroomName?: string;
      classroomId?: string;
      version?: string;
    };

    if (!hostname) {
      res.status(400).json({ success: false, error: 'hostname is required' });
      return;
    }

    let classroom: { id: string; name: string } | null = null;

    if (enrollmentPayload) {
      if (classroomId && classroomId !== enrollmentPayload.classroomId) {
        res
          .status(403)
          .json({ success: false, error: 'Enrollment token does not match classroom' });
        return;
      }
      classroom = await classroomStorage.getClassroomById(enrollmentPayload.classroomId);
      if (!classroom) {
        res.status(404).json({ success: false, error: 'Classroom not found' });
        return;
      }
    } else {
      const isValid = await setupStorage.validateRegistrationToken(providedToken);
      if (!isValid) {
        res.status(403).json({ success: false, error: 'Invalid registration token' });
        return;
      }

      if (!classroomName) {
        res.status(400).json({ success: false, error: 'classroomName is required' });
        return;
      }

      const found = await classroomStorage.getClassroomByName(classroomName);
      if (!found) {
        res.status(404).json({ success: false, error: `Classroom "${classroomName}" not found` });
        return;
      }
      classroom = found;
    }

    const machine = await classroomStorage.registerMachine({
      hostname,
      classroomId: classroom.id,
      ...(version ? { version } : {}),
    });

    const token = generateMachineToken();
    const tokenHash = hashMachineToken(token);
    await classroomStorage.setMachineDownloadTokenHash(machine.id, tokenHash);

    const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
    const whitelistUrl = buildWhitelistUrl(publicUrl, token);

    res.json({
      success: true,
      whitelistUrl,
      classroomName: classroom.name,
      classroomId: classroom.id,
    });
  })();
});

// Create a short-lived enrollment token for a classroom (teacher/admin)
app.post('/api/enroll/:classroomId/ticket', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Authorization header required' });
        return;
      }

      const accessToken = authHeader.slice(7);
      const decoded = await verifyAccessToken(accessToken);
      if (!decoded) {
        res.status(401).json({ success: false, error: 'Invalid access token' });
        return;
      }

      const roles = decoded.roles.map((r) => r.role);
      if (!roles.includes('admin') && !roles.includes('teacher')) {
        res.status(403).json({ success: false, error: 'Teacher access required' });
        return;
      }

      const classroomId = req.params.classroomId;
      if (!classroomId) {
        res.status(400).json({ success: false, error: 'classroomId parameter required' });
        return;
      }

      const classroom = await classroomStorage.getClassroomById(classroomId);
      if (!classroom) {
        res.status(404).json({ success: false, error: 'Classroom not found' });
        return;
      }

      const enrollmentToken = generateEnrollmentToken(classroom.id);

      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.json({
        success: true,
        enrollmentToken,
        classroomId: classroom.id,
        classroomName: classroom.name,
      });
    } catch (error) {
      logger.error('Enrollment ticket error', { error: getErrorMessage(error) });
      res.status(500).json({ success: false, error: 'Internal error' });
    }
  })();
});

// === Enrollment Script Endpoint ===
app.get('/api/enroll/:classroomId', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    try {
      const { classroomId } = req.params;
      const authHeader = req.headers.authorization;

      if (!classroomId) {
        res.status(400).send('Missing classroomId');
        return;
      }

      if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).send('Authorization header required');
        return;
      }

      const enrollmentToken = authHeader.slice(7);
      const payload = verifyEnrollmentToken(enrollmentToken);
      if (!payload) {
        res.status(403).send('Invalid enrollment token');
        return;
      }
      if (payload.classroomId !== classroomId) {
        res.status(403).send('Enrollment token does not match classroom');
        return;
      }

      const classroom = await classroomStorage.getClassroomById(classroomId);
      if (!classroom) {
        res.status(404).send('Classroom not found');
        return;
      }

      const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
      const aptRepoUrl = config.aptRepoUrl;
      if (!aptRepoUrl) {
        res.status(500).send('APT repo URL not configured');
        return;
      }

      const bashSingleQuote = (value: string): string => {
        // Bash-safe single-quoting: wrap in '...' and escape embedded single quotes with: '\''
        const escaped = value.replace(/'/g, "'\\''");
        return "'" + escaped + "'";
      };

      // Generate enrollment script with embedded values
      const script = `#!/bin/bash
set -euo pipefail

API_URL=${bashSingleQuote(publicUrl)}
CLASSROOM_ID=${bashSingleQuote(classroomId)}
CLASSROOM_NAME=${bashSingleQuote(classroom.name)}
ENROLLMENT_TOKEN=${bashSingleQuote(enrollmentToken)}
APT_REPO_SETUP_URL=${bashSingleQuote(`${aptRepoUrl}/apt-setup.sh`)}

 echo ''
echo '==============================================='
echo ' OpenPath Enrollment: '"$CLASSROOM_NAME"
echo '==============================================='
echo ''

# Must run as root
if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: Run with sudo"
    exit 1
fi

# Step 1: Set up APT repository
echo "[1/3] Configurando repositorio APT..."
if ! command -v openpath &>/dev/null; then
    tmpfile="$(mktemp)"
    trap 'rm -f "$tmpfile"' EXIT
    curl -fsSL --proto '=https' --tlsv1.2 "$APT_REPO_SETUP_URL" -o "$tmpfile"
    bash "$tmpfile"
    export DEBIAN_FRONTEND=noninteractive
    apt-get install -y openpath-dnsmasq
    echo "  OK: Paquete instalado"
else
    echo "  OK: Ya instalado, actualizando..."
    apt-get update -qq && apt-get install -y openpath-dnsmasq
fi

# Step 2: Enroll in classroom
echo "[2/3] Registrando en aula..."
openpath enroll --classroom-id "$CLASSROOM_ID" --api-url "$API_URL" --enrollment-token "$ENROLLMENT_TOKEN"

# Step 3: Verify
echo "[3/3] Verificando..."
openpath health || true

echo ""
echo "========================================="
echo "  OK - Equipo listo en aula: $CLASSROOM_NAME"
echo "========================================="
echo ""
`;

      res.setHeader('Content-Type', 'text/x-shellscript');
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline; filename="enroll.sh"');
      res.send(script);
    } catch (error) {
      logger.error('Enrollment script error', { error: getErrorMessage(error) });
      res.status(500).send('Internal error');
    }
  })();
});

app.post('/api/machines/:hostname/rotate-download-token', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authorization header required' });
      return;
    }

    const sharedSecret = process.env.SHARED_SECRET;
    if (!sharedSecret) {
      res.status(500).json({ success: false, error: 'SHARED_SECRET not configured' });
      return;
    }

    const providedSecret = authHeader.slice(7);
    if (providedSecret !== sharedSecret) {
      res.status(403).json({ success: false, error: 'Invalid shared secret' });
      return;
    }

    const hostname = req.params.hostname;
    if (!hostname) {
      res.status(400).json({ success: false, error: 'hostname parameter required' });
      return;
    }
    const machine = await classroomStorage.getMachineOnlyByHostname(hostname);
    if (!machine) {
      res.status(404).json({ success: false, error: `Machine "${hostname}" not found` });
      return;
    }

    const token = generateMachineToken();
    const tokenHash = hashMachineToken(token);
    await classroomStorage.setMachineDownloadTokenHash(machine.id, tokenHash);

    const publicUrl = config.publicUrl ?? `http://${config.host}:${String(config.port)}`;
    const whitelistUrl = buildWhitelistUrl(publicUrl, token);

    res.json({ success: true, whitelistUrl });
  })();
});

app.get('/w/:machineToken/whitelist.txt', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    try {
      const { machineToken } = req.params;
      if (!machineToken) {
        res.type('text/plain').send(FAIL_OPEN_RESPONSE);
        return;
      }

      const tokenHash = hashMachineToken(machineToken);
      const machine = await classroomStorage.getMachineByDownloadTokenHash(tokenHash);
      if (!machine) {
        res.type('text/plain').send(FAIL_OPEN_RESPONSE);
        return;
      }

      const whitelistInfo = await classroomStorage.getWhitelistUrlForMachine(machine.hostname);
      if (!whitelistInfo) {
        res.type('text/plain').send(FAIL_OPEN_RESPONSE);
        return;
      }

      const content = await groupsStorage.exportGroup(whitelistInfo.groupId);
      if (!content) {
        res.type('text/plain').send(FAIL_OPEN_RESPONSE);
        return;
      }

      await classroomStorage.updateMachineLastSeen(machine.hostname);
      res.type('text/plain').send(content);
    } catch (error) {
      logger.error('Error serving tokenized whitelist', { error: getErrorMessage(error) });
      res.type('text/plain').send(FAIL_OPEN_RESPONSE);
    }
  })();
});

// =============================================================================
// SSE Endpoint for Real-Time Rule Updates
// =============================================================================

app.get('/api/machines/events', (req: Request, res: Response): void => {
  void (async (): Promise<void> => {
    try {
      // Accept token from Authorization header (preferred) or query param (legacy)
      const authHeader = req.headers.authorization;
      const machineToken = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : typeof req.query.token === 'string'
          ? req.query.token
          : '';
      if (!machineToken) {
        res
          .status(401)
          .json({ success: false, error: 'Machine token required (Authorization: Bearer or query param)' });
        return;
      }

      // Authenticate with the same token used for whitelist download
      const tokenHash = hashMachineToken(machineToken);
      const machine = await classroomStorage.getMachineByDownloadTokenHash(tokenHash);
      if (!machine) {
        res.status(403).json({ success: false, error: 'Invalid machine token' });
        return;
      }

      // Find which group this machine should watch
      const whitelistInfo = await classroomStorage.getWhitelistUrlForMachine(machine.hostname);
      if (!whitelistInfo) {
        res.status(404).json({ success: false, error: 'No active group for this machine' });
        return;
      }

      const groupId = whitelistInfo.groupId;

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      });

      // Send initial connection event
      res.write(
        `data: ${JSON.stringify({ event: 'connected', groupId, hostname: machine.hostname })}\n\n`
      );

      logger.info('SSE client connected', {
        hostname: machine.hostname,
        groupId,
        listeners: getListenerCount() + 1,
      });

      // Update machine last-seen on SSE connection
      await classroomStorage.updateMachineLastSeen(machine.hostname);

      // Subscribe to whitelist changes for this group
      const unsubscribe = onWhitelistChanged(groupId, () => {
        try {
          res.write(`data: ${JSON.stringify({ event: 'whitelist-changed', groupId })}\n\n`);
        } catch {
          // Client disconnected — let cleanup handle it
        }
      });

      // Keep-alive ping every 30 seconds
      const keepAliveInterval = setInterval(() => {
        try {
          res.write(': keep-alive\n\n');
        } catch {
          clearInterval(keepAliveInterval);
        }
      }, 30_000);

      // Cleanup on client disconnect
      req.on('close', () => {
        unsubscribe();
        clearInterval(keepAliveInterval);
        logger.info('SSE client disconnected', {
          hostname: machine.hostname,
          groupId,
          listeners: getListenerCount(),
        });
      });
    } catch (error) {
      logger.error('SSE endpoint error', { error: getErrorMessage(error) });
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Internal error' });
      }
    }
  })();
});

// Swagger/OpenAPI documentation
if (swaggerUi && getSwaggerSpec) {
  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(getSwaggerSpec(), {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'OpenPath API Documentation',
    })
  );
  app.get('/api-docs.json', (_req: Request, res: Response): void => {
    res.setHeader('Content-Type', 'application/json');
    res.send(getSwaggerSpec());
  });
}

// tRPC Adapter
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './trpc/routers/index.js';
import { createContext } from './trpc/context.js';

app.use(
  '/trpc',
  createExpressMiddleware({
    router: appRouter,
    createContext,
  })
);

// v2 UI and API endpoints are removed. Keep an explicit 404 to avoid
// accidental SPA fallbacks or proxying.
app.use('/v2', (_req, res) => {
  res.status(404).type('text/plain').send('Not found');
});

// Serve SPA static files
// Detect if running from dist/ (compiled) or src/ (tsx dev)
const isCompiledCode = __dirname.includes('/dist');

// React SPA served from /
const reactSpaPath = isCompiledCode
  ? path.join(__dirname, '../../../react-spa/dist')
  : path.join(__dirname, '../../react-spa/dist');

logger.info('React SPA path check', {
  path: reactSpaPath,
  exists: fs.existsSync(reactSpaPath),
  __dirname,
  isCompiledCode,
});

// Solo servir si existe el directorio de build
if (fs.existsSync(reactSpaPath)) {
  app.use(express.static(reactSpaPath));
  logger.info('React SPA enabled at /');
}

// SPA fallback (HTML) - must come after API routes and static files.
// Only serve for non-API paths so unknown API endpoints can return JSON 404.
if (fs.existsSync(reactSpaPath)) {
  app.get('*', (req: Request, res: Response, next) => {
    const url = req.originalUrl || req.url;
    if (url.startsWith('/api') || url.startsWith('/trpc') || url.startsWith('/api-docs')) {
      next();
      return;
    }
    res.sendFile(path.join(reactSpaPath, 'index.html'));
  });
}

// =============================================================================
// Error Handling
// =============================================================================
// Error Handling
// =============================================================================

interface SyntaxErrorWithBody extends SyntaxError {
  status?: number;
  body?: unknown;
}

// JSON parsing error handler
const jsonErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (err instanceof SyntaxError && (err as SyntaxErrorWithBody).status === 400 && 'body' in err) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON in request body',
      code: 'INVALID_JSON',
    });
    return;
  }
  next(err);
};
app.use(jsonErrorHandler);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
});

// Global error handler
app.use(errorTrackingMiddleware);

// =============================================================================
// Start Server
// =============================================================================

let server: ReturnType<typeof app.listen> | undefined;
let isShuttingDown = false;
const SHUTDOWN_TIMEOUT_MS = 30000;

const gracefulShutdown = (signal: string): void => {
  if (isShuttingDown) {
    logger.warn(`Shutdown already in progress, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`Received ${signal}, starting graceful shutdown...`);

  const forceShutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  const finish = (exitCode: number): void => {
    clearTimeout(forceShutdownTimeout);
    process.exit(exitCode);
  };

  if (server === undefined) {
    logger.info('No active server instance to close');
    finish(0);
    return;
  }

  server.close((err) => {
    if (err) {
      logger.error('Error during server close', { error: err.message });
      finish(1);
      return;
    }
    logger.info('Server closed, no longer accepting connections');
    finish(0);
  });
};

// Start server when run directly
const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;

if (isMainModule) {
  const serverStartTime = new Date();

  // Initialize database schema before accepting connections
  if (process.env.SKIP_DB_MIGRATIONS !== 'true') {
    const { initializeSchema } = await import('./db/index.js');
    await initializeSchema();
  } else {
    logger.warn('Skipping database migrations (SKIP_DB_MIGRATIONS=true)');
  }

  server = app.listen(PORT, HOST, () => {
    void (async (): Promise<void> => {
      // SECURITY: Clean up expired blacklisted tokens on startup
      try {
        await cleanupBlacklist();
        logger.info('Token blacklist cleanup completed');
      } catch (error) {
        logger.warn('Token blacklist cleanup failed', { error: getErrorMessage(error) });
      }

      logger.info('Server started', {
        host: HOST,
        port: String(PORT),
        env: process.env.NODE_ENV,
        apiId: process.env.API_ID,
        startup_time: {
          start: serverStartTime.toISOString(),
          elapsed_ms: String(Date.now() - serverStartTime.getTime()),
        },
      });

      if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        const existingAdmin = await userStorage
          .getUserByEmail(process.env.ADMIN_EMAIL)
          .catch(() => null);

        if (!existingAdmin) {
          logger.info('Creating default admin user from environment variables...');
          try {
            const admin = await userStorage.createUser({
              email: process.env.ADMIN_EMAIL,
              name: 'System Admin',
              password: process.env.ADMIN_PASSWORD,
            });

            await roleStorage.assignRole({
              userId: admin.id,
              role: 'admin',
              groupIds: [],
            });

            logger.info(`Default admin user created: ${admin.email}`);
          } catch (error) {
            logger.error('Failed to create default admin user', { error: getErrorMessage(error) });
          }
        }
      }

      logger.info('');
      logger.info('╔═══════════════════════════════════════════════════════╗');
      logger.info('║       OpenPath Request API Server                     ║');
      logger.info('╚═══════════════════════════════════════════════════════╝');
      const baseUrl = config.publicUrl ?? `http://${HOST}:${String(PORT)}`;
      logger.info(`Server is running on ${baseUrl}`);
      if (swaggerUi) {
        logger.info(`API Documentation: ${baseUrl}/api-docs`);
      }
      logger.info(`Health Check: ${baseUrl}/health`);
      logger.info('─────────────────────────────────────────────────────────');
      logger.info('');
    })();
  });
  const adminToken = process.env.ADMIN_TOKEN;
  if (adminToken === undefined || adminToken === '') {
    logger.warn('ADMIN_TOKEN not set - admin endpoints will fail');
  }

  process.on('SIGTERM', () => {
    gracefulShutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    gracefulShutdown('SIGINT');
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', {
      error: err.message,
      stack: err.stack,
    });
    gracefulShutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });
}

// Export for testing
export { app, server };
