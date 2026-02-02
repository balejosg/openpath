# OpenPath

[![CI](https://github.com/balejosg/openpath/actions/workflows/ci.yml/badge.svg)](https://github.com/balejosg/openpath/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/balejosg/openpath/branch/main/graph/badge.svg)](https://codecov.io/gh/balejosg/openpath)

**Strict Internet Access Control. Zero Administration Headaches.**

OpenPath is a robust, "default-deny" internet access control system designed for classrooms, laboratories, and corporate environments. It blocks everything by default, allowing only explicitly approved domains.

Unlike traditional firewalls that require manual rule updates and complex VPNs, OpenPath decentralizes enforcement to the endpoints while centralizing control in a modern web dashboard.

## Why OpenPath?

- **🚫 Default Deny Security**: If it's not whitelisted, it doesn't exist. Eliminate distractions and security risks at the DNS level.
- **🧠 GitOps Logic**: Your whitelist is just a text file in a GitHub repository. Every change is a commit. You get version history, audit logs, and instant rollbacks for free.
- **⚡ Self-Service Workflow**: Users hitting a block page can request access instantly. Admins approve requests in a dashboard, and the system handles the rest.
- **🛡️ Resilient Architecture**: Endpoints download and cache rules locally. If your central server or internet connection goes down, the filtering rules remain active.
- **🔋 Batteries Included**: Comes with DNS sinkholing (dnsmasq), firewall rules (iptables), and browser policies (Firefox/Chrome) out of the box.

---

## How It Works

1. **The User** tries to access `blocked-site.com`. Access is denied.
2. **The Request**: User submits an unblock request via the portal.
3. **The Decision**: Admin reviews the request in the Dashboard and clicks "Approve".
4. **The Magic**: The system commits the change to the GitHub repository.
5. **The Sync**: All connected endpoints pull the new whitelist within minutes.

## Installation

### Central Server (Required for Classroom Deployment)

For classroom or multi-PC deployments, you need a central server to manage users, schedules, and PC registration.

#### 1. Deploy the API Server

```bash
# Clone the repository
git clone https://github.com/balejosg/openpath.git
cd openpath/api

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (JWT_SECRET, PORT, etc.)

# Build and start
npm run build
npm start
```

The server will start on port 3000 by default.

#### 2. Create the First Admin

Navigate to `http://your-server-ip:3000/` in your browser. On first run, the setup wizard will appear automatically:

1. Enter your administrator email and password
2. Copy the **Registration Token** shown after creation
3. Keep this token secure - you'll need it to register client PCs

**Important:** The registration token is required for all client PC installations in classroom mode. You can retrieve or regenerate it later from the dashboard.

### Client PC Installation

#### Linux (Standalone Mode)

One-line installation via APT. Sets up `dnsmasq`, `iptables` rules, and the update watchdog.

```bash
# Setup repository and install
curl -fsSL https://balejosg.github.io/openpath/apt/apt-setup.sh | sudo bash
sudo apt install openpath-dnsmasq
```

#### Linux (Classroom Mode)

Install with classroom registration:

```bash
# Download install script
curl -O https://raw.githubusercontent.com/balejosg/openpath/main/linux/install.sh
chmod +x install.sh

# Install with registration token
sudo ./install.sh \
  --classroom "Aula-1" \
  --api-url "http://your-server-ip:3000" \
  --registration-token "your-64-character-token-here"
```

The PC will be registered in the central server and can be managed remotely.

### Windows

PowerShell-based installation using Acrylic DNS Proxy.

```powershell
./windows/Install-OpenPath.ps1
```

## Technologies

- **Backend**: Node.js, TypeScript, Express.js, tRPC, Zod
- **Frontend**: TypeScript, Vanilla CSS, HTML (No framework, ES Modules)
- **Infrastructure**: Linux, Docker, Systemd, Git
- **Testing**: Playwright (E2E), Node.js Test Runner, BATS (Bash)

## System Architecture

The ecosystem consists of four main pillars:

1. **Request API**: Node.js backend that handles user requests and telemetry.
2. **Dashboard**: Web interface for visualizing requests, managing domain groups, and monitoring endpoint health.
3. **Endpoint Agents**: Lightweight scripts (Bash/PowerShell) running on client machines. They enforce rules via `dnsmasq` or `Acrylic`.
4. **Git Storage**: The single source of truth. All rules live in `whitelist.txt` in your repo.

## Configuration

### Required Environment Variables (API Server)

The API server requires these environment variables in production:

| Variable       | Required | Description                                                              |
| -------------- | -------- | ------------------------------------------------------------------------ |
| `JWT_SECRET`   | **Yes**  | Secret for signing JWT tokens (64+ chars recommended)                    |
| `CORS_ORIGINS` | **Yes**  | Comma-separated list of allowed origins (e.g., `https://yourdomain.com`) |
| `GITHUB_OWNER` | **Yes**  | GitHub username/org owning your whitelist repo                           |
| `GITHUB_REPO`  | **Yes**  | Repository name for whitelists                                           |
| `GITHUB_TOKEN` | **Yes**  | GitHub PAT with repo write access                                        |
| `DATABASE_URL` | **Yes**  | PostgreSQL connection string                                             |

Optional but recommended:

| Variable            | Default | Description            |
| ------------------- | ------- | ---------------------- |
| `PORT`              | `3000`  | Server port            |
| `VAPID_PUBLIC_KEY`  | -       | For push notifications |
| `VAPID_PRIVATE_KEY` | -       | For push notifications |

See `api/.env.example` for a complete list.

### Changing the Whitelist URL

Point your agents to your own repository:

```bash
echo "https://your-repo.com/whitelist.txt" | sudo tee /etc/openpath/whitelist-url.conf
sudo openpath update
```

### Whitelist Format

Simple, readable text format.

```ini
## WHITELIST
google.com
github.com
# Comments are allowed

## BLOCKED-SUBDOMAINS
# Allow domain.com but block ads.domain.com
ads.domain.com

## BLOCKED-PATHS
# Browser-level blocking (advanced)
facebook.com/gaming
```

### Registration Token Management

For classroom deployments, the registration token controls which PCs can register with the central server.

**View Current Token:**

After logging in to the dashboard, navigate to Settings to view the current registration token.

**Via API (requires admin authentication):**

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://your-server:3000/api/setup/registration-token
```

**Regenerate Token:**

If your token is compromised, regenerate it via the dashboard or API:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://your-server:3000/api/setup/regenerate-token
```

After regeneration, the old token becomes invalid. You'll need to use the new token for future PC installations.

**Security Notes:**

- Keep the registration token secure - anyone with it can register PCs to your server
- Regenerate the token if you suspect it has been compromised
- The token is stored in the `settings` table in PostgreSQL

## Troubleshooting

### Check Status

```bash
openpath status
```

### Force Update

```bash
openpath update
```

**Emergency Disable**
Add `#DESACTIVADO` to the start of your remote whitelist file. Endpoints will pick it up and fail-open (disable all blocking) automatically.

---

**License**: [AGPL-3.0](LICENSE) (Open Source). See [LICENSING.md](LICENSING.md) for details.
