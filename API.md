# AITSYS Go API

The REST API is served by the configured shortener origin under `/api/v1`. Responses use this envelope:

```json
{ "success": true, "result": {} }
```

Errors return `success: false` with a stable error code and a human-readable message. Requests that manage accounts, tokens, or links require:

```http
Authorization: Bearer <credential>
```

Do not put credentials in URLs, source control, browser-extension bundles, or screenshots.

## Credentials and ownership

`LINK_SHORTENER_API_KEY` is the master administrator credential. It can manage all links and administer accounts and issued tokens. It remains compatible with the legacy create payload, including an optional `creator` field.

Issued `aig_…` user tokens are account-scoped, revocable credentials. They can create, read, list, update, refresh, and disable only links owned by their account. The user token determines both ownership and public creator name; a client-supplied `creator` is ignored.

## Accounts and tokens

These endpoints require the master credential:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/accounts` | Create an account with `id`, `creatorName`, and optional `discordUserId`. |
| `GET` | `/accounts?limit=25&cursor=…` | List active accounts. |
| `DELETE` | `/accounts/:accountId` | Remove an account and revoke its active tokens. Existing public links remain. |
| `PUT` | `/accounts/:accountId/discord-user` | Link or change the Discord user ID. |
| `POST` | `/accounts/:accountId/tokens` | Issue a token; accepts optional `label`. The complete token is returned once. |
| `GET` | `/tokens?limit=25&cursor=…` | List sanitized token records. |
| `POST` | `/tokens/:tokenId/revoke` | Revoke an issued token. |
| `GET` | `/admin/links?limit=25&cursor=…` | List every stored link. |

Account removal deliberately preserves ownership records and public links. It prevents a later account from inheriting or managing removed-account links.

## Links

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/links` | Create a link. |
| `GET` | `/links?limit=10&cursor=…` | List accessible links; issued tokens receive only owned links. |
| `GET` | `/links/:slug` | Read an accessible link. |
| `PATCH` | `/links/:slug` | Update an accessible link. |
| `POST` | `/links/:slug/refresh-metadata` | Fetch and store fresh preview metadata. |
| `POST` | `/links/:slug/disable` | Disable an accessible link; accepts optional `reason`. |

Create a link with `destinationUrl` and optional `slug`, `title`, `password`, `expiresAt`, `suppressSocialPreview`, `embedTitle`, `embedDescription`, `embedImageUrl`, and `embedSiteName`. Master-credential creation may also send `creator` for compatibility.

`PATCH` accepts the same mutable fields. Use JSON `null` to clear optional text, password, or expiry values. Changing `destinationUrl` fetches fresh preview metadata for fields that were not supplied manually.

List responses are cursor-paginated. Preserve the returned cursor unchanged and omit it on the first request. A disabled or expired link remains a record but does not redirect normally.

## Public branding metadata

`GET /api/v1/metadata` is public and requires no credential. It returns only the configured presentation data for clients:

```json
{
  "success": true,
  "result": {
    "apiVersion": 1,
    "branding": {
      "siteName": "AITSYS Go",
      "brandLogoUrl": "https://shortener.example/logo.png",
      "brandLogoAlt": "Brand logo",
      "faviconUrl": "https://shortener.example/favicon.png",
      "brandColor": "#fc0fc0",
      "privacyEmail": "privacy@example.com"
    }
  }
}
```

It never exposes links, accounts, tokens, or secrets. Clients should retain their local fallback branding if the endpoint is absent or incompatible.

## Discord interactions

`POST /discord/interactions` is reserved for Discord and is not a general client API. Discord signs each request; the Worker verifies it before parsing. Configure the endpoint and public key in Discord and Cloudflare, then use the local registration script described in [BUILDING.md](BUILDING.md).
