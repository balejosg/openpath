# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please **do not open a public issue**. Instead, contact us directly by email or through a private security advisory.

## Secrets Management

### JWT_SECRET

The `JWT_SECRET` is used to sign authentication tokens.

**Best Practices:**

- Generate a strong, random secret (min 256 bits)
- Store in environment variables, never in code
- Rotate annually or immediately if compromised

**Rotation Procedure:**

1. Generate a new secret: `openssl rand -hex 32`
2. Update the `JWT_SECRET` environment variable
3. Restart the API server
4. Users will need to re-authenticate (tokens become invalid)

### Registration Token

Used for client PC registration in classroom deployments.

**Rotation Procedure:**

1. Access Dashboard → Settings → Regenerate Token
2. Or via API: `POST /api/setup/regenerate-token`
3. Distribute new token to authorized installers
4. Previously registered PCs continue to work

### VAPID Keys

Used for web push notifications.

**Generation:**

```bash
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` environment variables.

## Security Headers

The API uses Helmet.js with security headers including:

- Content-Security-Policy
- X-Content-Type-Options
- X-Frame-Options
- Strict-Transport-Security (when behind HTTPS proxy)

## Dependencies

- Run `npm audit` regularly
- Security scanning is automated via GitHub Actions weekly
- Container images are scanned with Trivy
