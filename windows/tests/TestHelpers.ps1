# Compatibility wrapper so older dot-sourced tests keep working while
# the split browser suites import the helper module directly.
Import-Module (Join-Path $PSScriptRoot 'TestHelpers.psm1') -Force -Global
