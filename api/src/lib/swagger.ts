/**
 * OpenAPI/Swagger Configuration
 *
 * Generates OpenAPI 3.0 specification from JSDoc comments.
 */

import swaggerJsdoc from 'swagger-jsdoc';

// =============================================================================
// Types
// =============================================================================

interface SwaggerOptions {
  definition: {
    openapi: string;
    info: {
      title: string;
      version: string;
      description: string;
      license: { name: string; url: string };
      contact: { name: string; url: string };
    };
    servers: { url: string; description: string }[];
    components: {
      securitySchemes: Record<string, unknown>;
      schemas: Record<string, unknown>;
    };
    tags: { name: string; description: string }[];
  };
  apis: string[];
}

// =============================================================================
// Configuration
// =============================================================================

const options: SwaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OpenPath API',
      version: '2.0.0',
      description: 'REST API for OpenPath domain access control system',
      license: {
        name: 'AGPL-3.0',
        url: 'https://www.gnu.org/licenses/agpl-3.0.en.html',
      },
      contact: {
        name: 'OpenPath',
        url: 'https://github.com/balejosg/openpath',
      },
    },
    servers: [
      {
        url: '/api',
        description: 'API endpoints',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        adminToken: {
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
          description: 'Admin token (Bearer admin-token)',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            code: { type: 'string' },
          },
        },
        Request: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            domain: { type: 'string', example: 'example.com' },
            reason: { type: 'string' },
            requester: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'teacher', 'user'] },
          },
        },
        Classroom: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            groups: { type: 'array', items: { type: 'string' } },
            activeGroup: { type: 'string' },
            machines: { type: 'array', items: { type: 'string' } },
          },
        },
        HealthCheck: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
            timestamp: { type: 'string', format: 'date-time' },
            checks: { type: 'object' },
          },
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Users', description: 'User management' },
      { name: 'Requests', description: 'Domain access requests' },
      { name: 'Classrooms', description: 'Classroom management' },
      { name: 'Schedules', description: 'Classroom reservations' },
      { name: 'Push', description: 'Push notifications' },
      { name: 'Health', description: 'Health and readiness checks' },
    ],
  },
  apis: ['./routes/*.js', './src/routes/*.ts', './server.js', './src/server.ts'],
};

let swaggerSpec: object | null = null;

/**
 * Get or generate the OpenAPI specification
 */
export function getSwaggerSpec(): object {
  swaggerSpec ??= swaggerJsdoc(options);
  return swaggerSpec;
}

export default { getSwaggerSpec };
