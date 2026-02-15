# OpenPath Linux Agent — Deployment Guide

## Prerequisites

- Debian/Ubuntu-based Linux (Debian 11+, Ubuntu 20.04+)
- Root/sudo access
- Network connectivity to OpenPath API server
- `curl`, `dnsmasq`, `iptables` (installed automatically)

---

## Installation Methods

### Method 1: Debian Package (Recommended)

```bash
# Download latest .deb from GitHub Releases
curl -LO https://github.com/balejosg/Whitelist/releases/latest/download/openpath-dnsmasq.deb

# Install
sudo dpkg -i openpath-dnsmasq.deb
sudo apt-get -f install  # resolve any dependencies
```

### Method 2: Manual Install from Source

```bash
git clone https://github.com/balejosg/Whitelist.git
cd Whitelist/linux

# Basic install (provide whitelist URL)
sudo ./install.sh --whitelist-url "https://your-api.example.com/w/TOKEN/whitelist.txt"

# Classroom mode (auto-enrollment)
sudo ./install.sh \
  --classroom "Aula101" \
  --api-url "https://your-api.example.com" \
  --shared-secret "your-shared-secret"
```

### Method 3: Unattended / Mass Deployment

```bash
# Non-interactive install with all parameters
sudo WHITELIST_URL="https://api.example.com/w/TOKEN/whitelist.txt" \
     HEALTH_API_URL="https://api.example.com/api/health" \
     HEALTH_API_SECRET="secret123" \
     ./install.sh --unattended
```

---

## Mass Deployment (Ansible Example)

```yaml
# playbook.yml
- hosts: lab_computers
  become: true
  vars:
    openpath_api: "https://openpath.school.edu"
    classroom: "{{ inventory_hostname | regex_replace('pc-', '') }}"
    shared_secret: "{{ vault_shared_secret }}"

  tasks:
    - name: Copy OpenPath deb package
      copy:
        src: openpath-dnsmasq.deb
        dest: /tmp/openpath-dnsmasq.deb

    - name: Install OpenPath
      apt:
        deb: /tmp/openpath-dnsmasq.deb

    - name: Enroll in classroom
      command: >
        openpath enroll
        --classroom {{ classroom }}
        --api-url {{ openpath_api }}
        --shared-secret {{ shared_secret }}
      args:
        creates: /etc/openpath/classroom.conf
```

---

## Post-Installation Verification

```bash
# Run smoke tests
sudo /usr/local/lib/openpath/smoke-test.sh

# Full status check
sudo openpath status

# Verify DNS filtering
sudo openpath test

# Check health
sudo openpath health
```

---

## Configuration Overrides

Create `/etc/openpath/overrides.conf` to customize behavior:

```bash
# Example overrides.conf

# Use Cloudflare as fallback DNS instead of Google
OPENPATH_FALLBACK_DNS=1.1.1.1
OPENPATH_FALLBACK_DNS_SECONDARY=1.0.0.1

# Increase whitelist expiration to 48 hours for unreliable networks
OPENPATH_WHITELIST_MAX_AGE_HOURS=48

# Limit max domains to 200
OPENPATH_MAX_DOMAINS=200

# Adjust update polling interval (minutes)
OPENPATH_TIMER_INTERVAL=10

# Custom captive portal detection URL
OPENPATH_CAPTIVE_PORTAL_URL=http://connectivitycheck.gstatic.com/generate_204
```

---

## Updating the Agent

```bash
# Check for updates
sudo openpath self-update --check

# Install update
sudo openpath self-update

# Force reinstall same version
sudo openpath self-update --force
```

---

## Uninstallation

```bash
# Interactive uninstall
sudo /usr/local/lib/openpath/uninstall.sh

# Non-interactive (for automation)
sudo /usr/local/lib/openpath/uninstall.sh --auto-yes

# Via dpkg
sudo dpkg -r openpath-dnsmasq
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  OpenPath Agent                      │
├──────────────────┬──────────────────────────────────┤
│  openpath CLI    │  Unified command interface        │
├──────────────────┼──────────────────────────────────┤
│  SSE Listener    │  Real-time rule updates           │
│  Update Timer    │  5-min fallback polling           │
│  Watchdog Timer  │  1-min health check + recovery    │
│  Captive Portal  │  WiFi login auto-detection        │
├──────────────────┼──────────────────────────────────┤
│  dnsmasq         │  DNS sinkhole (whitelist-only)    │
│  iptables        │  Firewall (block bypass methods)  │
│  Browser Policy  │  Chrome/Firefox URL enforcement   │
└──────────────────┴──────────────────────────────────┘
```

### Services

| Service | Type | Purpose |
|---------|------|---------|
| `openpath-dnsmasq.timer` | Timer (5min) | Fallback whitelist polling |
| `dnsmasq-watchdog.timer` | Timer (1min) | Health check + integrity |
| `openpath-sse-listener.service` | Persistent | Real-time SSE updates |
| `captive-portal-detector.service` | Persistent | WiFi portal detection |
| `dnsmasq.service` | Persistent | DNS filtering engine |

### Security Layers

1. **DNS Sinkhole** — Only whitelisted domains resolve
2. **Firewall** — Blocks external DNS (53), DoT (853), DoH IPs, VPNs, Tor
3. **Browser Policies** — Chrome/Firefox URL allowlists enforced
4. **Anti-Tampering** — SHA-256 integrity checks every minute
5. **Sudoers Hardening** — Only read-only commands run passwordless
