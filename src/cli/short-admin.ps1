param(
	[switch] $Help,
	[switch] $List,
	[switch] $ListTokens
)

$ErrorActionPreference = "Stop"

$ApiBase = $env:AITSYS_SHORT_API_BASE
$ApiToken = $env:AITSYS_SHORT_API_KEY

if ([string]::IsNullOrWhiteSpace($ApiToken)) {
	Write-Host "AITSYS_SHORT_API_KEY is not set." -ForegroundColor Red
	exit 1
}

function Invoke-LinkApi {
	param(
		[Parameter(Mandatory = $true)]
		[ValidateSet("GET", "POST", "PUT", "PATCH", "DELETE")]
		[string] $Method,

		[Parameter(Mandatory = $true)]
		[string] $Path,

		[object] $Body
	)

	$params = @{
		Method      = $Method
		Uri         = "$ApiBase$Path"
		Headers     = @{ Authorization = "Bearer $ApiToken" }
		HttpVersion = "2.0"
	}

	if ($null -ne $Body) {
		$params.ContentType = "application/json"
		$params.Body = ($Body | ConvertTo-Json -Depth 8)
	}

	try {
		Invoke-RestMethod @params
	}
 catch {
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

function New-ShortLink {
	$destinationUrl = Read-Required "Destination URL (https://...)"
	$creator = Read-Required "Creator"
	$title = Read-Host "Title (optional)"
	$slug = Read-Host "Custom slug (optional, leave empty for random)"
	$password = Read-Host "Password (optional)"
	$expiresAt = Read-Host "Expires at UTC ISO-8601 timestamp (optional, e.g. 2026-08-01T00:00:00.000Z)"
	$suppressPreview = Read-Host "Suppress social preview? (y/N)"

	$body = @{
		destinationUrl = $destinationUrl.Trim()
		creator        = $creator.Trim()
	}

	if (-not [string]::IsNullOrWhiteSpace($title)) { $body.title = $title.Trim() }
	if (-not [string]::IsNullOrWhiteSpace($slug)) { $body.slug = $slug.Trim() }
	if (-not [string]::IsNullOrWhiteSpace($password)) { $body.password = $password.Trim() }
	if (-not [string]::IsNullOrWhiteSpace($expiresAt)) { $body.expiresAt = ([DateTimeOffset]::Parse($expiresAt)).ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'") }
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
	if ($Link.hasPassword) { Write-Host "Password protected: yes" -ForegroundColor DarkYellow }
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

function New-ShortLinkAccount {
	$accountId = Read-Required "Account ID (letters, numbers, _ or -)"
	$creatorName = Read-Required "Public creator name"
	$discordUserId = Read-Host "Discord user ID (optional; links Discord commands to this account)"
	$body = @{ id = $accountId; creatorName = $creatorName }
	if (-not [string]::IsNullOrWhiteSpace($discordUserId)) { $body.discordUserId = $discordUserId.Trim() }
	$result = Invoke-LinkApi -Method POST -Path "/api/v1/accounts" -Body $body
	if ($result -and $result.success) {
		Write-Host "Created account $($result.result.id) for $($result.result.creatorName)." -ForegroundColor Green
	}
}

function Set-ShortLinkAccountDiscordUser {
	$accountId = Read-Required "Account ID"
	$discordUserId = Read-Required "Discord user ID"
	$result = Invoke-LinkApi -Method PUT -Path "/api/v1/accounts/$accountId/discord-user" -Body @{ discordUserId = $discordUserId }
	if ($result -and $result.success) {
		Write-Host "Linked Discord user $($result.result.discordUserId) to account $($result.result.id)." -ForegroundColor Green
	}
}

function New-ShortLinkUserToken {
	$accountId = Read-Required "Account ID"
	$label = Read-Host "Token label (optional, e.g. Firefox)"
	$body = @{}
	if (-not [string]::IsNullOrWhiteSpace($label)) { $body.label = $label.Trim() }
	$result = Invoke-LinkApi -Method POST -Path "/api/v1/accounts/$accountId/tokens" -Body $body
	if ($result -and $result.success) {
		Write-Host ""
		Write-Host "Issued token $($result.result.tokenId). Copy it now; it cannot be retrieved again." -ForegroundColor Yellow
		Write-Host $result.result.token -ForegroundColor Cyan
	}
}

function Revoke-ShortLinkUserToken {
	$tokenId = Read-Required "Token ID"
	$result = Invoke-LinkApi -Method POST -Path "/api/v1/tokens/$tokenId/revoke" -Body @{}
	if ($result -and $result.success) {
		Write-Host "Revoked token $($result.result.tokenId)." -ForegroundColor Yellow
	}
}

function Get-ShortLinkUserTokens {
	$items = @()
	$cursor = $null
	do {
		$path = "/api/v1/tokens?limit=100"
		if ($cursor) { $path += "&cursor=$([uri]::EscapeDataString($cursor))" }
		$result = Invoke-LinkApi -Method GET -Path $path
		if (-not $result -or -not $result.success) { return }
		$items += @($result.result.items)
		$cursor = $result.result.cursor
	} while ($cursor)

	if ($items.Count -eq 0) {
		Write-Host "No issued user tokens found." -ForegroundColor Yellow
		return
	}

	Write-Host ""
	Write-Host "Issued user tokens" -ForegroundColor Cyan
	foreach ($record in $items) {
		$tokenId = $record.id
		$label = if ($record.label) { "; label $($record.label)" } else { "" }
		$status = if ($record.revokedAt) { "revoked $($record.revokedAt)" } else { "active" }
		Write-Host "$tokenId -> account $($record.accountId)$label (created $($record.createdAt); $status)"
	}
}

function Get-ShortLinkAccounts {
	$result = Invoke-LinkApi -Method GET -Path "/api/v1/accounts?limit=100"
	if (-not $result -or -not $result.success) { return }

	if (-not $result.result.items -or $result.result.items.Count -eq 0) {
		Write-Host "No active user accounts found." -ForegroundColor Yellow
		return
	}

	Write-Host ""
	Write-Host "User accounts" -ForegroundColor Cyan
	foreach ($account in $result.result.items) {
		$discord = if ($account.discordUserId) { "; Discord $($account.discordUserId)" } else { "" }
		Write-Host "$($account.id) -> $($account.creatorName)$discord (created $($account.createdAt))"
	}
	if ($result.result.cursor) { Write-Host "More accounts exist; use the API cursor to continue." -ForegroundColor DarkGray }
}

function Remove-ShortLinkAccount {
	$accountId = Read-Required "Account ID to remove"
	$confirmation = Read-Host "Type REMOVE to revoke its tokens and remove the account"
	if ($confirmation -cne "REMOVE") {
		Write-Host "Account removal cancelled." -ForegroundColor DarkGray
		return
	}

	$result = Invoke-LinkApi -Method DELETE -Path "/api/v1/accounts/$accountId" -Body $null
	if ($result -and $result.success) {
		Write-Host "Removed account $($result.result.accountId) and revoked $($result.result.revokedTokenCount) active token(s)." -ForegroundColor Yellow
	}
}

function Get-ShortLinks {
	$items = @()
	$cursor = $null
	do {
		$path = "/api/v1/admin/links?limit=100"
		if ($cursor) { $path += "&cursor=$([uri]::EscapeDataString($cursor))" }
		$result = Invoke-LinkApi -Method GET -Path $path
		if (-not $result -or -not $result.success) { return }
		$items += @($result.result.items)
		$cursor = $result.result.cursor
	} while ($cursor)

	if ($items.Count -eq 0) {
		Write-Host "No links found." -ForegroundColor Yellow
		return
	}

	Write-Host ""
	Write-Host "Links" -ForegroundColor Cyan
	foreach ($record in $items) {
		$slug = $record.slug
		$flags = @()
		if ($record.hasPassword) { $flags += "password protected" }
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
	Write-Host "  short-admin"
	Write-Host ""
	Write-Host "Commands:"
	Write-Host "  short-admin -List"
	Write-Host "  short-admin -ListTokens"
	Write-Host "  short-admin -Help"
	Write-Host ""
	Write-Host "Note:"
	Write-Host "  Listing, user account, and token actions require the master AITSYS_SHORT_API_KEY."
	Write-Host "  All operations use the configured shortener API; Wrangler is not required."
}

if ($Help) { Show-Help; exit 0 }
if ($List) { Get-ShortLinks; exit 0 }
if ($ListTokens) { Get-ShortLinkUserTokens; exit 0 }

$running = $true
while ($running) {
	Write-Host ""
	Write-Host "AITSYS GO admin" -ForegroundColor Magenta
	Write-Host "1. Create link"
	Write-Host "2. Read link"
	Write-Host "3. Disable link"
	Write-Host "4. Refresh embed metadata"
	Write-Host "5. List links"
	Write-Host "6. Create user account"
	Write-Host "7. Issue user token"
	Write-Host "8. Revoke user token"
	Write-Host "9. List user tokens"
	Write-Host "10. List user accounts"
	Write-Host "11. Remove user account"
	Write-Host "12. Link Discord user to account"
	Write-Host "0. Exit"

	$choice = Read-Host "Choose"
	switch ($choice) {
		"1" { New-ShortLink }
		"2" { Get-ShortLink }
		"3" { Disable-ShortLink }
		"4" { Refresh-ShortLinkMetadata }
		"5" { Get-ShortLinks }
		"6" { New-ShortLinkAccount }
		"7" { New-ShortLinkUserToken }
		"8" { Revoke-ShortLinkUserToken }
		"9" { Get-ShortLinkUserTokens }
		"10" { Get-ShortLinkAccounts }
		"11" { Remove-ShortLinkAccount }
		"12" { Set-ShortLinkAccountDiscordUser }
		"0" { $running = $false }
		default { Write-Host "Pick 1 through 12, or 0." -ForegroundColor DarkYellow }
	}
}
