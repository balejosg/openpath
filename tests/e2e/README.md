# E2E Tests

This directory contains End-to-End tests for the whitelist DNS system.

## Linux Tests

**File:** `linux-e2e-tests.sh`

Validates the complete Linux installation:

- dnsmasq service status
- Port 53 listening
- Whitelisted domains resolve correctly
- Non-whitelisted domains are blocked (NXDOMAIN)
- Configuration files exist
- Systemd timers active
- Firewall rules configured

**Usage:**

```bash
sudo ./linux-e2e-tests.sh
```

## Windows Tests

**File:** `Windows-E2E.Tests.ps1`

Pester tests validating the Windows installation:

- Directory structure
- Configuration file validity
- PowerShell modules load correctly
- DNS resolution functionality
- Firewall module functions
- Scheduled tasks API

**Usage:**

```powershell
Invoke-Pester -Path .\Windows-E2E.Tests.ps1 -Verbose
```

## CI Integration

These tests are automatically run by `.github/workflows/e2e-tests.yml` on:

- Push to main/master (when relevant files change)
- Pull requests
- Manual dispatch
