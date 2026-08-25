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

Root-relative URLs such as `/logo.png` are served from `public/`. Absolute URLs can be used for externally hosted assets. A relative `BRAND_LOGO_URL` is resolved against the current request origin when it is emitted as the homepage Open Graph image, so preview and custom domains produce an absolute social-preview URL.

These values are plain application configuration, not secrets. Wrangler `vars` are non-inheritable: if a named environment such as `env.staging` is added, define all four values again under that environment's `vars`. See Cloudflare's [environment variable documentation](https://developers.cloudflare.com/workers/configuration/environment-variables/) for environment-specific examples.

Run `npm run cf-typegen` after adding or renaming a binding. Changing only a branding value does not require regenerating the binding types.

## API

All admin endpoints require:

```http
Authorization: Bearer <api-key>
```

Create a link:

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

## CLI Tools

Release ZIPs contain `aitsys-short` and `aitsys-short-admin` without hardcoded secrets. Set the API key before using them:

```powershell
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_KEY", "<api-key>", "User")
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_BASE", "<api-base>", "User")
```

Tool releases are published automatically when files under `tools/` change.
