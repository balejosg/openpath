# OpenPath DNS for Windows

Internet access control system using a DNS sinkhole for Windows, powered by Acrylic DNS Proxy.

## Features

✅ **DNS Sinkhole** - Blocks all domains except for the whitelist.  
✅ **Acrylic DNS Proxy** - Local DNS server with wildcard support.  
✅ **Windows Firewall** - Blocks external DNS, VPNs, and Tor.  
✅ **DoH Egress Blocking** - Blocks known DNS-over-HTTPS resolver IPs on 443.  
✅ **Browser Policies** - Supports Firefox, Chrome, and Edge.  
✅ **Firefox Extension Auto-Install** - Stages and force-installs the bundled browser extension when installer assets are available.  
✅ **Real-Time SSE Updates** - Instant rule changes via Server-Sent Events.  
✅ **Auto-Update Fallback** - Syncs every 15 minutes via Task Scheduler.  
✅ **Silent Agent Self-Update** - Daily software updates from the same OpenPath server version.  
✅ **Stale Whitelist Fail-Safe** - Enters safe restrictive mode when cache expires offline.  
✅ **Integrity Baseline** - Detects script/module tampering and attempts bounded restore.  
✅ **Checkpoint Rollback** - Stores rolling whitelist checkpoints for watchdog recovery.  
✅ **Watchdog** - Automatic failure recovery.

## Requirements

- Windows 10/11 or Windows Server 2016+.
- PowerShell 5.1+.
- Administrator privileges.

## Quick Install

```powershell
# Run as Administrator
.\Install-OpenPath.ps1 -WhitelistUrl "http://your-server:3000/export/group.txt"

# Classroom mode (non-interactive, short-lived enrollment token)
.\Install-OpenPath.ps1 -ApiUrl "https://api.example.com" -ClassroomId "<classroom-id>" -EnrollmentToken "<token>" -Unattended

# Optional: skip pre-install validation in controlled environments
.\Install-OpenPath.ps1 -WhitelistUrl "http://your-server:3000/export/group.txt" -SkipPreflight
```

The installer executes `scripts\Pre-Install-Validation.ps1` by default before making changes.

If you use the React SPA classroom modal, it provides a one-liner that downloads and runs
`/api/enroll/<classroomId>/windows.ps1` directly.

## Operational Commands

```powershell
# Unified command entrypoint
.\OpenPath.ps1 status
.\OpenPath.ps1 update
.\OpenPath.ps1 health
.\OpenPath.ps1 self-update --check

# Classroom operations
.\OpenPath.ps1 enroll -Classroom "Lab-01" -ApiUrl "https://api.example.com" -RegistrationToken "<token>"
.\OpenPath.ps1 enroll -ApiUrl "https://api.example.com" -ClassroomId "<classroom-id>" -EnrollmentToken "<token>" -Unattended
.\OpenPath.ps1 rotate-token -Secret "<shared-secret>"
```

## Verify Installation

```powershell
# Test DNS (should resolve)
nslookup <allowed-domain> 127.0.0.1

# Test sinkhole (should fail)
nslookup facebook.com 127.0.0.1

# View scheduled tasks
Get-ScheduledTask -TaskName "OpenPath-*"

# View firewall rules
Get-NetFirewallRule -DisplayName "OpenPath-*"
```

## Browser Extension Notes

- Firefox Release: OpenPath only force-installs the extension when a signed distribution is available. Supported sources are `firefoxExtensionId` + `firefoxExtensionInstallUrl` in `config.json` (for example an AMO `latest.xpi` URL) or staged signed artifacts under `C:\OpenPath\browser-extension\firefox-release\`.
- Firefox development assets can still be staged under `C:\OpenPath\browser-extension\firefox`, but they are not used for Firefox Release auto-install because the unpacked bundle is unsigned.
- If no signed Firefox distribution is configured, OpenPath keeps the browser blocking policies and skips extension auto-install with a warning in `C:\OpenPath\data\logs\openpath.log`.
- Chrome and Edge: OpenPath now stages managed rollout metadata under `C:\OpenPath\browser-extension\chromium-managed` and can publish a managed `CRX + update manifest` pipeline when `firefox-extension/build/chromium-managed/` exists on the server. Build those artifacts with `npm run build:chromium-managed --workspace=@openpath/firefox-extension`.
- Edge/Chrome rollout still depends on browser enterprise policy restrictions on Windows. If managed Chromium artifacts are absent, OpenPath skips the forced install and keeps only the browser blocking policies.

## Structure

```
C:\OpenPath\
├── OpenPath.ps1               # Unified operational command
├── Install-OpenPath.ps1        # Installer
├── Uninstall-OpenPath.ps1      # Uninstaller
├── Rotate-Token.ps1            # Token rotation helper
├── lib\
│   ├── Common.psm1             # Common functions
│   ├── DNS.psm1                # Acrylic management
│   ├── Firewall.psm1           # Windows Firewall
│   ├── Browser.psm1            # Browser policies
│   └── Services.psm1           # Task Scheduler
├── scripts\
│   ├── Update-OpenPath.ps1     # Periodic update (fallback)
│   ├── Enroll-Machine.ps1      # Machine enrollment/re-enrollment
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
  "version": "4.1.0",
  "updateIntervalMinutes": 15,
  "primaryDNS": "8.8.8.8",
  "enableFirewall": true,
  "enableBrowserPolicies": true,
  "enableStaleFailsafe": true,
  "staleWhitelistMaxAgeHours": 24,
  "enableIntegrityChecks": true,
  "enableDohIpBlocking": true,
  "enableCheckpointRollback": true,
  "maxCheckpoints": 3,
  "sseReconnectMin": 5,
  "sseReconnectMax": 60,
  "sseUpdateCooldown": 10,
  "healthApiSecret": "optional-shared-secret",
  "firefoxExtensionId": "monitor-bloqueos@openpath",
  "firefoxExtensionInstallUrl": "https://addons.mozilla.org/firefox/downloads/latest/monitor-bloqueos@openpath/latest.xpi"
}
```

If you prefer to stage a signed XPI locally for Firefox Release, place `metadata.json` and
`openpath-firefox-extension.xpi` under `C:\OpenPath\browser-extension\firefox-release\`.
When `metadata.json` omits `installUrl`, OpenPath uses the staged XPI through a `file:///`
policy URL.

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
- Are compatible with the [web UI](../react-spa/) for centralized management.
- Implement the same DNS sinkhole logic.

## License

AGPL-3.0-or-later
