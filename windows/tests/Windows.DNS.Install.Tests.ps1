Describe "DNS Module - Install Contracts" {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot ".." "lib"
        Import-Module "$modulePath\DNS.psm1" -Force -ErrorAction SilentlyContinue
    }

    Context "Max domains limit" {
        It "Truncates generated whitelist domains to the configured limit" {
            InModuleScope DNS {
                $definition = New-AcrylicHostsDefinition `
                    -WhitelistedDomains @('one.example.com', 'two.example.com', 'three.example.com') `
                    -DnsSettings ([PSCustomObject]@{
                        PrimaryDNS = '8.8.8.8'
                        SecondaryDNS = '8.8.4.4'
                        MaxDomains = 2
                    })

                $definition.WasTruncated | Should -BeTrue
                $definition.OriginalWhitelistedDomainCount | Should -Be 3
                @($definition.EffectiveWhitelistedDomains).Count | Should -Be 2
                @($definition.EffectiveWhitelistedDomains) | Should -Be @('one.example.com', 'two.example.com')
            }
        }
    }

    Context "Acrylic installation fallback" {
        It "Pins the Acrylic portable installer to a release with modern hosts-cache fixes" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "internal" "DNS.Acrylic.Install.ps1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                '$installerVersion = "2.2.1"',
                'https://downloads.sourceforge.net/project/acrylic/Acrylic/$installerVersion/Acrylic-Portable.zip',
                'https://sourceforge.net/projects/acrylic/files/Acrylic/$installerVersion/Acrylic-Portable.zip/download'
            )
        }

        It "Falls back to Chocolatey when the direct Acrylic download fails" {
            $modulePath = Join-Path $PSScriptRoot ".." "lib" "internal" "DNS.Acrylic.Install.ps1"
            $content = Get-Content $modulePath -Raw

            Assert-ContentContainsAll -Content $content -Needles @(
                'Direct Acrylic install failed',
                'Get-Command choco',
                'install acrylic-dns-proxy -y --no-progress',
                'ProgramData\chocolatey\lib\acrylic-dns-proxy',
                'Get-ChildItem -Path $searchRoot -Filter ''AcrylicService.exe'' -Recurse',
                'Register-AcrylicServiceFromPath -AcrylicPath $acrylicPath',
                'Acrylic DNS Proxy installed successfully via Chocolatey'
            )
        }
    }
}
