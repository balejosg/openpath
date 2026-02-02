# Troubleshooting Guide

This guide covers common issues and their solutions for the OpenPath DNS whitelist system.

## Quick Diagnostics

Run the health check command first:

```bash
sudo openpath health
```

This will show the status of all components and help identify issues.

## Common Issues

### DNS Resolution Not Working

**Symptoms:**

- Websites don't load
- Browser shows "DNS_PROBE_FINISHED_NXDOMAIN"
- `dig @127.0.0.1 google.com` returns no results

**Solutions:**

1. **Check if dnsmasq is running:**

   ```bash
   systemctl status dnsmasq
   ```

   If not running:

   ```bash
   sudo systemctl restart dnsmasq
   ```

2. **Check dnsmasq configuration:**

   ```bash
   dnsmasq --test
   ```

   If there are syntax errors, regenerate the config:

   ```bash
   sudo openpath update
   ```

3. **Check upstream DNS:**

   ```bash
   cat /run/dnsmasq/resolv.conf
   dig @8.8.8.8 google.com +short
   ```

   If upstream DNS is unreachable, the network may be down.

4. **Check resolv.conf:**
   ```bash
   cat /etc/resolv.conf
   ```
   Should show `nameserver 127.0.0.1`. If not:
   ```bash
   sudo openpath restart
   ```

### dnsmasq Keeps Crashing

**Symptoms:**

- dnsmasq service repeatedly fails
- Watchdog logs show restart attempts

**Solutions:**

1. **Check for port conflicts:**

   ```bash
   sudo ss -tuln | grep :53
   ```

   If systemd-resolved is using port 53:

   ```bash
   sudo systemctl disable systemd-resolved
   sudo systemctl stop systemd-resolved
   sudo openpath restart
   ```

2. **Check dnsmasq logs:**

   ```bash
   journalctl -u dnsmasq -n 50
   ```

3. **Verify configuration syntax:**

   ```bash
   sudo dnsmasq --test -C /etc/dnsmasq.d/openpath.conf
   ```

4. **Check for duplicate dnsmasq instances:**
   ```bash
   pgrep -a dnsmasq
   ```

### Firewall Rules Not Applied

**Symptoms:**

- Users can bypass DNS restrictions
- External DNS servers are accessible

**Solutions:**

1. **Check iptables rules:**

   ```bash
   sudo iptables -L OUTPUT -n -v
   ```

   Should show DROP rules for port 53 and 853.

2. **Reapply firewall rules:**

   ```bash
   sudo openpath force
   ```

3. **Check if iptables-persistent is installed:**
   ```bash
   dpkg -l | grep iptables-persistent
   ```
   If not installed:
   ```bash
   sudo apt install iptables-persistent
   ```

### Browser Policies Not Applying

**Symptoms:**

- Users can access blocked URLs
- Search engines other than DuckDuckGo are available
- Extensions can be installed

**Solutions:**

1. **Check Firefox policies:**

   ```bash
   cat /etc/firefox/policies/policies.json | python3 -m json.tool
   ```

2. **Check Chromium policies:**

   ```bash
   ls -la /etc/chromium/policies/managed/
   cat /etc/chromium/policies/managed/openpath.json
   ```

3. **Force policy regeneration:**

   ```bash
   sudo openpath force
   ```

   This will close browsers and regenerate policies.

4. **Restart Firefox to apply policies:**
   - Close all Firefox windows completely
   - Open Firefox and go to `about:policies` to verify

### Captive Portal Not Detected

**Symptoms:**

- Can't connect to hotel/airport WiFi
- Login page doesn't appear

**Solutions:**

1. **Check captive portal detector status:**

   ```bash
   systemctl status captive-portal-detector
   ```

2. **Manually trigger detection:**

   ```bash
   curl -s http://detectportal.firefox.com/success.txt
   ```

   Should return "success". If it redirects, there's a captive portal.

3. **Temporarily disable OpenPath:**
   ```bash
   sudo openpath disable
   ```
   Connect to the captive portal, then:
   ```bash
   sudo openpath enable
   ```

### Whitelist Not Updating

**Symptoms:**

- New domains not resolving
- Old domains still accessible after removal

**Solutions:**

1. **Check whitelist URL:**

   ```bash
   cat /etc/openpath/whitelist-url.conf
   ```

2. **Manually update:**

   ```bash
   sudo openpath update
   ```

3. **Check download errors:**

   ```bash
   grep -i "error\|fail" /var/log/openpath.log | tail -20
   ```

4. **Verify whitelist file:**
   ```bash
   head -50 /var/lib/openpath/whitelist.txt
   ```

### Connection Flush Issues

**Symptoms:**

- Blocked sites remain accessible after policy change
- Need to restart browser for changes to take effect

**Solutions:**

1. **Force connection flush:**

   ```bash
   sudo openpath force
   ```

2. **Clear browser cache manually**

3. **Check if conntrack is installed:**
   ```bash
   which conntrack
   ```
   If not:
   ```bash
   sudo apt install conntrack
   ```

## Viewing Logs

**Real-time log viewing:**

```bash
openpath logs
```

**Last 100 log lines:**

```bash
openpath log 100
```

**Service-specific logs:**

```bash
journalctl -u dnsmasq -f
journalctl -u openpath-dnsmasq.service -f
journalctl -u dnsmasq-watchdog.service -f
journalctl -u captive-portal-detector.service -f
```

## Recovery Procedures

### Complete Reset

If the system is in a broken state:

```bash
# Stop all services
sudo systemctl stop openpath-dnsmasq.timer
sudo systemctl stop dnsmasq-watchdog.timer
sudo systemctl stop captive-portal-detector.service
sudo systemctl stop dnsmasq

# Clear configuration
sudo rm -f /etc/dnsmasq.d/openpath.conf
sudo rm -f /var/lib/openpath/*.hash

# Restart
sudo openpath restart
sudo openpath update
```

### Emergency Disable

If you need to restore internet access immediately:

```bash
sudo openpath disable
```

Or if that doesn't work:

```bash
# Remove firewall rules
sudo iptables -F OUTPUT

# Configure passthrough DNS
echo "nameserver 8.8.8.8" | sudo tee /etc/resolv.conf

# Stop dnsmasq
sudo systemctl stop dnsmasq
```

## Getting Help

If you can't resolve an issue:

1. Collect diagnostic information:

   ```bash
   sudo openpath health > health-report.txt
   openpath log 200 > logs.txt
   sudo iptables -L OUTPUT -n -v > firewall-rules.txt
   ```

2. Open an issue at: https://github.com/LasEncinasIT/openpath/issues

Include:

- Operating system version
- OpenPath version (`openpath status`)
- Health check output
- Relevant log entries
- Steps to reproduce the issue
