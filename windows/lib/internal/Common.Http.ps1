$commonHttpRoot = Split-Path -Parent $PSCommandPath

. (Join-Path $commonHttpRoot 'Common.Http.Assembly.ps1')
. (Join-Path $commonHttpRoot 'Common.Http.Whitelist.ps1')
. (Join-Path $commonHttpRoot 'Common.Http.Health.ps1')
. (Join-Path $commonHttpRoot 'Common.Http.Version.ps1')
