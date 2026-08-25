# Cloudflare Link Shortener

Transparent AITSYS link shortener for `go.aitsys.dev`.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. KV namespace `LINKS` is configured with ID `54872d4a38e6486e8f6cc053364d6f64`.

3. Secrets Store secret `LINK_SHORTENER_API_KEY` is configured in store `766810d8e2c04f1ca24dcc45253af39e`.

4. Generate Worker types:

   ```bash
   npm run cf-typegen
   ```

## Branding

Public site branding is configured through the non-secret `vars` in `wrangler.jsonc`:

| Variable | Default | Used for |
| --- | --- | --- |
| `SITE_NAME` | `AITSYS Go` | Page titles, Open Graph site names, and default preview descriptions |
| `BRAND_LOGO_URL` | `/logo.png` | The page header logo and homepage social-preview image |
| `BRAND_LOGO_ALT` | `Aiko IT Systems` | Accessible alternative text for the header logo |
| `FAVICON_URL` | `/favicon.png` | The favicon linked from every generated page |
| `BRAND_COLOR` | `#fc0fc0` | The primary accent color |

Root-relative URLs such as `/logo.png` are served from `public/`. Absolute URLs can be used for externally hosted assets. A relative `BRAND_LOGO_URL` is resolved against the current request origin when it is emitted as the homepage Open Graph image, so preview and custom domains produce an absolute social-preview URL.

These values are plain application configuration, not secrets. Wrangler `vars` are non-inheritable: if a named environment such as `env.staging` is added, define all five branding values again under that environment's `vars`. See Cloudflare's [environment variable documentation](https://developers.cloudflare.com/workers/configuration/environment-variables/) for environment-specific examples.

Run `npm run cf-typegen` after adding or renaming a binding. Changing only a branding value does not require regenerating the binding types.

## API and accounts

The original `LINK_SHORTENER_API_KEY` remains the master administrator credential. It can create or revoke user tokens and manage every link. When the administrator profile has been set up through Discord, master-key-created links are owned by that same profile; a supplied `creator` is still accepted for script compatibility. Links made with a user token always use that account's configured public creator name; a supplied `creator` value is ignored.

All API endpoints require:

```http
Authorization: Bearer <api-key>
```

Create a link with the master token:

```http
POST /api/v1/links
Content-Type: application/json

{
  "destinationUrl": "https://aitsys.dev",
  "creator": "Lulalaby",
  "slug": "aitsys",
  "title": "AITSYS",
  "password": "optional-password",
  "expiresAt": "2026-08-01T00:00:00.000Z",
  "suppressSocialPreview": false
}
```

Create an account and issue a browser/API token with the master token:

```http
POST /api/v1/accounts
Content-Type: application/json

{
  "id": "friend",
  "creatorName": "Friendly Cat",
  "discordUserId": "123456789012345678"
}
```

```http
POST /api/v1/accounts/friend/tokens
Content-Type: application/json

{
  "label": "Firefox"
}
```

The optional `discordUserId` links the Discord user to this same account. The token response contains the generated `aig_…` token exactly once. Store it in the target extension or client, not in source control. To revoke it, use `POST /api/v1/tokens/<token-id>/revoke` with the master credential.

To link or change an existing account's Discord user, call `PUT /api/v1/accounts/<account-id>/discord-user` with `{ "discordUserId": "123456789012345678" }`. A Discord user can be linked to only one active account. Linking migrates that user's older Discord-created links into the account, so `/manage`, browser extensions, and shells all manage the same link collection.

List active accounts with `GET /api/v1/accounts?limit=25&cursor=<optional-cursor>`. Remove an account with `DELETE /api/v1/accounts/<account-id>`. Removal revokes every active issued token and removes the account from future listings, but retains its account ID permanently so a new user cannot inherit its old links. Existing short links remain public; their former user account cannot manage them.

User tokens can only create, list, read, refresh, update, and disable links that they own. Their owned list is cursor-paginated:

```http
GET /api/v1/links?limit=10&cursor=<optional-cursor>
```

Update an owned link with `PATCH /api/v1/links/<slug>`. The update body may include `destinationUrl`, `title`, `password`, `expiresAt`, `suppressSocialPreview`, and any manual embed metadata. Use `null` to clear optional text/password/expiry fields. Updating a destination fetches fresh metadata for fields not explicitly supplied.

When a link is created, the Worker fetches the destination once and stores normal embed metadata (`og:title`, description, image, site name) so `go.aitsys.dev/<slug>` unfurls cleanly in chat apps while still showing the splash page.

Optional embed fields can also be supplied manually:

```json
{
  "embedTitle": "Custom preview title",
  "embedDescription": "Custom preview text",
  "embedImageUrl": "https://aitsys.dev/preview.png",
  "embedSiteName": "AITSYS"
}
```

Read a link:

```http
GET /api/v1/links/aitsys
```

Refresh stored embed metadata:

```http
POST /api/v1/links/aitsys/refresh-metadata
```

Password-protected links show a password prompt before the splash page. Expired links are checked at request time and render an expired page without needing a cron. `suppressSocialPreview: true` omits OpenGraph/Twitter tags for that short link.

Disable a link:

```http
POST /api/v1/links/aitsys/disable
Content-Type: application/json

{
  "reason": "No longer needed"
}
```

This service intentionally does not store click analytics, counters, cookies, or tracking data.

## Browser extensions

The repository builds separate unsigned Manifest V3 packages for Chrome and Firefox from shared source:

```bash
npm run extensions:build
npm run extensions:check
```

Each popup pre-fills the active HTTPS tab and can create a short link with an optional custom slug, fallback title, password, expiry, preview suppression, and manual embed metadata. It displays the resulting full short URL and provides copy and open actions. Open its settings page first and enter the shortener base URL plus an **issued user token**. The extension declares access to all HTTPS hosts at installation time, so any HTTPS shortener endpoint can be used without a later permission prompt.

The current extension UI is deliberately creation-focused: it does **not** yet list, edit, refresh, or disable existing links. Both target builds and their manifests are validated locally by the commands above. They still need normal manual smoke-testing after loading the generated packages in Chrome and Firefox; no browser-store signing, submission, GitHub release, or store publication is performed by this repository.

Browser extension storage is **not encrypted**. Never put `LINK_SHORTENER_API_KEY` in an extension; use a revocable `aig_…` user token and revoke it if a browser profile/device is compromised. The `Browser Extensions Release` workflow packages versioned Chrome and Firefox ZIPs; browser-store submission/signing is intentionally separate.

## Discord user app

The Discord integration is an HTTP-interactions Worker route at `/discord/interactions`. It verifies Discord's Ed25519 request signature with the `DISCORD_PUBLIC_KEY` secret before parsing the body.

Configure these non-secret Worker variables in `wrangler.jsonc` before deployment:

| Variable | Purpose |
| --- | --- |
| `DISCORD_APPLICATION_ID` | The Discord application ID used to reject interactions for another application. |
| `DISCORD_ADMIN_USER_ID` | Optional Discord user ID with global link administration and one-time administrator-profile setup through `/manage`. |

Keep the Discord application private and enable only user installation/private-channel contexts. Discord supplies a stable user ID for ownership and the invoking `username` is stored as the public link author.

After the endpoint and public key are configured in the Discord Developer Portal, register commands manually from an administrator shell:

```powershell
$env:DISCORD_APPLICATION_ID = "<application-id>"
$env:DISCORD_BOT_TOKEN = "<bot-token>"
npm run discord:register
```

This makes three global user-install commands:

- `/shorten url:<https-url>` opens a private creation modal.
- **Apps → Shorten link** extracts HTTPS URLs from a selected message. If several links are present, each completed modal offers **Fill next URL** or **Abort remaining**; already-created links are never removed by aborting.
- Every Discord command requires the invoking Discord user ID to be linked to an active shortener account. The single exception is the configured `DISCORD_ADMIN_USER_ID`: her first `/manage` opens a short setup modal for her chosen public author name. Completing it creates or adopts one administrator profile, links it to both her Discord ID and the master API-key path, and migrates all existing links into it. `/manage` is then an ephemeral Components V2 interface for that account's links, matching browser-extension and shell/API token access. The Discord administrator can view and manage every link, including legacy and API-created links.

`/manage` intentionally hides disabled links. It shows up to four active link cards per page, which stays below Discord Components V2's 40-component response limit. Each card shows the full `https://go.aitsys.dev/<slug>` URL in a Section with an **Open link** URL-button accessory; its edit, refresh, disable, and pagination controls remain below the section. Creation and management confirmations also return the full short URL.

The registration command is intentionally never run by deployment or CI. `DISCORD_BOT_TOKEN` is used only by that local registration script and is not a Worker binding.

## CLI Tools

Release ZIPs contain `aitsys-short` and `aitsys-short-admin` without hardcoded secrets. Set the API key before using them:

```powershell
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_KEY", "<api-key>", "User")
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_BASE", "<api-base>", "User")
```

Tool releases are published automatically when files under `tools/` change.

The admin tool's interactive menu can also create/list/remove user accounts, link a Discord user ID to an account, issue a labeled user token (shown once), and revoke a token. Account removal requires typing `REMOVE` and invalidates the account's active tokens. These actions require the master `AITSYS_SHORT_API_KEY`.
