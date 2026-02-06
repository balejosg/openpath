#!/usr/bin/env bash
set -euo pipefail

# Check staged files for sensitive patterns.

staged_files="$(git diff --cached --name-only --diff-filter=ACMRT || true)"
if [ -z "$staged_files" ]; then
  exit 0
fi

deny_exact=(
  ".env"
  ".env.local"
  ".env.production"
  "credentials.json"
  "service-account.json"
)

deny_regex=(
  "(^|/)id_rsa$"
  "(^|/)id_dsa$"
  "(^|/)id_ecdsa$"
  "(^|/)id_ed25519$"
  "\\.pem$"
  "\\.key$"
  "\\.p12$"
  "\\.pfx$"
  "(^|/)config/\\.env(\\..+)?$"
)

violations=()

while IFS= read -r file; do
  for exact in "${deny_exact[@]}"; do
    if [ "$file" = "$exact" ]; then
      violations+=("$file")
    fi
  done

  for rx in "${deny_regex[@]}"; do
    if printf '%s\n' "$file" | grep -Eq "$rx"; then
      violations+=("$file")
    fi
  done
done <<< "$staged_files"

if [ ${#violations[@]} -gt 0 ]; then
  echo ""
  echo "=============================================="
  echo "  BLOCKED: Sensitive files staged for commit"
  echo "=============================================="
  printf '%s\n' "${violations[@]}" | sort -u
  echo ""
  echo "Unstage them and retry:"
  echo "  git restore --staged <file>"
  echo "=============================================="
  echo ""
  exit 1
fi

exit 0
