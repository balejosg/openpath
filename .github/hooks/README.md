# Git Hooks Setup

This directory contains git hooks for the Whitelist project.

## Installation

To install these hooks:

```bash
# From project root
cp .github/hooks/* .git/hooks/
chmod +x .git/hooks/*
```

## Available Hooks

### pre-commit

Runs before each commit to check:

- **ShellCheck** - Lints shell scripts for errors
- **ESLint** - Lints JavaScript in Node.js projects
- **Sensitive files** - Prevents committing keys, .env files
- **Large files** - Warns about files >1MB

## Skipping Hooks

To skip hooks for a single commit (not recommended):

```bash
git commit --no-verify
```
