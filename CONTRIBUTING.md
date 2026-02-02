# Contributing to OpenPath

Thank you for your interest in contributing to OpenPath! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Commit Conventions](#commit-conventions)
- [Running Tests](#running-tests)

## Development Setup

### Prerequisites

- **Node.js** >= 20 (for API development)
- **PowerShell** 5.1+ (for Windows client)
- **Bash** 4+ (for Linux client)
- **Docker** (optional, for containerized testing)

### API Development

```bash
cd api
npm install
npm run dev
```

### Linux Client

```bash
# Install BATS if needed (see tests/run-tests.sh)
cd tests

# Run BATS tests
bats *.bats
```

### Windows Client

```powershell
# Run Pester tests
cd windows/tests
Invoke-Pester -Output Detailed
```

## Code Style

### TypeScript (API & SPA)

- **Strict Typing**: simple `any` is forbidden. Use `unknown` or specific types.
- **tRPC**: Use tRPC routers for new endpoints instead of REST when possible.
- **Linting**: We use a strict ESLint configuration. Zero warnings allowed.

```bash
cd api
npm run lint
npm run typecheck
```

### Shell Scripts (Linux)

- Follow ShellCheck recommendations
- Use lowercase with underscores for variables
- Quote all variables: `"$var"` not `$var`
- Prefer `[[ ]]` over `[ ]` for conditions

```bash
shellcheck linux/lib/*.sh linux/*.sh
```

### PowerShell (Windows)

- Use approved verbs: `Get-`, `Set-`, `New-`, `Remove-`, etc.
- Include comment-based help (`.SYNOPSIS`, `.PARAMETER`)
- Use PascalCase for function and parameter names

## Pull Request Process

1. **Fork** the repository and create your branch from `main`
2. **Make changes** following code style guidelines
3. **Add tests** for new functionality
4. **Update documentation** if needed
5. **Run tests** locally to ensure they pass
6. **Submit PR** with a clear description

### PR Checklist

- [ ] Tests pass locally
- [ ] Code follows style guidelines
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow conventions
- [ ] No secrets or credentials in code

## Commit Conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                     |
| ---------- | ----------------------------------------------- |
| `feat`     | New feature                                     |
| `fix`      | Bug fix                                         |
| `docs`     | Documentation only                              |
| `style`    | Formatting, no code change                      |
| `refactor` | Code change that neither fixes nor adds feature |
| `perf`     | Performance improvement                         |
| `test`     | Adding or updating tests                        |
| `chore`    | Maintenance tasks                               |
| `ci`       | CI/CD changes                                   |

### Scopes

- `api` - Backend API
- `linux` - Linux client
- `windows` - Windows client
- `spa` - Single Page Application
- `extension` - Firefox extension
- `docs` - Documentation

### Examples

```
feat(api): add classroom reservation endpoints
fix(linux): resolve DNS race condition on startup
docs: update installation instructions
test(windows): add Pester tests for DNS module
```

## Running Tests

### API Tests

```bash
cd api
npm test              # Unit tests
npm run test:coverage # With coverage report
npm run test:all      # All test suites
```

### Dashboard Tests

Dashboard tests require a running PostgreSQL. You can start it with the repo compose DB service:

```bash
docker-compose up -d db
```

By default the compose DB uses:

- DB: `openpath`
- User: `openpath`
- Password: `openpath_dev`
- Port: `5432`

Run dashboard tests with:

```bash
DATABASE_URL='postgresql://openpath:openpath_dev@localhost:5432/openpath' npm test --workspace=@openpath/dashboard
```

### Linux Tests (BATS)

```bash
cd tests
bats *.bats                    # All tests
bats common.bats              # Single file
bats --tap *.bats             # TAP output
```

### Windows Tests (Pester)

```powershell
cd windows/tests
Invoke-Pester                                    # All tests
Invoke-Pester -Path .\Windows.Tests.ps1         # Single file
Invoke-Pester -Output Detailed                  # Verbose output
```

### E2E Tests (Playwright)

E2E tests are split into **smoke** (fast) and **comprehensive** (full) suites:

```bash
cd spa

# Smoke tests only (14 tests, ~2-3 min) - runs in CI on every PR
npx playwright test --grep @smoke --project=chromium

# All E2E tests (279+ tests, ~15-20 min)
npm run test:e2e

# With browser UI
npm run test:e2e:headed

# Single spec file
npx playwright test e2e/auth.spec.ts

# Single test by name
npx playwright test --grep "login"
```

#### CI Workflows

| Workflow                | Tests                  | Trigger                                  |
| ----------------------- | ---------------------- | ---------------------------------------- |
| `ci.yml`                | @smoke only (14 tests) | Every PR/push                            |
| `e2e-comprehensive.yml` | All tests (279+)       | Push to main, nightly, `e2e` label on PR |

To run full E2E on a PR, add the `e2e` or `full-test` label.

#### Adding Smoke Tests

Tag critical path tests with `@smoke` for fast CI feedback:

```typescript
test('critical feature works', { tag: '@smoke' }, async ({ page }) => {
  // ...
});
```

### Load Tests (k6)

```bash
k6 run api/tests/load/load-test.js
```

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Use discussions for general questions

---

Thank you for contributing! 🎉
