# ADR 0001: DNS Sinkhole Architecture for URL Filtering

> Historical note: This ADR is retained as background context for the original sinkhole approach. Prefer current package READMEs, [`../ADR.md`](../ADR.md), and current operational docs before treating it as present-day implementation guidance.

**Status:** Accepted  
**Date:** 2024-01-15  
**Decision Makers:** OpenPath Core Team

## Context

Educational environments need to restrict internet access to whitelisted domains only. Traditional proxy-based solutions are complex to deploy, require certificate management for HTTPS inspection, and can be bypassed. We needed a simpler, more robust solution that works at the network level.

## Decision

Use DNS sinkhole technology with dnsmasq as the core filtering mechanism:

1. **Default deny**: All domains return NXDOMAIN by default (`address=/#/`)
2. **Explicit allow**: Whitelisted domains forward to upstream DNS (`server=/domain.com/8.8.8.8`)
3. **Firewall enforcement**: Block external DNS (port 53/853) to prevent bypass
4. **Browser extension runtime**: Additional Firefox layer for path-level and blocked-subdomain enforcement through the managed extension/native-host flow

```
# dnsmasq config order (CRITICAL)
address=/#/                         # Block all (must be first)
server=/github.com/8.8.8.8          # Allow specific domains
```

## Consequences

### Positive

- **Simple deployment**: No certificate management, works transparently
- **Low overhead**: DNS resolution is lightweight
- **Hard to bypass**: Combined with firewall, users cannot use external DNS
- **Platform agnostic**: Works with any browser or application
- **No MITM**: We don't intercept HTTPS, just control name resolution

### Negative

- **Domain-level network layer**: DNS itself cannot filter specific URLs/paths; Firefox path and blocked-subdomain handling is owned by the extension runtime
- **No content inspection**: Cannot block based on page content
- **DNS-over-HTTPS risk**: Modern browsers may bypass network DNS controls if platform/browser hardening is absent

### Neutral

- Requires local dnsmasq service running
- Updates require dnsmasq config regeneration

## Alternatives Considered

1. **Squid Proxy**: More powerful but requires certificate management and explicit proxy configuration
2. **PiHole**: Similar concept but designed for ad-blocking, not educational whitelisting
3. **Firewall-only (IP blocking)**: Too restrictive, CDNs share IPs across many services
