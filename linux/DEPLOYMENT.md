# OpenPath Linux Agent - Deployment Guide

This guide covers installing and deploying the OpenPath Linux endpoint agent (dnsmasq + firewall + systemd services).

## Prerequisites

- Debian/Ubuntu-based Linux (recommended: Ubuntu 22.04 / 24.04)
- Root/sudo access
- Network connectivity to your whitelist URL (and optionally your API base URL)

## Installation Methods

### Method 1: APT (Recommended)

Bootstrap (sets up the APT repo and installs the package):

```bash
curl -fsSL https://balejosg.github.io/openpath/apt/apt-bootstrap.sh | sudo bash
```

Or, split setup + install:

```bash
curl -fsSL https://balejosg.github.io/openpath/apt/apt-setup.sh | sudo bash
sudo apt install openpath-dnsmasq

# Guided setup (enrollment)
sudo openpath setup
```

### Method 2: Install from Source

```bash
git clone https://github.com/balejosg/openpath.git
cd openpath/linux

# Basic install (provide the whitelist URL)
sudo ./install.sh --whitelist-url "https://your-server.example/export/group.txt"
```

### Method 3: Classroom Enrollment (Source Install)

If you use an API server for classroom enrollment, the installer can register the machine and write a tokenized whitelist URL.

```bash
cd openpath/linux
sudo ./install.sh \
  --classroom "Aula101" \
  --api-url "https://your-server.example" \
  --registration-token "YOUR_REGISTRATION_TOKEN"
```

### Method 4: Unattended / Mass Deployment

Use `--unattended` and pass all values via flags:

```bash
cd openpath/linux
sudo ./install.sh --unattended \
  --whitelist-url "https://your-server.example/w/YOUR_MACHINE_TOKEN/whitelist.txt" \
  --health-api-url "https://your-server.example" \
  --health-api-secret "YOUR_HEALTH_SECRET"
```

If enrolling via API:

```bash
cd openpath/linux
sudo ./install.sh --unattended \
  --classroom "Aula101" \
  --api-url "https://your-server.example" \
  --registration-token "YOUR_REGISTRATION_TOKEN"
```

## Post-Installation Verification

```bash
# Smoke tests
sudo smoke-test.sh --quick

# Status + diagnostics
openpath status
openpath test
sudo openpath health
```

## Configuration Locations

The agent stores configuration in `/etc/openpath/` (preserved across upgrades):

- `/etc/openpath/whitelist-url.conf`
- `/etc/openpath/health-api-url.conf`
- `/etc/openpath/health-api-secret.conf`
- `/etc/openpath/classroom.conf` (if enrolled)
- `/etc/openpath/api-url.conf` (if enrolled)
- `/etc/openpath/api-secret.conf` (if generated)

State/cache lives in `/var/lib/openpath/` (can be regenerated).

## Updating

- **APT installs**: `sudo apt update && sudo apt upgrade`
- **Source installs**: pull latest and re-run `sudo ./install.sh` (configuration under `/etc/openpath/` is preserved)

## Uninstallation

- **APT installs**: `sudo apt remove openpath-dnsmasq`
- **Source installs**: run `sudo ./uninstall.sh` from `openpath/linux/`
