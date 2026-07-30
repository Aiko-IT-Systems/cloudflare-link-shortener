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
  "title": "AITSYS"
}
```

Disable a link:

```http
POST /api/v1/links/aitsys/disable
Content-Type: application/json

{
  "reason": "No longer needed"
}
```

This service intentionally does not store click analytics, counters, cookies, or tracking data.

