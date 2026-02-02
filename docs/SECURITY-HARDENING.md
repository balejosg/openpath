# Security Hardening Guide

This guide covers production security recommendations for the OpenPath DNS whitelist system.

## Overview

OpenPath is designed for educational environments where restricting internet access is critical. This guide helps administrators deploy and maintain a secure installation.

## Pre-Deployment Checklist

### System Requirements

- [ ] Linux system with systemd
- [ ] Root/sudo access for installation
- [ ] Packages: iptables, iptables-persistent, ipset, dnsmasq, curl
- [ ] No conflicting DNS servers (disable systemd-resolved)

### Security Prerequisites

- [ ] System fully updated (`apt update && apt upgrade`)
- [ ] Firewall configured at network level (defense in depth)
- [ ] Physical access restricted to authorized personnel
- [ ] BIOS/UEFI password set
- [ ] Secure boot enabled (if supported)

## Installation Hardening

### Use Unattended Mode for Consistent Deployments

```bash
sudo ./install.sh --unattended --whitelist-url "https://your-url/whitelist.txt"
```

This ensures consistent configuration across multiple machines.

### Secure the API Secret

If using Classroom mode:

```bash
# Generate secret during install
sudo ./install.sh --classroom-name "Room 101" --api-url "https://api.example.com"

# Backup the secret securely
sudo cat /etc/openpath/api-secret.conf > /secure/backup/location/api-secret-room101.txt
chmod 600 /secure/backup/location/api-secret-room101.txt
```

The API secret is generated randomly and never displayed on screen. Store backups securely.

### Verify File Permissions

```bash
# Configuration files should be root-only
ls -la /etc/openpath/
# Expected: -rw------- root root for secret files

# Scripts should be executable but not writable by others
ls -la /usr/local/bin/openpath*
# Expected: -rwxr-xr-x root root
```

## Preventing Local Tampering

### Lock Critical Files

Make critical files immutable to prevent modification (even by root):

```bash
# Lock configuration
sudo chattr +i /etc/openpath/whitelist-url.conf
sudo chattr +i /etc/dnsmasq.d/openpath.conf

# Lock systemd units
sudo chattr +i /etc/systemd/system/openpath-dnsmasq.service
sudo chattr +i /etc/systemd/system/dnsmasq-watchdog.service
```

To modify later:

```bash
sudo chattr -i /etc/openpath/whitelist-url.conf
# ... make changes ...
sudo chattr +i /etc/openpath/whitelist-url.conf
```

### Restrict sudo Access

Limit which commands users can run with sudo:

```bash
# /etc/sudoers.d/openpath-restrict
# Allow openpath commands but not shell access
%teachers ALL=(root) NOPASSWD: /usr/local/bin/openpath status
%teachers ALL=(root) NOPASSWD: /usr/local/bin/openpath health
# Explicitly deny dangerous commands
%teachers ALL=(root) !ALL
```

### Disable USB Storage (Optional)

Prevent users from booting alternative systems:

```bash
# Disable USB storage module
echo "blacklist usb-storage" | sudo tee /etc/modprobe.d/disable-usb-storage.conf
sudo update-initramfs -u
```

### GRUB Password Protection

Prevent booting into recovery mode:

```bash
# Generate password hash
grub-mkpasswd-pbkdf2

# Add to /etc/grub.d/40_custom:
set superusers="admin"
password_pbkdf2 admin <hash>

# Update GRUB
sudo update-grub
```

## Network Security

### Firewall Rules Verification

Regularly verify iptables rules are active:

```bash
# Check OUTPUT chain has DROP rules for DNS
sudo iptables -L OUTPUT -n -v | grep -E "DROP.*(53|853)"

# Verify only localhost DNS is allowed
sudo iptables -L OUTPUT -n -v | grep "127.0.0.1.*53"
```

### Block VPN and Tor

OpenPath blocks common VPN ports by default. Verify:

```bash
# Check VPN ports are blocked
sudo iptables -L OUTPUT -n -v | grep -E "(1194|1723|4500|51820)"

# Check Tor is blocked
sudo iptables -L OUTPUT -n -v | grep -E "(9001|9030)"
```

### Monitor Network Activity

Set up monitoring for bypass attempts:

```bash
# Log dropped packets (add to iptables rules)
sudo iptables -A OUTPUT -j LOG --log-prefix "OPENPATH-DROP: " --log-level 4

# Monitor logs
sudo tail -f /var/log/syslog | grep OPENPATH-DROP
```

## Monitoring and Alerting

### Health Check Monitoring

Set up cron job for automated health checks:

```bash
# /etc/cron.d/openpath-monitor
*/5 * * * * root /usr/local/bin/openpath health --quiet || /usr/local/bin/send-alert.sh "OpenPath health check failed"
```

### Log Monitoring

Important log patterns to monitor:

```bash
# Failed updates
grep -i "fail\|error" /var/log/openpath.log

# Watchdog recoveries
grep -i "recovery\|restart" /var/log/openpath.log

# Configuration changes
grep -i "generated\|updated" /var/log/openpath.log
```

### Centralized Logging

For multi-machine deployments, configure centralized logging:

```bash
# /etc/rsyslog.d/openpath.conf
if $programname == 'openpath' then @logserver.example.com:514
```

## Audit Trail

### Track Configuration Changes

Monitor changes to critical files:

```bash
# Install auditd
sudo apt install auditd

# Add audit rules
sudo auditctl -w /etc/openpath/ -p wa -k openpath-config
sudo auditctl -w /etc/dnsmasq.d/ -p wa -k dnsmasq-config
sudo auditctl -w /etc/firefox/policies/ -p wa -k firefox-policies

# Make rules persistent
sudo sh -c 'auditctl -l > /etc/audit/rules.d/openpath.rules'
```

### Review Audit Logs

```bash
# Search for configuration changes
sudo ausearch -k openpath-config

# Generate report
sudo aureport -f -i
```

## API Security (Classroom Mode)

### JWT Configuration

For production API deployments:

```bash
# Set a strong, persistent JWT secret
echo "JWT_SECRET=$(openssl rand -hex 32)" | sudo tee -a /etc/openpath/api.env
```

Never use the auto-generated random secret in production - tokens will be invalidated on restart.

### Rate Limiting

The API includes rate limiting by default:

- Global: 200 requests/minute per IP
- Auth: 10 attempts/minute per IP
- Domain requests: 5/minute per IP

For high-traffic deployments, adjust in `api/src/server.ts`.

### CORS Configuration

Restrict CORS origins in production:

```bash
# In api/.env
CORS_ORIGINS=https://spa.yourdomain.com
```

## Regular Maintenance

### Weekly Tasks

- [ ] Review `/var/log/openpath.log` for anomalies
- [ ] Run `openpath health` on all machines
- [ ] Check for pending security updates

### Monthly Tasks

- [ ] Review audit logs for unauthorized changes
- [ ] Verify firewall rules on all machines
- [ ] Test browser policy enforcement
- [ ] Update whitelist if needed

### Quarterly Tasks

- [ ] Full security audit
- [ ] Review user access permissions
- [ ] Update documentation
- [ ] Test backup and recovery procedures

## Incident Response

### Suspected Bypass Attempt

1. **Collect evidence:**

   ```bash
   sudo openpath log 500 > incident-logs.txt
   sudo iptables -L -n -v > firewall-state.txt
   sudo cat /etc/resolv.conf > dns-config.txt
   ```

2. **Check for tampering:**

   ```bash
   # Verify file integrity
   md5sum /usr/local/bin/openpath* > current-hashes.txt
   # Compare with known-good hashes
   ```

3. **Force policy refresh:**
   ```bash
   sudo openpath force
   sudo openpath restart
   ```

### Complete Compromise

If the system appears compromised:

1. **Isolate the machine** (disconnect from network)
2. **Boot from live USB** to examine the system
3. **Preserve evidence** (disk image)
4. **Reinstall** from known-good media
5. **Restore configuration** from secure backup
6. **Rotate all secrets** (API keys, passwords)

## Security Contacts

For security issues with OpenPath:

- Report vulnerabilities: https://github.com/LasEncinasIT/openpath/security
- General issues: https://github.com/LasEncinasIT/openpath/issues

Please practice responsible disclosure for security vulnerabilities.
