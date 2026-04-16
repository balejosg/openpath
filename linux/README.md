# OpenPath Linux Agent

> Status: maintained
> Applies to: `linux/`
> Last verified: 2026-04-13
> Source of truth: `linux/README.md`

The Linux agent enforces OpenPath policy on Debian/Ubuntu-class machines using `dnsmasq`, firewall rules, browser policy helpers, SSE updates, and a local operational CLI.

## Installation Paths

Supported entrypoints today:

- source installer: `linux/install.sh`
- APT bootstrap flow: `linux/scripts/build/apt-bootstrap.sh`
- package build/publish flow documented in [`DEPLOYMENT.md`](DEPLOYMENT.md)

Quick local/source install:

```bash
cd linux
sudo ./install.sh
```

Classroom-oriented setup after install:

```bash
sudo openpath setup
```

Managed browser requests require completed setup. Browser integration helpers
will not install or reconcile the unblock-request flow until `api-url.conf`,
classroom state, and a tokenized `whitelist-url.conf` are present.

## Runtime Commands

The installed CLI exposes:

- `openpath status`
- `openpath update`
- `openpath test`
- `openpath logs`
- `openpath log [N]`
- `openpath domains [text]`
- `openpath check <domain>`
- `openpath health`
- `openpath force`
- `openpath enable`
- `openpath disable`
- `openpath restart`
- `openpath setup`
- `openpath rotate-token`
- `openpath enroll`
- `openpath self-update`

## Installed Services

Current systemd units include:

- `dnsmasq`
- `openpath-dnsmasq.timer`
- `openpath-agent-update.timer`
- `dnsmasq-watchdog.timer`
- `captive-portal-detector.service`
- `openpath-sse-listener.service`

## Verification

```bash
cd tests && bats *.bats
npm run test:installer:linux
npm run test:installer:apt
npm run test:student-policy:linux
```

Operator-facing deployment details live in [`DEPLOYMENT.md`](DEPLOYMENT.md). Linux-specific diagnosis steps live in [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md).
