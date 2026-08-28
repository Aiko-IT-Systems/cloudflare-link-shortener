# AITSYS Go API

Base URL examples use `https://short.example`. Replace it with your configured
shortener origin. Management endpoints accept JSON and need a bearer token:

```http
Authorization: Bearer <master-or-issued-token>
Content-Type: application/json
```

Never put credentials in URLs, source code, screenshots, or browser-extension
packages.

## Timestamp format

Inputs accept valid ISO-8601 timestamps with an explicit UTC offset. Every
timestamp returned by the API uses canonical UTC ISO-8601 form with millisecond
precision and a trailing `Z`, for example `2026-08-26T20:10:00.000Z`. This also
applies to legacy records whose stored timestamp used an equivalent offset such
as `+00:00`; reading them never rewrites KV data.

## Authentication roles

- The master `LINK_SHORTENER_API_KEY` can administer accounts and tokens and
  manage every link.
- An issued `aig_…` token can manage only its account’s links. The API derives
  its public creator and ownership from that account.
- Account removal revokes its tokens but retains existing public links and their
  ownership, so no later account can inherit them.

## Public endpoint

### `GET /api/v1/metadata`

Returns public presentation metadata for clients. Authentication is not needed.

**Request**

```http
GET /api/v1/metadata HTTP/1.1
Host: short.example
```

**200 response**

```json
{
	"success": true,
	"result": {
		"apiVersion": 1,
		"branding": {
			"siteName": "Example Go",
			"brandLogoUrl": "https://short.example/logo.png",
			"brandLogoAlt": "Example logo",
			"faviconUrl": "https://short.example/favicon.png",
			"brandColor": "#fc0fc0",
			"privacyEmail": "privacy@example.com"
		},
		"build": {
			"version": "2.0.1",
			"sha": "0123456789abcdef0123456789abcdef01234567",
			"repository": "https://github.com/Aiko-IT-Systems/cloudflare-link-shortener"
		}
	}
}
```

It never returns links, accounts, or credentials. `build` identifies the Worker
source currently deployed by Workers Builds: the shared release version, its
commit SHA, and repository URL. Clients should retain fallback branding if
`apiVersion` is unsupported.

### `GET /api/v1/connection-test`

Performs a lightweight unauthenticated connectivity check. It is intended for
client setup screens and does not verify an API token or access account data.

**Request**

```http
GET /api/v1/connection-test HTTP/1.1
Host: short.example
```

**200 response**

```json
{
	"success": true,
	"result": {
		"status": "ok",
		"apiVersion": 1
	}
}
```

The response intentionally mirrors the public metadata needed to confirm that
the configured base URL is an AITSYS Go-compatible Worker. Clients should not
use it as proof that a bearer token is valid; use `GET /api/v1/me` for that.

## Authenticated identity

### `GET /api/v1/me`

Returns the active account associated with the bearer token. The master token
returns the configured administrator account; an issued token returns its own
account. `disabledAt` and `deletedAt` are never included in a successful
response.

**Request**

```http
GET /api/v1/me HTTP/1.1
Host: short.example
Authorization: Bearer <master-or-issued-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"id": "friendly-cat",
		"creatorName": "Friendly Cat",
		"discordUserId": "123456789012345678",
		"createdAt": "2026-08-26T20:00:00.000Z"
	}
}
```

If the bearer token is missing or invalid, the usual `401` authentication
error is returned. A disabled or deleted issued-token account is also rejected
by authentication and receives `401` (`invalid_auth`); the account is not
revealed. A valid master token without an administrator profile also receives
`401` (`invalid_auth`) until that profile is created. `discordUserId` is always
present in a successful response and is `null` when the account is not linked
to Discord.

## Account endpoints

All account endpoints require the master credential.

### `POST /api/v1/accounts`

Creates an account. `id` is 2–64 letters, numbers, `_`, or `-`; `creatorName`
is 1–80 characters. `discordUserId` is optional and must be 17–20 digits.

**Request**

```http
POST /api/v1/accounts HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
Content-Type: application/json

{
  "id": "friendly-cat",
  "creatorName": "Friendly Cat",
  "discordUserId": "123456789012345678"
}
```

**201 response**

```json
{
	"success": true,
	"result": {
		"id": "friendly-cat",
		"creatorName": "Friendly Cat",
		"discordUserId": "123456789012345678",
		"createdAt": "2026-08-26T20:00:00.000Z"
	}
}
```

**Conflict response (`409`)**

```json
{
	"success": false,
	"errors": [
		{
			"code": "duplicate_account",
			"message": "That account already exists."
		}
	]
}
```

`discord_user_in_use` is returned instead when that Discord ID belongs to a
different active account.

### `GET /api/v1/accounts`

Lists active accounts. `limit` defaults to `25` and accepts `1`–`100`. Send the
returned cursor unchanged to request the next page.

**Request**

```http
GET /api/v1/accounts?limit=25&cursor=account%3Aprevious HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"items": [
			{
				"id": "friendly-cat",
				"creatorName": "Friendly Cat",
				"discordUserId": "123456789012345678",
				"createdAt": "2026-08-26T20:00:00.000Z"
			}
		],
		"cursor": "account%3Anext"
	}
}
```

The `cursor` property is absent on the final page.

### `DELETE /api/v1/accounts/:accountId`

Removes an account and revokes every active issued token. It does not delete
the account’s public links.

**Request**

```http
DELETE /api/v1/accounts/friendly-cat HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"accountId": "friendly-cat",
		"deletedAt": "2026-08-26T21:00:00.000Z",
		"revokedTokenCount": 2
	}
}
```

**Not-found response (`404`)**

```json
{
	"success": false,
	"errors": [
		{
			"code": "account_not_found",
			"message": "Account not found."
		}
	]
}
```

Attempting to remove the configured administrator profile returns `409` with
`administrator_account`.

### `PUT /api/v1/accounts/:accountId/discord-user`

Links or changes an account’s Discord user ID. Linking migrates older links
owned by that Discord identity into the account.

**Request**

```http
PUT /api/v1/accounts/friendly-cat/discord-user HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
Content-Type: application/json

{
  "discordUserId": "123456789012345678"
}
```

**200 response**

```json
{
	"success": true,
	"result": {
		"id": "friendly-cat",
		"creatorName": "Friendly Cat",
		"discordUserId": "123456789012345678",
		"createdAt": "2026-08-26T20:00:00.000Z"
	}
}
```

## Token endpoints

All token endpoints require the master credential.

### `POST /api/v1/accounts/:accountId/tokens`

Issues a revocable account token. `label` is optional and limited to 80
characters. The complete token is shown only in this response.

**Request**

```http
POST /api/v1/accounts/friendly-cat/tokens HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
Content-Type: application/json

{
  "label": "Firefox laptop"
}
```

**201 response**

```json
{
	"success": true,
	"result": {
		"token": "aig_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		"tokenId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"accountId": "friendly-cat",
		"label": "Firefox laptop",
		"createdAt": "2026-08-26T20:05:00.000Z"
	}
}
```

The token above is fake. Treat a real response token like a password.

### `GET /api/v1/tokens`

Lists sanitized token records. It never returns the token string or its digest.
`limit` defaults to `25` and accepts `1`–`100`.

**Request**

```http
GET /api/v1/tokens?limit=25 HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"items": [
			{
				"id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				"accountId": "friendly-cat",
				"label": "Firefox laptop",
				"createdAt": "2026-08-26T20:05:00.000Z"
			}
		],
		"cursor": "token%3Anext"
	}
}
```

### `POST /api/v1/tokens/:tokenId/revoke`

Revokes a known issued token. Repeating the request for the same known token is
safe and returns its original revocation timestamp.

**Request**

```http
POST /api/v1/tokens/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/revoke HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"tokenId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"revokedAt": "2026-08-26T21:10:00.000Z"
	}
}
```

## Link endpoints

### `POST /api/v1/links`

Creates a link. `destinationUrl` must be `https://`; omitting `slug` generates
one. An issued-token request ignores `creator` and derives it from its account.
A master request must send `creator` until the administrator profile has been
set up through Discord.

**Request**

```http
POST /api/v1/links HTTP/1.1
Host: short.example
Authorization: Bearer <issued-user-token>
Content-Type: application/json

{
  "destinationUrl": "https://www.example.com/docs",
  "slug": "example-docs",
  "title": "Example documentation",
  "expiresAt": "2027-01-31T12:00:00.000Z",
  "suppressSocialPreview": false,
  "embedTitle": "Example documentation",
  "embedDescription": "Safe fake documentation link.",
  "embedImageUrl": "https://www.example.com/preview.png",
  "embedSiteName": "Example"
}
```

**201 response**

```json
{
	"success": true,
	"result": {
		"slug": "example-docs",
		"destinationUrl": "https://www.example.com/docs",
		"creator": "Friendly Cat",
		"createdAt": "2026-08-26T20:10:00.000Z",
		"owner": {
			"kind": "account",
			"id": "friendly-cat"
		},
		"title": "Example documentation",
		"embedTitle": "Example documentation",
		"embedDescription": "Safe fake documentation link.",
		"embedImageUrl": "https://www.example.com/preview.png",
		"embedSiteName": "Example",
		"metadataFetchedAt": "2026-08-26T20:10:00.000Z",
		"expiresAt": "2027-01-31T12:00:00.000Z"
	}
}
```

The Worker fetches automatic metadata when creating a link; manually supplied
embed fields override it. A duplicate slug returns `409` with `duplicate_slug`.

### `GET /api/v1/links`

Lists accessible links. Issued tokens receive only their account-owned links.
Master requests list the administrator profile by default, or a selected owner
when `ownerKind=account|discord` and `ownerId` are supplied. Use the separate
administrator list below for every link. `limit` defaults to `10` and accepts
`1`–`25`.

**Request**

```http
GET /api/v1/links?limit=10&cursor=owner%3Aaccount%3Afriendly-cat%3Aprevious HTTP/1.1
Host: short.example
Authorization: Bearer <issued-user-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"items": [
			{
				"slug": "example-docs",
				"destinationUrl": "https://www.example.com/docs",
				"creator": "Friendly Cat",
				"createdAt": "2026-08-26T20:10:00.000Z",
				"owner": {
					"kind": "account",
					"id": "friendly-cat"
				}
			}
		],
		"cursor": "owner%3Aaccount%3Afriendly-cat%3Anext"
	}
}
```

### `GET /api/v1/admin/links`

Lists every link. This endpoint is master-only; `limit` defaults to `25` and
accepts `1`–`25`.

**Request**

```http
GET /api/v1/admin/links?limit=25 HTTP/1.1
Host: short.example
Authorization: Bearer <master-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"items": [
			{
				"slug": "example-docs",
				"destinationUrl": "https://www.example.com/docs",
				"creator": "Friendly Cat",
				"createdAt": "2026-08-26T20:10:00.000Z",
				"owner": {
					"kind": "account",
					"id": "friendly-cat"
				}
			}
		]
	}
}
```

### `GET /api/v1/links/:slug`

Reads one accessible link. A master token can read every link; an issued token
can read only its own.

**Request**

```http
GET /api/v1/links/example-docs HTTP/1.1
Host: short.example
Authorization: Bearer <issued-user-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"slug": "example-docs",
		"destinationUrl": "https://www.example.com/docs",
		"creator": "Friendly Cat",
		"createdAt": "2026-08-26T20:10:00.000Z",
		"owner": {
			"kind": "account",
			"id": "friendly-cat"
		},
		"title": "Example documentation"
	}
}
```

**Not-found response (`404`)**

```json
{
	"success": false,
	"errors": [
		{
			"code": "not_found",
			"message": "Link not found."
		}
	]
}
```

### `PATCH /api/v1/links/:slug`

Updates an accessible link. Include at least one field. Supported fields are
`destinationUrl`, `title`, `password`, `expiresAt`,
`suppressSocialPreview`, `embedTitle`, `embedDescription`, `embedImageUrl`, and
`embedSiteName`. Use `null` to clear optional text, password, expiry, or manual
metadata. A changed destination refreshes automatic metadata for fields not
provided in the same request.

**Request**

```http
PATCH /api/v1/links/example-docs HTTP/1.1
Host: short.example
Authorization: Bearer <issued-user-token>
Content-Type: application/json

{
  "destinationUrl": "https://www.example.com/new-docs",
  "title": null,
  "password": null,
  "suppressSocialPreview": true
}
```

**200 response**

```json
{
	"success": true,
	"result": {
		"slug": "example-docs",
		"destinationUrl": "https://www.example.com/new-docs",
		"creator": "Friendly Cat",
		"createdAt": "2026-08-26T20:10:00.000Z",
		"owner": {
			"kind": "account",
			"id": "friendly-cat"
		},
		"suppressSocialPreview": true,
		"metadataFetchedAt": "2026-08-26T21:15:00.000Z"
	}
}
```

### `POST /api/v1/links/:slug/refresh-metadata`

Fetches and stores fresh automatic metadata for the current destination.

**Request**

```http
POST /api/v1/links/example-docs/refresh-metadata HTTP/1.1
Host: short.example
Authorization: Bearer <issued-user-token>
```

**200 response**

```json
{
	"success": true,
	"result": {
		"slug": "example-docs",
		"destinationUrl": "https://www.example.com/new-docs",
		"creator": "Friendly Cat",
		"createdAt": "2026-08-26T20:10:00.000Z",
		"owner": {
			"kind": "account",
			"id": "friendly-cat"
		},
		"embedTitle": "New example documentation",
		"embedDescription": "Fetched from the fake destination.",
		"metadataFetchedAt": "2026-08-26T21:20:00.000Z"
	}
}
```

### `POST /api/v1/links/:slug/disable`

Disables an accessible link. `reason` is optional and limited to 200 characters.

**Request**

```http
POST /api/v1/links/example-docs/disable HTTP/1.1
Host: short.example
Authorization: Bearer <issued-user-token>
Content-Type: application/json

{
  "reason": "No longer maintained"
}
```

**200 response**

```json
{
	"success": true,
	"result": {
		"slug": "example-docs",
		"destinationUrl": "https://www.example.com/new-docs",
		"creator": "Friendly Cat",
		"createdAt": "2026-08-26T20:10:00.000Z",
		"owner": {
			"kind": "account",
			"id": "friendly-cat"
		},
		"disabledAt": "2026-08-26T21:25:00.000Z",
		"disabledReason": "No longer maintained"
	}
}
```

Disabled links remain manageable but show an unavailable page instead of
redirecting.

## Browser-facing and Discord routes

`GET /`, `GET /privacy`, `GET /robots.txt`, and `GET /:slug` are browser-facing
routes rather than JSON management endpoints. `POST /:slug` accepts the HTML
password form for password-protected links.

`POST /api/v1/discord/interactions` is reserved for Discord. Discord signs the raw
request with Ed25519, so it is not a general client endpoint. Configure and
register it as described in [BUILDING.md](BUILDING.md).
