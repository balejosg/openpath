# OpenPath Request API

Home server REST API for handling domain whitelist requests.

## Overview

This is a **Node.js (TypeScript)** server designed to run on your home network. It handles domain requests and provides an admin API using **Express.js** and **tRPC** for type-safe communication.

## Architecture

```
Firefox Extension → OpenPath API (PostgreSQL) → GitHub Repository
                         ↓
                    Admin Dashboard (SPA)
```

## Quick Start

### 1. Install dependencies

```bash
# Install all dependencies from root
npm install

# Or build shared package first
npm run build --workspace=@openpath/shared
cd api && npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your settings
```

Required settings:

- `ADMIN_TOKEN`: Secret token for admin endpoints
- `GITHUB_TOKEN`: GitHub Personal Access Token (with repo write access)
- `GITHUB_OWNER`: GitHub username/org owning the whitelist repo
- `GITHUB_REPO`: Repository name

### 3. Run the server

```bash
# Development (with auto-reload)
npm run dev

# Production
npm run build
npm start
```

### 4. Test it

```bash
# Health check
curl http://localhost:3000/health

# Submit a request
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{"domain": "example.com", "reason": "Testing"}'

# List requests (admin)
curl http://localhost:3000/api/requests \
  -H "Authorization: Bearer your-admin-token"
```

## API Documentation (Swagger UI)

Interactive API documentation is available at `/api-docs` when the server is running:

```
http://localhost:3000/api-docs
```

Features:

- Browse all endpoints with descriptions
- Try API calls directly from the browser
- View request/response schemas
- Download OpenAPI spec at `/api-docs.json`

## API Endpoints

## API Interfaces

The server exposes two types of interfaces:

1. **REST API**: For standard HTTP requests, webhooks, and legacy clients.
2. **tRPC API**: For type-safe communication with the SPA dashboard.

### Setup Endpoints (First-time Configuration)

| Method | Endpoint                        | Auth  | Description                        |
| ------ | ------------------------------- | ----- | ---------------------------------- |
| GET    | `/api/setup/status`             | None  | Check if initial setup is needed   |
| POST   | `/api/setup/first-admin`        | None  | Create first admin user (one-time) |
| POST   | `/api/setup/validate-token`     | None  | Validate registration token        |
| GET    | `/api/setup/registration-token` | Admin | Get current registration token     |
| POST   | `/api/setup/regenerate-token`   | Admin | Generate new registration token    |

### Public Endpoints

| Method | Endpoint                   | Description                   |
| ------ | -------------------------- | ----------------------------- |
| GET    | `/health`                  | Health check (liveness probe) |
| GET    | `/health/ready`            | Readiness probe               |
| GET    | `/api`                     | API endpoint listing          |
| GET    | `/api-docs`                | Swagger UI documentation      |
| GET    | `/api-docs.json`           | OpenAPI 3.0 spec (JSON)       |
| POST   | `/api/requests`            | Submit domain request         |
| GET    | `/api/requests/status/:id` | Check request status          |

### Admin Endpoints (require `Authorization: Bearer <token>`)

| Method | Endpoint                    | Description              |
| ------ | --------------------------- | ------------------------ |
| GET    | `/api/requests`             | List all requests        |
| GET    | `/api/requests/:id`         | Get request details      |
| POST   | `/api/requests/:id/approve` | Approve & push to GitHub |
| POST   | `/api/requests/:id/reject`  | Reject request           |
| DELETE | `/api/requests/:id`         | Delete request           |
| GET    | `/api/requests/groups/list` | List whitelist groups    |

## Initial Setup Flow

### 1. Deploy the Server

```bash
cd api
npm install
npm run build
npm start
```

### 2. Create First Admin

Navigate to `http://your-server:3000/` - the setup wizard will appear automatically:

1. Enter admin email, name, and password (min 8 characters)
2. Click "Create Administrator"
3. **Save the Registration Token** - you'll need it to register client PCs

### 3. Verify Setup

```bash
# Check setup status
curl http://localhost:3000/api/setup/status
# Should return: {"needsSetup": false, "hasAdmin": true}
```

### 4. Get Registration Token (Admin)

```bash
# Login first
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@school.edu", "password": "your-password"}'

# Use the returned JWT token to get registration token
curl http://localhost:3000/api/setup/registration-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. Regenerate Token (if compromised)

```bash
curl -X POST http://localhost:3000/api/setup/regenerate-token \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Request/Response Examples

### Submit Request

```bash
curl -X POST http://localhost:3000/api/requests \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "docs.google.com",
    "reason": "Need Google Docs for class project",
    "requester_email": "student@school.edu",
    "group_id": "informatica-3"
  }'
```

Response:

```json
{
  "success": true,
  "request_id": "req_a1b2c3d4",
  "status": "pending",
  "domain": "docs.google.com",
  "message": "Request created, waiting for admin approval",
  "created_at": "2025-12-17T10:30:00.000Z"
}
```

### Approve Request

```bash
curl -X POST http://localhost:3000/api/requests/req_a1b2c3d4/approve \
  -H "Authorization: Bearer your-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"group_id": "informatica-3"}'
```

Response:

```json
{
  "success": true,
  "message": "Domain docs.google.com approved and added to informatica-3",
  "domain": "docs.google.com",
  "group_id": "informatica-3",
  "status": "approved"
}
```

## Deployment

### Option A: Direct (recommended for testing)

```bash
npm start
```

### Option B: PM2 (production)

```bash
npm install -g pm2
pm2 start server.js --name openpath-api
pm2 save
pm2 startup
```

### Option C: Docker

```bash
docker compose up -d
```

### Option D: Systemd service

Create `/etc/systemd/system/openpath-api.service`:

```ini
[Unit]
Description=OpenPath Request API
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/openpath/api
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10
EnvironmentFile=/home/pi/openpath/api/.env

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable openpath-api
sudo systemctl start openpath-api
```

## Network Setup

### 1. Static local IP

Set a static IP for your server in your router's DHCP settings.

### 2. DuckDNS

Already configured (Phase 1). Your domain points to your public IP.

### 3. Port forwarding

Forward port 443 (or 3000) from your router to your server's local IP.

### 4. SSL (Phase 3)

For HTTPS, use Caddy or nginx with Let's Encrypt.

## Files

```
api/
├── src/                # TypeScript Source Code
│   ├── server.ts       # Main entry point
│   ├── trpc/           # tRPC Router definitions
│   │   ├── routers/    # All routers (index.ts is Main AppRouter)
│   │   └── context.ts  # Request context
│   └── lib/
│       ├── storage.ts  # PostgreSQL-backed storage
│       └── github.ts   # GitHub API client
├── dist/               # Compiled JavaScript (Production)
├── tests/              # Test suite
└── package.json
```

## Security Notes

### Token Generation

1. **ADMIN_TOKEN**: Generate a secure token:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **JWT_SECRET** (required in production):

   ```bash
   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
   ```

3. **GITHUB_TOKEN**: Create at https://github.com/settings/tokens with `repo` scope

### Security Features

- **Helmet.js**: Security headers (CSP, X-Frame-Options, HSTS, etc.)
- **Rate Limiting**: Protection against brute force and DDoS
- **CORS**: Restricted to specific origins in production (set `CORS_ORIGINS`)
- **JWT Authentication**: Access + refresh tokens with blacklist support
- **Input Validation**: Joi schemas for all endpoints
- **Structured Logging**: Winston with request tracking

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Set `JWT_SECRET` (server will fail to start without it)
- [ ] Set `CORS_ORIGINS` to your specific domains
- [ ] Use HTTPS (Caddy, nginx, or Cloudflare Tunnel)
- [ ] Set up log rotation for `logs/` directory

## Continuous Deployment

This API is automatically deployed to production on every push to `main` that modifies files in `api/`. The GitHub Actions workflow handles:

- Pulling latest code
- Installing dependencies
- Restarting the service
- Health check verification
