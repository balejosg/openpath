# Linux AGENTS.md

Bash endpoint agent: dnsmasq DNS sinkhole + iptables firewall + systemd services.

## Module Architecture

All functionality in `lib/*.sh`, sourced by runtime scripts:

| Module        | Purpose                                                |
| ------------- | ------------------------------------------------------ |
| `common.sh`   | Logging, config, whitelist parsing                     |
| `dns.sh`      | Port 53 management, dnsmasq config, upstream detection |
| `firewall.sh` | iptables rules, connection flushing                    |
| `browser.sh`  | Firefox/Chromium policies, extension deployment        |
| `services.sh` | Systemd service/timer creation                         |
| `rollback.sh` | Safe uninstallation, error recovery                    |

## Runtime Scripts

Located in `scripts/runtime/`:

| Script                       | Trigger      | Purpose                          |
| ---------------------------- | ------------ | -------------------------------- |
| `openpath-update.sh`         | Timer (5min) | Download whitelist, apply config |
| `dnsmasq-watchdog.sh`        | Timer (1min) | Health check, auto-recovery      |
| `captive-portal-detector.sh` | Service      | Detect/handle captive portals    |
| `openpath-cmd.sh`            | CLI          | Unified `openpath` command       |
| `smoke-test.sh`              | Post-install | Validate DNS functionality       |

## Installation Paths

| Source                 | Installed To                   |
| ---------------------- | ------------------------------ |
| `lib/*.sh`             | `/usr/local/lib/openpath/lib/` |
| `scripts/runtime/*.sh` | `/usr/local/bin/`              |
| Config                 | `/etc/openpath/`               |
| Logs                   | `/var/log/openpath.log`        |

## Debian Package

`debian-package/DEBIAN/` contains:

- `control` - Package metadata, dependencies
- `postinst` - Post-install configuration
- `prerm` / `postrm` - Removal cleanup

Build: `.github/workflows/build-deb.yml`

## Conventions

- **Shebang**: `#!/bin/bash` always
- **Error handling**: `set -eo pipefail`, explicit exit codes
- **Quoting**: Always quote variables `"$var"`
- **Conditionals**: Use `[[ ... ]]` not `[ ... ]`
- **Functions**: `function_name() { ... }` style
- **Linting**: ShellCheck-clean (CI enforces)

## Critical Pattern: DNS Sinkhole

Order in dnsmasq config is CRITICAL:

```
address=/#/           # MUST BE FIRST - blocks all
server=/allowed.com/8.8.8.8  # Then allow specific
```

Reversed order breaks whitelist enforcement.

## Testing

```bash
cd tests && bats *.bats      # All BATS tests
./tests/run-tests.sh common  # Single suite
```

## Anti-Patterns

- Using `[ ]` instead of `[[ ]]`
- Unquoted variables
- Missing `set -eo pipefail`
- ShellCheck disables without justification
