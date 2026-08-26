# Cloudflare Link Shortener

Transparent AITSYS link shortener for `go.aitsys.dev`.

Privacy: [AITSYS Go Privacy Policy](PRIVACY.md). The deployed Worker serves the same policy at `/privacy` (for example, `https://go.aitsys.dev/privacy`).

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. KV namespace `LINKS` is configured.

3. Secrets Store secret `LINK_SHORTENER_API_KEY` and `LINK_SHORTENER_DISCORD_PUBLIC_KEY` is configured.

4. Generate Worker types:

   ```bash
   npm run cf-typegen
   ```

## Branding

Public site branding is configured through the non-secret `vars` in
[`src/worker/wrangler.jsonc`](src/worker/wrangler.jsonc):

| Variable | Default | Used for |
| --- | --- | --- |
| `SITE_NAME` | `AITSYS Go` | Page titles, Open Graph site names, and default preview descriptions |
| `BRAND_LOGO_URL` | `/logo.png` | The page header logo and homepage social-preview image |
| `BRAND_LOGO_ALT` | `Aiko IT Systems` | Accessible alternative text for the header logo |
| `FAVICON_URL` | `/favicon.png` | The favicon linked from every generated page |
| `BRAND_COLOR` | `#fc0fc0` | The primary accent color |
| `PRIVACY_EMAIL` | `privacy@aitsys.dev` | Contact address displayed on the deployed `/privacy` page |

Root-relative URLs such as `/logo.png` are served from `src/worker/public/`.
Absolute URLs can be used for externally hosted assets. A relative
`BRAND_LOGO_URL` is resolved against the current request origin when it is
emitted as the homepage Open Graph image, so preview and custom domains produce
an absolute social-preview URL.

The checked-in AITSYS Go defaults are generated from the canonical cat-link SVG
in [`branding/aitsys-go-cat-link.svg`](branding/aitsys-go-cat-link.svg). It has
matching PNG exports, a multi-size
[`src/worker/public/favicon.ico`](src/worker/public/favicon.ico), public SVG
aliases, browser-extension SVGs, and an Android adaptive-icon vector drawable.
Do not redraw those formats independently; update the canonical mark and
regenerate them as one set.

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

List active accounts with `GET /api/v1/accounts?limit=25&cursor=<optional-cursor>`. The master credential can enumerate every stored link with `GET /api/v1/admin/links?limit=25&cursor=<optional-cursor>` and sanitized token records with `GET /api/v1/tokens?limit=25&cursor=<optional-cursor>`. Token listings never contain the complete token or its digest. Remove an account with `DELETE /api/v1/accounts/<account-id>`. Removal revokes every active issued token and removes the account from future listings, but retains its account ID permanently so a new user cannot inherit its old links. Existing short links remain public; their former user account cannot manage them.

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

The repository builds separate unsigned Manifest V3 packages for Chrome, Microsoft Edge, and Firefox from shared source:

```bash
npm run extensions:build
npm run extensions:check
```

Each popup pre-fills the active HTTPS tab and can create a short link with an optional custom slug, fallback title, password, expiry, preview suppression, and manual embed metadata. It displays the resulting full short URL and provides copy and open actions. Open its settings page first and enter the shortener base URL plus an **issued user token**. The extension declares access to all HTTPS hosts at installation time, so any HTTPS shortener endpoint can be used without a later permission prompt.

The current extension UI is deliberately creation-focused: it does **not** yet list, edit, refresh, or disable existing links. All three target builds and their manifests are validated locally by the commands above. They still need normal manual smoke-testing after loading the generated packages in Chrome, Edge, and Firefox; no browser-store signing, submission, GitHub release, or store publication is performed by this repository.

Browser extension storage is **not encrypted**. Never put
`LINK_SHORTENER_API_KEY` in an extension; use a revocable `aig_…` user token
and revoke it if a browser profile/device is compromised. The `Browser
Extensions Release` workflow packages versioned Chrome, Edge, and Firefox ZIPs,
plus an editable `aitsys-go-extension-source-…zip` containing
`src/extensions/` source without generated `dist/` output. Firefox accepts the
ZIP for AMO upload; copy or rename the Firefox ZIP to `.xpi` when installing it
directly in Firefox. Submit the Edge-branded ZIP to Microsoft Edge Add-ons.
Browser-store submission/signing is intentionally separate.

For Firefox submission, the manifest accurately declares the data required for the chosen operation: the issued token (**authentication information**) and the selected destination URL (**browsing activity**) are sent only to the shortener API base URL you configure when you create a link. The extension has no analytics, telemetry, or third-party data destination. Firefox's built-in consent requires Firefox 140+ on desktop and 142+ on Android.

### Extension branding metadata

`GET /api/v1/metadata` is a public, unauthenticated endpoint for extension and client presentation. It returns only the branding configured through Wrangler—no account, link, or token information:

```json
{
  "success": true,
  "result": {
    "apiVersion": 1,
    "branding": {
      "siteName": "AITSYS Go",
      "brandLogoUrl": "https://go.aitsys.dev/logo.png",
      "brandLogoAlt": "Aiko IT Systems",
      "faviconUrl": "https://go.aitsys.dev/favicon.png",
      "brandColor": "#fc0fc0",
      "privacyEmail": "privacy@aitsys.dev"
    }
  }
}
```

Relative logo and favicon configuration is resolved against the responding shortener origin. The extensions load this endpoint when opened and after saving a new base URL, applying its name, logo, alt text, favicon, and accent color. If an older or incompatible shortener does not provide it, the extension retains its local AITSYS fallback branding.

## Android app

`src/android/` contains a lightweight native Kotlin/Jetpack Compose client for
Android 10 (API 29) and newer. Its application ID is `dev.aitsys.go`; it
targets API 36 and uses the same issued account token and ownership scope as
the browser extensions and CLI tools. It has no analytics, ads, background
service, Retrofit, Room, or dependency-injection framework.

The app is an Android `ACTION_SEND` target for `text/plain`. When another app shares text to **AITSYS Go**, it extracts the first valid HTTPS URL. The saved share preference controls what happens next:

- **Configure** opens the normal prefilled form before publishing. This is the default.
- **Automatic** creates the link immediately and shows a compact result with copy, open, and share actions.

The create form supports custom slugs, fallback titles, passwords, ISO-8601 expiry, preview suppression, and manual embed metadata. **Manage** lists the current account's active links with cursor pagination and supports open, copy, sharing the short URL into other apps, edit, metadata refresh, and disable confirmation. Newly created results have the same outbound share action. Disabled links are not shown.

Open **Settings** and save an exact HTTPS shortener origin plus a revocable issued user token. The token is encrypted with an AES-GCM key held by Android Keystore and is excluded from backup. Ordinary settings and cached public branding use DataStore. Never put the master `LINK_SHORTENER_API_KEY` in the app.

The client loads `GET /api/v1/metadata`, applies the configured site name/color/privacy contact in-app, and downloads a capped, downscaled logo/favicon into private app storage. Android does not allow an installed app or Sharesheet icon to become an arbitrary downloaded image. The bundled launcher/share icon therefore remains static; **Add branded home shortcut** requests a separate pinned shortcut using the cached endpoint branding.

In **Settings → Privacy**, **Lock app with biometrics** is opt-in. When enabled, AITSYS Go locks whenever it leaves the foreground and requires a device biometric or the device's own PIN, pattern, or password before it displays saved link data or processes a received shared URL. It does not create, store, or transmit an app-specific passcode; a device must have a secure lock method configured before the option can be enabled.

Build and test locally with Android Studio's JDK and SDK, or equivalent JDK 17+ tooling:

```powershell
cd src/android
./gradlew test lint assembleDebug
```

The debug APK is written to
`src/android/app/build/outputs/apk/debug/app-debug.apk`. Manual device
smoke-testing should cover normal launch, Configure and Automatic sharing,
create/edit/refresh/disable, revoked-token handling, branding/shortcut
behavior, and offline/time-out errors.

### Android signing and releases

The `Android Release` GitHub Actions workflow runs on manual dispatch and on
pushes to `main` that change `src/android/**` or the workflow itself. It runs
unit tests and lint, builds a minified signed universal APK and Android App
Bundle, verifies both signatures, and publishes them as GitHub Release assets.
It never uploads or submits anything to Google Play. Configure these repository
secrets before relying on the push trigger:

| Secret | Value |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64-encoded upload-key keystore file |
| `ANDROID_UPLOAD_KEY_ALIAS` | Upload-key alias |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_UPLOAD_KEY_PASSWORD` | Key password |

Keep the original upload keystore and passwords in your own offline/password-manager backups. The encrypted GitHub Secrets copy is for CI recovery and builds, not the only copy. Neither a keystore nor `signing.properties` belongs in source control.

For the first Google Play release:

1. Create the Play Console app with package name `dev.aitsys.go` and opt into Play App Signing with a **Google-generated app-signing key**.
2. Generate a separate local upload key, keep the original yourself, and configure the four GitHub Secrets above. Upload the workflow-produced `.aab` manually to an internal test track first.
3. Use the deployed `/privacy` URL for the privacy-policy field. Complete Data Safety consistently with this policy: no ads/analytics; destination/link-form data and the issued authentication token are transmitted only to the user-configured shortener to provide the requested function.
4. For App Access review, create a dedicated, revocable issued user token and provide it with the API base URL and short test instructions. Revoke that reviewer token when it is no longer needed.
5. Complete the store listing, screenshots/feature graphic, content rating, target-audience declarations, and testing requirements, then promote manually after the internal build is proven.

The direct GitHub APK is signed with the upload key. A Play-installed build is re-signed by Google with the app-signing key, so a phone that switches from the GitHub APK to the Play build must uninstall once. Future Play updates then work normally.

## Discord user app

The Discord integration is an HTTP-interactions Worker route at `/discord/interactions`. It verifies Discord's Ed25519 request signature with the `DISCORD_PUBLIC_KEY` secret before parsing the body.

Configure these non-secret Worker variables in `src/worker/wrangler.jsonc`
before deployment:

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

`/manage` intentionally hides disabled links. It shows up to two active link cards per page, which stays below Discord Components V2's 40-component response limit. Each card shows the full `<interaction-host>/<slug>` URL in a Section with an **Open link** URL-button accessory; its edit, refresh, disable, and pagination controls remain below the section. Creation and management confirmations also return the full short URL. The interaction host is derived from the configured Discord interactions endpoint, rather than being hardcoded to `go.aitsys.dev`, so custom shortener domains produce matching Discord URLs.

The registration command is intentionally never run by deployment or CI. `DISCORD_BOT_TOKEN` is used only by that local registration script and is not a Worker binding.

## CLI Tools

Release ZIPs contain `short` and `short-admin` for PowerShell/Windows and native Bash/Linux, without hardcoded secrets. Set the API key before using them:

```powershell
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_KEY", "<api-key>", "User")
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_BASE", "<api-base>", "User")
```

Tool releases are published automatically when files under `src/tools/` change.
Linux requires `curl` and `jq`; optional clipboard integration uses `wl-copy`,
`xclip`, or `xsel`.

The PowerShell admin tool's interactive menu can create/list/remove user accounts, link a Discord user ID to an account, issue a labeled user token (shown once), list issued token records, and revoke a token. Token listing shows the revocable token ID, account ID, optional label, creation date, and active/revoked state; it never reveals the complete token or its digest. Run `short-admin -ListTokens` in PowerShell or `short-admin list-tokens` in Bash. All operations use the authenticated Worker API—Wrangler, Cloudflare account access, repository-directory switching, and a local checkout are not required. Global enumeration and account/token administration require the master `AITSYS_SHORT_API_KEY`. Account removal requires typing `REMOVE` and invalidates the account's active tokens.
