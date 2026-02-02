# OpenPath Linux Agent

The Linux endpoint agent for the OpenPath DNS whitelist system.

## Overview

The Linux agent enforces DNS whitelisting at the network level using `dnsmasq` as a DNS sinkhole and `iptables` for traffic filtering. It is designed to run on classroom machines or local gateways to ensure that only approved domains are accessible.

## Features

- **DNS Sinkhole**: Uses `dnsmasq` to block all DNS requests except for those on the whitelist.
- **Firewall Enforcement**: Uses `iptables`/`nftables` to prevent DNS bypassing via external servers.
- **Captive Portal Detection**: Automatically detects and handles network environments with captive portals.
- **Auto-Update**: Periodically syncs with the central API to refresh the whitelist.
- **Watchdog**: Monitoring scripts that ensure system services are healthy and running.

## Installation

### Requirements

- Ubuntu 22.04 / 24.04 or compatible Debian-based distribution.
- Root privileges (sudo).

### Quick Install

```bash
sudo ./install.sh
```

### Advanced Installation

Use the `quick-install.sh` script for non-interactive installations:

```bash
sudo ./quick-install.sh --url "http://your-api-server:3000/export/group.txt"
```

## Structure

- `lib/`: Core shell library modules (`dns.sh`, `firewall.sh`, `browser.sh`, etc.).
- `scripts/runtime/`: Periodic tasks and monitoring scripts (watchdog, updater).
- `debian-package/`: Files used for building the `.deb` package.

## Configuration

Configuration is stored in `/etc/openpath/config.default` (or your custom config path).

- `WHITELIST_URL`: The URL to fetch the domain list from.
- `UPDATE_INTERVAL`: How often to sync the whitelist (in minutes).
- `ENABLE_FIREWALL`: Whether to enable iptables filtering.

## Testing

The Linux agent uses BATS (Bash Automated Testing System) for testing.

```bash
cd tests
bats *.bats
```

## License

AGPL-3.0-or-later
