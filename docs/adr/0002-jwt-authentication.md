# ADR 0002: JWT-Based Authentication System

**Status:** Accepted  
**Date:** 2024-06-10  
**Decision Makers:** OpenPath Core Team

## Context

The API needs to support multiple user roles (admin, teacher, student) with different permission levels. We needed an authentication mechanism that:

- Works for stateless API deployments
- Supports role-based access control (RBAC)
- Can be deployed on home servers (Raspberry Pi, Docker)
- Doesn't require external auth services

## Decision

Implement JWT (JSON Web Tokens) with the following design:

1. **Dual token system**: Short-lived access tokens (24h) + long-lived refresh tokens (7d)
2. **Token blacklisting**: Support logout by maintaining a blacklist of revoked tokens
3. **Role embedding**: Include user roles in token payload for quick authorization
4. **Privileged surface policy**: Require signed JWT access tokens for authenticated admin and teacher operations

```javascript
// Token payload structure
{
  sub: user.id,
  email: user.email,
  roles: [{ role: 'teacher', groupIds: ['group-1', 'group-2'] }],
  type: 'access'
}
```

## Consequences

### Positive

- **Stateless**: No session storage required (except blacklist)
- **Self-contained**: Roles included in token, no DB lookup for authorization
- **Scalable**: Works across multiple API instances
- **Flexible**: Easy to add new roles without schema changes
- **Secure**: Uses cryptographic signatures, tokens can't be forged

### Negative

- **Token size**: Larger tokens due to embedded roles
- **Revocation complexity**: Requires blacklist for immediate logout
- **Secret management**: JWT_SECRET must be properly secured

### Neutral

- Requires client-side token management
- Token refresh logic needed in frontend

## Alternatives Considered

1. **Session-based auth**: Simpler but requires sticky sessions or shared session store
2. **OAuth2 only**: External dependency, overkill for self-hosted scenarios
3. **API Keys**: No built-in expiration or role support
