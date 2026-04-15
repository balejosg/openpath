function Ensure-OpenPathHttpAssembly {
    if ('System.Net.Http.HttpClientHandler' -as [type]) {
        return
    }

    try {
        Add-Type -AssemblyName 'System.Net.Http' -ErrorAction Stop
    }
    catch {
        try {
            [System.Reflection.Assembly]::Load('System.Net.Http') | Out-Null
        }
        catch {
            throw "Failed to load System.Net.Http assembly: $_"
        }
    }

    if (-not ('System.Net.Http.HttpClientHandler' -as [type])) {
        throw 'System.Net.Http assembly loaded, but HttpClientHandler is still unavailable'
    }
}

function Invoke-OpenPathHttpGetText {
    <#
    .SYNOPSIS
        Performs a GET request and returns status, content, and ETag.
    #>
    param(
        [Parameter(Mandatory = $true)]
        [string]$RequestUrl,

        [string]$IfNoneMatch,

        [int]$TimeoutSec = 30
    )

    $client = $null
    $response = $null

    try {
        Ensure-OpenPathHttpAssembly

        $handler = [System.Net.Http.HttpClientHandler]::new()
        if ($handler.PSObject.Properties['AutomaticDecompression']) {
            $handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
        }

        $client = [System.Net.Http.HttpClient]::new($handler)
        $client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)

        $request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::Get,
            $RequestUrl
        )

        if ($IfNoneMatch) {
            try {
                $request.Headers.IfNoneMatch.Add([System.Net.Http.Headers.EntityTagHeaderValue]::Parse($IfNoneMatch))
            }
            catch {
                # Ignore invalid cached ETag
            }
        }

        $response = $client.SendAsync($request).GetAwaiter().GetResult()

        $statusCode = [int]$response.StatusCode
        $etag = $null
        if ($response.Headers.ETag) {
            $etag = $response.Headers.ETag.ToString()
        }

        if ($statusCode -eq 304) {
            return [PSCustomObject]@{
                StatusCode = $statusCode
                Content    = ''
                ETag       = $etag
            }
        }

        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $statusCode"
        }

        $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        return [PSCustomObject]@{
            StatusCode = $statusCode
            Content    = $content
            ETag       = $etag
        }
    }
    finally {
        if ($response) { $response.Dispose() }
        if ($client) { $client.Dispose() }
    }
}
