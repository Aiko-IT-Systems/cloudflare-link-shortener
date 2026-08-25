param(
	[switch] $Help,
	[switch] $List,
	[string] $ProjectRoot
)

$ErrorActionPreference = "Stop"

Set-Location (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

$ApiBase = $env:AITSYS_SHORT_API_BASE
$ApiToken = $env:AITSYS_SHORT_API_KEY

if ([string]::IsNullOrWhiteSpace($ApiToken)) {
	Write-Host "AITSYS_SHORT_API_KEY is not set." -ForegroundColor Red
	exit 1
}

function Invoke-LinkApi {
	param(
		[Parameter(Mandatory = $true)]
		[ValidateSet("GET", "POST")]
		[string] $Method,

		[Parameter(Mandatory = $true)]
		[string] $Path,

		[object] $Body
	)

	$params = @{
		Method = $Method
		Uri = "$ApiBase$Path"
		Headers = @{ Authorization = "Bearer $ApiToken" }
	}

	if ($null -ne $Body) {
		$params.ContentType = "application/json"
		$params.Body = ($Body | ConvertTo-Json -Depth 8)
	}

	try {
		Invoke-RestMethod @params
	} catch {
		$response = $_.Exception.Response
		if ($response) {
			$status = [int] $response.StatusCode
			$message = $_.ErrorDetails.Message
			if ([string]::IsNullOrWhiteSpace($message)) {
				$message = $_.Exception.Message
			}

			Write-Host ""
			Write-Host "Request failed ($status): $message" -ForegroundColor Red
			return $null
		}

		throw
	}
}

function Read-Required {
	param([Parameter(Mandatory = $true)] [string] $Prompt)

	do {
		$value = Read-Host $Prompt
	} while ([string]::IsNullOrWhiteSpace($value))

	$value.Trim()
}

function Find-ProjectRoot {
	if (-not [string]::IsNullOrWhiteSpace($ProjectRoot)) {
		return (Resolve-Path $ProjectRoot).Path
	}

	$current = Get-Location
	while ($current) {
		$config = Join-Path $current.Path "wrangler.jsonc"
		if (Test-Path $config) {
			$json = Get-Content -Raw -Path $config
			if ($json -match '"name"\s*:\s*"cloudflare-link-shortener"') {
				return $current.Path
			}
		}

		$current = $current.Parent
	}

	return $null
}

function Invoke-WranglerKv {
	param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)

	$root = Find-ProjectRoot
	if (-not $root) {
		throw "Could not find the cloudflare-link-shortener repo. Run from the repo or pass -ProjectRoot."
	}

	Push-Location $root
	try {
		$output = npx wrangler @Arguments 2>$null
		if ($LASTEXITCODE -ne 0) {
			throw "wrangler $($Arguments -join ' ') failed."
		}

		return $output
	} finally {
		Pop-Location
	}
}

function New-ShortLink {
	$destinationUrl = Read-Required "Destination URL (https://...)"
	$creator = Read-Required "Creator"
	$title = Read-Host "Title (optional)"
	$slug = Read-Host "Custom slug (optional, leave empty for random)"
	$password = Read-Host "Password (optional)"
	$expiresAt = Read-Host "Expires at UTC ISO timestamp (optional, e.g. 2026-08-01T00:00:00Z)"
	$suppressPreview = Read-Host "Suppress social preview? (y/N)"

	$body = @{
		destinationUrl = $destinationUrl.Trim()
		creator = $creator.Trim()
	}

	if (-not [string]::IsNullOrWhiteSpace($title)) { $body.title = $title.Trim() }
	if (-not [string]::IsNullOrWhiteSpace($slug)) { $body.slug = $slug.Trim() }
	if (-not [string]::IsNullOrWhiteSpace($password)) { $body.password = $password.Trim() }
	if (-not [string]::IsNullOrWhiteSpace($expiresAt)) { $body.expiresAt = ([DateTimeOffset]::Parse($expiresAt)).ToUniversalTime().ToString("o") }
	if ($suppressPreview -match "^(y|yes)$") { $body.suppressSocialPreview = $true }

	$result = Invoke-LinkApi -Method POST -Path "/api/v1/links" -Body $body
	if ($result -and $result.success) {
		Write-Host ""
		Write-Host "Created: $ApiBase/$($result.result.slug)" -ForegroundColor Green
		Write-Host "Destination: $($result.result.destinationUrl)"
	}
}

function Get-ShortLink {
	$slug = Read-Required "Slug"
	$result = Invoke-LinkApi -Method GET -Path "/api/v1/links/$slug"
	if ($result -and $result.success) {
		Show-Link $result.result
	}
}

function Show-Link {
	param([Parameter(Mandatory = $true)] $Link)

	Write-Host ""
	Write-Host "Slug: $($Link.slug)" -ForegroundColor Cyan
	Write-Host "URL: $ApiBase/$($Link.slug)"
	Write-Host "Destination: $($Link.destinationUrl)"
	Write-Host "Creator: $($Link.creator)"
	Write-Host "Created: $($Link.createdAt)"
	if ($Link.title) { Write-Host "Title: $($Link.title)" }
	if ($Link.password) { Write-Host "Password: $($Link.password)" -ForegroundColor DarkYellow }
	if ($Link.expiresAt) { Write-Host "Expires: $($Link.expiresAt)" -ForegroundColor Yellow }
	if ($Link.suppressSocialPreview) { Write-Host "Social preview: suppressed" }
	if ($Link.disabledAt) { Write-Host "Disabled: $($Link.disabledAt)" -ForegroundColor Yellow }
	if ($Link.disabledReason) { Write-Host "Reason: $($Link.disabledReason)" }
}

function Disable-ShortLink {
	$slug = Read-Required "Slug to disable"
	$reason = Read-Host "Reason (optional)"
	$body = @{}
	if (-not [string]::IsNullOrWhiteSpace($reason)) { $body.reason = $reason.Trim() }

	$result = Invoke-LinkApi -Method POST -Path "/api/v1/links/$slug/disable" -Body $body
	if ($result -and $result.success) {
		Write-Host ""
		Write-Host "Disabled: $ApiBase/$slug" -ForegroundColor Yellow
	}
}

function Refresh-ShortLinkMetadata {
	$slug = Read-Required "Slug to refresh"
	$result = Invoke-LinkApi -Method POST -Path "/api/v1/links/$slug/refresh-metadata" -Body @{}
	if ($result -and $result.success) {
		Write-Host ""
		Write-Host "Refreshed: $ApiBase/$slug" -ForegroundColor Green
		if ($result.result.embedTitle) { Write-Host "Embed title: $($result.result.embedTitle)" }
		if ($result.result.embedDescription) { Write-Host "Embed description: $($result.result.embedDescription)" }
		if ($result.result.embedImageUrl) { Write-Host "Embed image: $($result.result.embedImageUrl)" }
	}
}

function Get-ShortLinks {
	Write-Host ""
	Write-Host "Fetching remote KV link keys..." -ForegroundColor DarkGray

	$keys = Invoke-WranglerKv kv key list --binding LINKS --remote --prefix "link:" | ConvertFrom-Json
	if (-not $keys -or $keys.Count -eq 0) {
		Write-Host "No links found." -ForegroundColor Yellow
		return
	}

	Write-Host ""
	Write-Host "Links" -ForegroundColor Cyan
	foreach ($key in $keys) {
		$slug = $key.name -replace "^link:", ""
		$record = Invoke-WranglerKv kv key get $key.name --binding LINKS --remote | ConvertFrom-Json
		$flags = @()
		if ($record.password) { $flags += "pw=$($record.password)" }
		if ($record.expiresAt) { $flags += "expires=$($record.expiresAt)" }
		if ($record.suppressSocialPreview) { $flags += "no-preview" }
		if ($record.disabledAt) { $flags += "disabled" }
		$suffix = if ($flags.Count -gt 0) { " [" + ($flags -join "; ") + "]" } else { "" }
		Write-Host "$ApiBase/$slug -> $($record.destinationUrl)$suffix"
	}
}

function Show-Help {
	Write-Host "AITSYS GO admin"
	Write-Host ""
	Write-Host "Interactive:"
	Write-Host "  aitsys-short-admin"
	Write-Host ""
	Write-Host "Commands:"
	Write-Host "  aitsys-short-admin -List [-ProjectRoot <repo>]"
	Write-Host "  aitsys-short-admin -Help"
	Write-Host ""
	Write-Host "Note:"
	Write-Host "  -List requires Wrangler access to the Cloudflare KV namespace."
	Write-Host "  With only AITSYS_SHORT_API_KEY, you can operate on slugs you already know."
}

if ($Help) { Show-Help; exit 0 }
if ($List) { Get-ShortLinks; exit 0 }

$running = $true
while ($running) {
	Write-Host ""
	Write-Host "AITSYS GO admin" -ForegroundColor Magenta
	Write-Host "1. Create link"
	Write-Host "2. Read link"
	Write-Host "3. Disable link"
	Write-Host "4. Refresh embed metadata"
	Write-Host "5. List links"
	Write-Host "0. Exit"

	$choice = Read-Host "Choose"
	switch ($choice) {
		"1" { New-ShortLink }
		"2" { Get-ShortLink }
		"3" { Disable-ShortLink }
		"4" { Refresh-ShortLinkMetadata }
		"5" { Get-ShortLinks }
		"0" { $running = $false }
		default { Write-Host "Pick 1, 2, 3, 4, 5, or 0." -ForegroundColor DarkYellow }
	}
}
