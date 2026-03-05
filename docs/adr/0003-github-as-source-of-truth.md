# ADR 0003: GitHub as Source of Truth for Whitelist

## Status

Superseded (still supported as an option)

### Update (v4.x)

The default OpenPath deployment uses PostgreSQL as the source of truth and serves whitelist exports via the API (for example `GET /export/:name.txt` or tokenized `GET /w/:machineToken/whitelist.txt`).

Hosting a `whitelist.txt` as a static file (including GitHub raw content URLs) remains supported by pointing endpoint agents at that URL.

## Context

OpenPath distributes whitelist rules to multiple client machines. The system needs:

1. A centralized source of truth for whitelist domains
2. Version control for audit trails
3. Easy updates without complex deployment
4. Accessibility from any network location
5. High availability

Options considered:

1. **Self-hosted API**: Full control but requires infrastructure
2. **S3/Cloud storage**: Simple but no version control
3. **Configuration management** (Ansible/Puppet): Complex setup
4. **GitHub raw content**: Free, versioned, highly available

## Decision

We will use **GitHub raw file URLs** as the source of truth for whitelist rules.

## Rationale

1. **Free hosting**: GitHub provides CDN-backed raw file access
2. **Version control**: Full Git history of all changes
3. **Pull request workflow**: Review process for changes
4. **High availability**: GitHub's infrastructure is highly reliable
5. **Simple updates**: Edit file → commit → clients auto-update

### Flow

```
Admin edits whitelist.txt
        ↓
    Git commit
        ↓
    Push to GitHub
        ↓
    raw.githubusercontent.com/... updated
        ↓
    Clients fetch on schedule (every 5 min)
        ↓
    dnsmasq/Acrylic config regenerated
```

## Whitelist File Format

```txt
# WHITELIST
example.com
*.allowed-domain.com

## BLOCKED-SUBDOMAINS
ads.example.com

## BLOCKED-PATHS
*/search*
```

## Consequences

### Positive

- No infrastructure to maintain
- Built-in audit trail via Git history
- Familiar workflow for developers
- Geographic distribution via GitHub CDN
- API for programmatic updates (GitHub API)

### Negative

- Dependency on GitHub availability
- Rate limiting on raw.githubusercontent.com (not an issue for small deployments)
- Public repositories expose whitelist (use private repo if needed)
- No real-time push (polling-based updates)

### Mitigation

- Cache last known whitelist locally for offline operation
- Implement exponential backoff for fetch failures
- Support private repository URLs with token authentication
- Consider webhook integration for near-real-time updates
