# Migration Guide

This guide covers upgrading between OpenPath versions.

## Version Compatibility

| From Version | To Version | Migration Path            |
| ------------ | ---------- | ------------------------- |
| 3.0 - 3.4    | 3.5        | Standard upgrade          |
| 2.x          | 3.5        | Fresh install recommended |
| 1.x          | 3.5        | Fresh install required    |

## Standard Upgrade (3.0+ to 3.5)

### Prerequisites

1. **Backup current configuration:**

   ```bash
   sudo tar -czvf openpath-backup.tar.gz \
       /etc/openpath/ \
       /etc/dnsmasq.d/openpath.conf \
       /etc/firefox/policies/policies.json
   ```

2. **Stop services:**
   ```bash
   sudo systemctl stop openpath-dnsmasq.timer
   sudo systemctl stop dnsmasq-watchdog.timer
   ```

### Upgrade Steps

1. **Get the latest code:**

   ```bash
   cd /path/to/whitelist
   git pull origin main
   ```

2. **Run the installer:**

   ```bash
   cd linux
   sudo ./install.sh
   ```

   The installer will detect the existing installation and preserve configuration.

3. **Verify the upgrade:**
   ```bash
   sudo openpath health
   openpath status
   ```

### Breaking Changes in 3.5

**Configuration Paths:**

- Configuration files now in `/etc/openpath/` (previously `/var/lib/openpath/`)
- State files remain in `/var/lib/openpath/`
- The installer migrates these automatically

**New Environment Variables:**

- Shell libraries now respect environment overrides:
  - `LOG_FILE` - Log file path
  - `ETC_CONFIG_DIR` - Configuration directory
  - `VAR_STATE_DIR` - State directory
  - `DNSMASQ_CONF` - dnsmasq config path

**API Changes:**

- Test scripts now require `NODE_ENV=test` for rate limiting bypass
- All API test scripts updated automatically

## Fresh Install (from 2.x or 1.x)

Older versions have incompatible configurations. A fresh install is recommended.

### Steps

1. **Uninstall old version:**

   ```bash
   # Stop services
   sudo systemctl stop dnsmasq-url-whitelist.timer 2>/dev/null
   sudo systemctl stop dnsmasq-watchdog.timer 2>/dev/null

   # Remove old files
   sudo rm -rf /usr/local/lib/dnsmasq-whitelist
   sudo rm -f /usr/local/bin/dnsmasq-*.sh
   sudo rm -f /etc/dnsmasq.d/url-whitelist.conf
   ```

2. **Clean up old configurations:**

   ```bash
   sudo rm -rf /var/lib/dnsmasq-whitelist
   sudo rm -rf /etc/dnsmasq-whitelist
   ```

3. **Install OpenPath 3.5:**
   ```bash
   cd /path/to/whitelist/linux
   sudo ./install.sh
   ```

## Configuration Migration

### Whitelist URL

The whitelist URL is now stored in `/etc/openpath/whitelist-url.conf`.

**Manual migration:**

```bash
# If you have a custom whitelist URL
echo "https://your-custom-url/whitelist.txt" | sudo tee /etc/openpath/whitelist-url.conf
```

### API Configuration

For Classroom mode with API integration:

```bash
# Set API URL
echo "https://your-api-server.duckdns.org" | sudo tee /etc/openpath/health-api-url.conf

# Generate new API secret
sudo ./install.sh --classroom-name "Room 101" --api-url "https://your-api-server.duckdns.org"
```

### Browser Policies

Browser policies are regenerated automatically during upgrade. Custom policies should be backed up:

```bash
# Backup custom policies
cp /etc/firefox/policies/policies.json ~/policies-backup.json

# After upgrade, merge custom settings
# (edit /etc/firefox/policies/policies.json manually)
```

## Rollback Procedure

If the upgrade fails:

1. **Restore from backup:**

   ```bash
   sudo tar -xzvf openpath-backup.tar.gz -C /
   ```

2. **Restore old scripts (if needed):**

   ```bash
   git checkout v3.4  # or previous version tag
   cd linux
   sudo ./install.sh
   ```

3. **Restart services:**
   ```bash
   sudo openpath restart
   ```

## Post-Upgrade Verification

Run these checks after upgrading:

```bash
# Check version
openpath status

# Verify health
sudo openpath health

# Test DNS resolution
openpath test

# Check firewall rules
sudo iptables -L OUTPUT -n | head -20

# Verify whitelist
openpath domains | head -20

# Check logs for errors
openpath log 50 | grep -i error
```

## Troubleshooting Upgrade Issues

### Services Won't Start

```bash
# Check for configuration errors
sudo dnsmasq --test

# Verify systemd units are installed
systemctl list-unit-files | grep openpath
```

### DNS Not Working After Upgrade

```bash
# Regenerate configuration
sudo openpath update

# Force apply changes
sudo openpath force
```

### Firewall Rules Missing

```bash
# Source and apply firewall rules
source /usr/local/lib/openpath/lib/firewall.sh
sudo activate_firewall
```

## Version History

### 3.5 (Current)

- Security hardening for shell scripts
- Improved input validation
- Comprehensive health check command
- Better test coverage
- Configurable paths for testing

### 3.4

- Captive portal detection
- Systemd timer-based updates
- Firefox extension support

### 3.3

- Browser policy enforcement
- Search engine restrictions
- Connection flushing

### 3.2

- Watchdog service
- Automatic recovery
- Improved logging

### 3.1

- Initial multi-section whitelist
- Blocked subdomain support
- Blocked paths support

### 3.0

- Architecture rewrite
- Modular library structure
- FHS-compliant paths
