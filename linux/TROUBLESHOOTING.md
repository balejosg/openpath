# OpenPath Linux Agent — Troubleshooting Guide

## Quick Diagnostics

```bash
# Full system status
sudo openpath status

# Health check
sudo openpath health

# Test DNS resolution
sudo openpath test

# View recent logs
sudo openpath log 50
```

---

## Common Issues

### 1. DNS Not Resolving (No Internet)

**Symptoms:** Browser shows "DNS_PROBE_FINISHED_NXDOMAIN" or similar.

**Steps:**
```bash
# Check if dnsmasq is running
systemctl status dnsmasq

# Check if port 53 is listening
ss -ulnp | grep :53

# Test DNS directly
dig @127.0.0.1 google.com +short

# Check resolv.conf points to localhost
cat /etc/resolv.conf
# Should contain: nameserver 127.0.0.1
```

**Fixes:**
```bash
# Restart dnsmasq
sudo systemctl restart dnsmasq

# If resolv.conf is wrong, fix it
echo "nameserver 127.0.0.1" | sudo tee /etc/resolv.conf
sudo chattr +i /etc/resolv.conf

# Force full re-apply
sudo openpath force
```

### 2. Whitelisted Domain Not Working

**Symptoms:** A domain that should be allowed is being blocked.

**Steps:**
```bash
# Check if domain is in whitelist
sudo openpath check example.com

# List all whitelisted domains
sudo openpath domains

# Check dnsmasq config
grep "example.com" /etc/dnsmasq.d/openpath.conf
```

**Fixes:**
```bash
# Force whitelist re-download
sudo openpath update

# If domain was just added on server, wait for SSE or force update
sudo openpath force
```

### 3. Captive Portal (WiFi Login) Not Working

**Symptoms:** Cannot authenticate to a WiFi network that requires browser login.

**Steps:**
```bash
# Check if captive portal was detected
journalctl -u captive-portal-detector.service --since "10 min ago"

# Check firewall status
sudo iptables -L OUTPUT -n | head -5
```

**Fixes:**
```bash
# The system should auto-detect captive portals. If not:
sudo systemctl restart captive-portal-detector.service

# Manual temporary disable (requires root password)
sudo openpath disable
# After authenticating to WiFi:
sudo openpath enable
```

### 4. System Stuck in Fail-Open Mode

**Symptoms:** `openpath status` shows "FAIL_OPEN" — all DNS is unrestricted.

**Cause:** The watchdog entered fail-open after 3+ consecutive dnsmasq failures.

**Fixes:**
```bash
# Check what failed
sudo openpath log 100 | grep WATCHDOG

# Reset fail counter and restart
echo 0 | sudo tee /var/lib/openpath/watchdog-fails
sudo systemctl restart dnsmasq
sudo openpath update
```

### 5. Whitelist Expired (Fail-Safe Mode)

**Symptoms:** Almost all DNS is blocked. Logs show "whitelist expired".

**Cause:** The agent hasn't been able to download a fresh whitelist for 24+ hours.

**Fixes:**
```bash
# Check whitelist age
stat /var/lib/openpath/whitelist.txt

# Check network connectivity
ping -c 3 8.8.8.8

# Force download
sudo openpath update

# If network is OK but API is down, extend expiration temporarily:
echo 'WHITELIST_MAX_AGE_HOURS=72' | sudo tee -a /etc/openpath/overrides.conf
sudo openpath update
```

### 6. SSE Listener Not Receiving Updates

**Symptoms:** Rule changes on the server take 5+ minutes to apply.

**Steps:**
```bash
# Check SSE service
systemctl status openpath-sse-listener.service
journalctl -u openpath-sse-listener.service --since "1 hour ago"
```

**Fixes:**
```bash
sudo systemctl restart openpath-sse-listener.service
```

### 7. Integrity Tampering Alert

**Symptoms:** Watchdog reports "TAMPERED" status.

**Cause:** A critical system file was modified outside of the normal update process.

**Fixes:**
```bash
# Check which files were tampered
journalctl -u dnsmasq-watchdog.service | grep INTEGRITY

# Regenerate hashes (if legitimate update was made)
sudo rm /var/lib/openpath/integrity.sha256
# Watchdog will regenerate on next run

# Or reinstall the package
sudo dpkg --reinstall openpath-dnsmasq
```

---

## Log Locations

| Log | Location |
|-----|----------|
| Main agent log | `/var/log/openpath.log` |
| Captive portal log | `/var/log/captive-portal-detector.log` |
| Systemd journal | `journalctl -u openpath-dnsmasq.service` |
| Watchdog journal | `journalctl -u dnsmasq-watchdog.service` |
| SSE listener journal | `journalctl -u openpath-sse-listener.service` |

## Configuration Files

| File | Purpose |
|------|---------|
| `/etc/openpath/whitelist-url.conf` | Whitelist download URL |
| `/etc/openpath/classroom.conf` | Classroom name (enrollment) |
| `/etc/openpath/overrides.conf` | User config overrides |
| `/etc/dnsmasq.d/openpath.conf` | Generated dnsmasq config |
| `/var/lib/openpath/whitelist.txt` | Cached whitelist |
| `/var/lib/openpath/health-status` | Last health check result |

## Emergency Procedures

### Complete System Disable (requires root)
```bash
sudo openpath disable
```

### Full Uninstall
```bash
sudo /usr/local/lib/openpath/uninstall.sh
# or via dpkg:
sudo dpkg -r openpath-dnsmasq
```

### Reset Everything
```bash
sudo openpath disable
sudo rm -rf /var/lib/openpath/*
sudo openpath enable
sudo openpath update
```
