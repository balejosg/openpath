# Windows AGENTS.md

PowerShell endpoint agent: Acrylic DNS Proxy + Windows Firewall.

## Module Structure

```
windows/
├── lib/
│   ├── DNS.psm1        # Acrylic DNS Proxy management
│   ├── Firewall.psm1   # Windows Firewall rules
│   ├── Browser.psm1    # Browser policy enforcement
│   ├── Common.psm1     # Shared utilities, logging
│   └── Services.psm1   # Task Scheduler management
├── Install-OpenPath.ps1   # Main installer
├── Uninstall-OpenPath.ps1 # Uninstaller
└── tests/
    └── *.Tests.ps1     # Pester tests
```

## Key Modules

| Module          | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `DNS.psm1`      | Acrylic installation, host file generation, service control |
| `Firewall.psm1` | Block external DNS, allow localhost only                    |
| `Browser.psm1`  | Chrome/Edge/Firefox policy via registry                     |
| `Services.psm1` | Scheduled tasks for updates, watchdog                       |

## Conventions

- **Naming**: Approved verbs (`Get-`, `Set-`, `New-`, `Remove-`)
- **Parameters**: PascalCase, mandatory validation
- **Output**: Use `Write-Verbose`, `Write-Warning`, `Write-Error`
- **Linting**: PSScriptAnalyzer-clean (CI enforces)

## Installation

```powershell
# Interactive
.\Install-OpenPath.ps1

# Unattended
.\Install-OpenPath.ps1 -WhitelistUrl "https://..." -Unattended
```

## Testing

```powershell
# Run Pester tests
Invoke-Pester -Path tests/

# Pre-install validation
.\tests\Pre-Install-Validation.ps1
```

## Anti-Patterns

- Using unapproved verbs
- Missing `[CmdletBinding()]`
- Direct `Write-Host` (use Write-Verbose/Warning)
- Hardcoded paths without variables
