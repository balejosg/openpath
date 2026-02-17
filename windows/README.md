# OpenPath DNS for Windows

Internet access control system using a DNS sinkhole for Windows, powered by Acrylic DNS Proxy.

## Features

✅ **DNS Sinkhole** - Blocks all domains except for the whitelist.  
✅ **Acrylic DNS Proxy** - Local DNS server with wildcard support.  
✅ **Windows Firewall** - Blocks external DNS, VPNs, and Tor.  
✅ **DoH Egress Blocking** - Blocks known DNS-over-HTTPS resolver IPs on 443.  
✅ **Browser Policies** - Supports Firefox, Chrome, and Edge.  
✅ **Real-Time SSE Updates** - Instant rule changes via Server-Sent Events.  
✅ **Auto-Update Fallback** - Syncs every 15 minutes via Task Scheduler.  
✅ **Stale Whitelist Fail-Safe** - Enters safe restrictive mode when cache expires offline.  
✅ **Integrity Baseline** - Detects script/module tampering and attempts bounded restore.  
✅ **Watchdog** - Automatic failure recovery.

## Requirements

- Windows 10/11 or Windows Server 2016+.
- PowerShell 5.1+.
- Administrator privileges.

## Quick Install

```powershell
# Run as Administrator
.\Install-OpenPath.ps1 -WhitelistUrl "http://your-server:3000/export/group.txt"
```

## Verify Installation

```powershell
# Test DNS (should resolve)
nslookup google.com 127.0.0.1

# Test sinkhole (should fail)
nslookup facebook.com 127.0.0.1

# View scheduled tasks
Get-ScheduledTask -TaskName "OpenPath-*"

# View firewall rules
Get-NetFirewallRule -DisplayName "OpenPath-*"
```

## Structure

```
C:\OpenPath\
├── Install-OpenPath.ps1        # Installer
├── Uninstall-OpenPath.ps1      # Uninstaller
├── lib\
│   ├── Common.psm1             # Common functions
│   ├── DNS.psm1                # Acrylic management
│   ├── Firewall.psm1           # Windows Firewall
│   ├── Browser.psm1            # Browser policies
│   └── Services.psm1           # Task Scheduler
├── scripts\
│   ├── Update-OpenPath.ps1     # Periodic update (fallback)
│   ├── Start-SSEListener.ps1   # Real-time SSE listener
│   └── Test-DNSHealth.ps1      # Watchdog
└── data\
    ├── config.json             # Configuration
    ├── whitelist.txt           # Local whitelist
    └── logs\                   # Logs
```

## Configuration

Edit `C:\OpenPath\data\config.json`:

```json
{
  "whitelistUrl": "http://server:3000/w/<token>/whitelist.txt",
  "updateIntervalMinutes": 15,
  "primaryDNS": "8.8.8.8",
  "enableFirewall": true,
  "enableBrowserPolicies": true,
  "enableStaleFailsafe": true,
  "staleWhitelistMaxAgeHours": 24,
  "enableIntegrityChecks": true,
  "enableDohIpBlocking": true,
  "sseReconnectMin": 5,
  "sseReconnectMax": 60,
  "sseUpdateCooldown": 10,
  "healthApiSecret": "optional-shared-secret"
}
```

## Uninstallation

```powershell
# Run as Administrator
.\Uninstall-OpenPath.ps1
```

## Troubleshooting

### DNS not resolving

```powershell
# Check Acrylic service
Get-Service -DisplayName "*Acrylic*"

# Restart Acrylic
Restart-Service -DisplayName "*Acrylic*"

# View logs
Get-Content C:\OpenPath\data\logs\openpath.log -Tail 50
```

### Firewall blocking

```powershell
# Check rules
Get-NetFirewallRule -DisplayName "OpenPath-*" | Format-Table

# Temporarily disable
Get-NetFirewallRule -DisplayName "OpenPath-*" | Disable-NetFirewallRule
```

### SSE listener not connecting

```powershell
# Check SSE task status
Get-ScheduledTask -TaskName "OpenPath-SSE"

# Manually start SSE listener
Start-ScheduledTask -TaskName "OpenPath-SSE"

# View SSE logs
Get-Content C:\OpenPath\data\logs\openpath.log -Tail 50 | Select-String "SSE"
```

## Linux Compatibility

This system is the Windows equivalent of the [Linux system](../README.md) based on dnsmasq. Both systems:

- Use the same whitelist format.
- Are compatible with the [SPA](../spa/) for centralized management.
- Implement the same DNS sinkhole logic.

## License

AGPL-3.0-or-later
