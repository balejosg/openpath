# ADR 0003: Multi-Platform Parallel Implementation

**Status:** Accepted  
**Date:** 2024-08-20  
**Decision Makers:** OpenPath Core Team

## Context

OpenPath needs to support both Linux and Windows workstations in educational environments. Schools often have mixed infrastructure. We needed to decide between:

- Cross-platform runtime (e.g., Go binary, Electron)
- Native implementations for each platform

## Decision

Implement parallel native solutions for each platform:

| Component    | Linux          | Windows            |
| ------------ | -------------- | ------------------ |
| DNS Sinkhole | dnsmasq        | Acrylic DNS Proxy  |
| Firewall     | iptables       | Windows Firewall   |
| Scheduler    | systemd timers | Task Scheduler     |
| Installer    | Bash scripts   | PowerShell scripts |

Shared components remain platform-agnostic:

- **API**: Node.js Express (Docker or native)
- **SPA**: Static HTML/JS/CSS
- **Firefox Extension**: WebExtensions API

## Consequences

### Positive

- **Native performance**: Uses each platform's built-in tools
- **No runtime dependencies**: No need to install Go, Python, etc. on clients
- **Leverages expertise**: Each platform uses its idiomatic tooling
- **Easier debugging**: Standard tools that sysadmins know
- **Smaller footprint**: No additional runtime bloat

### Negative

- **Dual maintenance**: Bug fixes may need to be applied twice
- **Feature parity risk**: Platforms may drift in capabilities
- **Testing overhead**: Need CI for both platforms

### Neutral

- Shared API and SPA reduce duplication significantly
- Common whitelist file format ensures consistency

## Alternatives Considered

1. **Go binary**: Cross-platform but requires Go toolchain, larger binary
2. **Python**: Cross-platform but requires Python runtime on all clients
3. **Electron wrapper**: Very heavy for simple DNS/firewall management
4. **Ansible/Chef**: Overkill for single-purpose tool, requires additional infrastructure
