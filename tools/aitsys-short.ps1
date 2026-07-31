param(
	[string] $Remote = "origin",
	[string] $DestinationUrl,
	[string] $Creator,
	[string] $Title,
	[string] $ExpiresAt,
	[string] $ExpiresIn,
	[switch] $SuppressSocialPreview,
	[switch] $NoClipboard
)

$ErrorActionPreference = "Stop"

$ApiBase = "https://go.aitsys.dev"
$ApiToken = $env:AITSYS_SHORT_API_KEY

if ([string]::IsNullOrWhiteSpace($ApiToken)) {
	Write-Host "AITSYS_SHORT_API_KEY is not set." -ForegroundColor Red
	exit 1
}

function Invoke-Git {
	param([Parameter(ValueFromRemainingArguments = $true)] [string[]] $Arguments)

	$output = & git @Arguments 2>$null
	if ($LASTEXITCODE -ne 0) {
		throw "git $($Arguments -join ' ') failed. Are you inside a Git repository?"
	}

	($output | Out-String).Trim()
}

function Get-GhRepo {
	$output = & gh repo view --json name,url,owner 2>$null
	if ($LASTEXITCODE -ne 0) {
		return $null
	}

	$output | ConvertFrom-Json
}

function Convert-RemoteToWebUrl {
	param([Parameter(Mandatory = $true)] [string] $RemoteUrl)

	if ($RemoteUrl -match "^git@github\.com:(?<owner>[^/]+)/(?<repo>.+?)(\.git)?$") {
		return "https://github.com/$($Matches.owner)/$($Matches.repo -replace '\.git$', '')"
	}

	if ($RemoteUrl -match "^https://github\.com/(?<owner>[^/]+)/(?<repo>.+?)(\.git)?$") {
		return "https://github.com/$($Matches.owner)/$($Matches.repo -replace '\.git$', '')"
	}

	if ($RemoteUrl -match "^ssh://git@github\.com/(?<owner>[^/]+)/(?<repo>.+?)(\.git)?$") {
		return "https://github.com/$($Matches.owner)/$($Matches.repo -replace '\.git$', '')"
	}

	throw "Only GitHub remotes are supported right now: $RemoteUrl"
}

function Get-GitHubOwner {
	param([Parameter(Mandatory = $true)] [string] $WebUrl)

	$uri = [Uri] $WebUrl
	$parts = $uri.AbsolutePath.Trim("/") -split "/"
	if ($parts.Length -lt 2) {
		throw "Could not infer GitHub owner from $WebUrl"
	}

	$parts[0]
}

function Get-GitHubRepoName {
	param([Parameter(Mandatory = $true)] [string] $WebUrl)

	$uri = [Uri] $WebUrl
	$parts = $uri.AbsolutePath.Trim("/") -split "/"
	if ($parts.Length -lt 2) {
		throw "Could not infer GitHub repo name from $WebUrl"
	}

	$parts[1]
}

function Convert-Expiry {
	param([string] $At, [string] $In)

	if (-not [string]::IsNullOrWhiteSpace($At)) {
		return ([DateTimeOffset]::Parse($At)).ToUniversalTime().ToString("o")
	}

	if ([string]::IsNullOrWhiteSpace($In)) {
		return $null
	}

	if ($In -notmatch "^(?<amount>\d+)(?<unit>m|h|d|w)$") {
		throw "ExpiresIn must look like 30m, 12h, 7d, or 2w."
	}

	$amount = [int] $Matches.amount
	$expires = switch ($Matches.unit) {
		"m" { [DateTimeOffset]::UtcNow.AddMinutes($amount) }
		"h" { [DateTimeOffset]::UtcNow.AddHours($amount) }
		"d" { [DateTimeOffset]::UtcNow.AddDays($amount) }
		"w" { [DateTimeOffset]::UtcNow.AddDays($amount * 7) }
	}

	$expires.ToString("o")
}

$repoRoot = Invoke-Git rev-parse --show-toplevel
Set-Location $repoRoot
$repo = Get-GhRepo

if ([string]::IsNullOrWhiteSpace($DestinationUrl)) {
	if ($repo) {
		$DestinationUrl = $repo.url
	} else {
		$remoteUrl = Invoke-Git remote get-url $Remote
		$DestinationUrl = Convert-RemoteToWebUrl $remoteUrl
	}
}

if ([string]::IsNullOrWhiteSpace($Creator)) {
	if ($repo) {
		$Creator = $repo.owner.login
	} else {
		$Creator = Get-GitHubOwner $DestinationUrl
	}
}

if ([string]::IsNullOrWhiteSpace($Title)) {
	if ($repo) {
		$Title = $repo.name
	} else {
		$Title = Get-GitHubRepoName $DestinationUrl
	}
}

$body = @{
	destinationUrl = $DestinationUrl.Trim()
	creator = $Creator.Trim()
	title = $Title.Trim()
}

$expiry = Convert-Expiry -At $ExpiresAt -In $ExpiresIn
if ($expiry) {
	$body.expiresAt = $expiry
}

if ($SuppressSocialPreview) {
	$body.suppressSocialPreview = $true
}

$headers = @{
	Authorization = "Bearer $ApiToken"
}

try {
	$response = Invoke-RestMethod -Method Post -Uri "$ApiBase/api/v1/links" -Headers $headers -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress)
} catch {
	$message = $_.ErrorDetails.Message
	if ([string]::IsNullOrWhiteSpace($message)) {
		$message = $_.Exception.Message
	}

	Write-Host "Failed to create short link: $message" -ForegroundColor Red
	exit 1
}

$shortUrl = "$ApiBase/$($response.result.slug)"
Write-Host $shortUrl -ForegroundColor Green
Write-Host "Destination: $DestinationUrl"
Write-Host "Creator: $Creator"
if ($expiry) {
	Write-Host "Expires: $expiry"
}

if (-not $NoClipboard) {
	Set-Clipboard -Value $shortUrl
	Write-Host "Copied to clipboard." -ForegroundColor DarkGray
}
