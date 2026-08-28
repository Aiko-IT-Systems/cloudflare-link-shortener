# Building and operating AITSYS Go

This is the supported production setup. AITSYS Go has one production Worker and deliberately does **not** support preview deployments, preview URLs, staging bindings, or non-production branch builds.

## Layout and prerequisites

| Path | Contents |
| --- | --- |
| `src/worker` | Cloudflare Worker and static assets |
| `src/extensions` | Shared Chrome, Edge, and Firefox extension source |
| `src/android` | Android 10+ Kotlin/Compose app |
| `src/cli` | PowerShell and Bash shell cli |

Install the Node.js version recorded in `package.json`, then install locked dependencies from the repository root:

```bash
npm ci
```

For Android, install Android Studio or JDK 17+ with Android SDK Platform 36 and Build Tools 36.0.0. PowerShell 7+ and Bash are needed to validate both tool variants.

## Cloudflare Worker production setup

The effective Worker configuration is generated from `wrangler.jsonc`
plus exactly one profile: a non-empty `wrangler.user.jsonc`, the canonical
`wrangler.aitsys.jsonc`, or no override for a fork. The generated file and
Wrangler redirect are ignored. Never add secret values to any of these files.

### Backing resources

In **Workers & Pages**:

1. Create or select the Worker that serves the shortener custom domain.
2. Deploy once. Wrangler automatically provisions and binds `LINKS` if no KV ID is supplied; it holds links, accounts, token hashes, ownership indexes, and short-lived Discord batch state.
3. Create two ordinary encrypted Worker secrets named `LINK_SHORTENER_API_KEY` and `DISCORD_PUBLIC_KEY`. The Discord registration bot token is deliberately never a Worker secret.
4. Add the production custom-domain route in the dashboard. `go.aitsys.dev` is the canonical deployment’s domain; another installation uses its own domain and zone.

### Runtime variables and bindings

Open **Workers & Pages → _Worker_ → Settings → Variables and Secrets** and use **Production**. These are runtime settings, not Workers Build variables. Forks own these values in the dashboard; the generic template never replaces them.

| Variable | Value/type | Purpose |
| --- | --- | --- |
| `SITE_NAME` | text | Page titles and default preview site name |
| `BRAND_LOGO_URL` | text URL or root-relative path | Header and social-preview logo |
| `BRAND_LOGO_ALT` | text | Accessible logo description |
| `FAVICON_URL` | text URL or root-relative path | Favicon for Worker-generated pages |
| `BRAND_COLOR` | text CSS color | Visual accent and public client branding |
| `PRIVACY_EMAIL` | text email address | `/privacy` contact and metadata value |
| `DISCORD_APPLICATION_ID` | text Discord application ID | Rejects interactions for another application |
| `DISCORD_ADMIN_USER_ID` | optional text Discord user ID | Enables the administrator profile and global Discord management |

The Worker requires `LINKS` plus both encrypted secrets before all functionality is available. Do not create them as Build secrets: they are runtime bindings used by the Worker.

### Runtime and privacy-preserving settings

Keep these choices unless the product design deliberately changes:

- `workers_dev: false`: serve only through the custom domain, not a public `workers.dev` URL.
- `preview_urls: false`: disable version preview URLs.
- In **Settings → Builds → Branch control**, leave **non-production branch builds** disabled. Do not configure a preview deploy command or preview environment. The dashboard can show a “Previews Base” tab even when it is unused.
- Keep `nodejs_compat`, Smart Placement, assets from `src/worker/public`, and minification as defined in `wrangler.jsonc`.
- Invocation logs are enabled at 100% sampling. They are operational logs, not click analytics. Do not add Web Analytics, Analytics Engine, or a click counter without revising product behavior and the privacy policy.
- Keep Worker cache disabled. Link state must be read fresh so disables, passwords, and expiry apply immediately.

### Workers Builds connection

Connect GitHub under **Settings → Builds** and configure only production:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Build command | none |
| Deploy command | `npm run deploy` |
| Root directory | `/` |
| Non-production branch builds | disabled |
| Build cache | enabled |
| Build variables/secrets | none required |

`npm run deploy` derives build metadata from the root `package.json` and the checked-out commit, then invokes Wrangler. In Workers Builds it uses Cloudflare's injected `WORKERS_CI_COMMIT_SHA`, so `/api/v1/metadata` identifies the deployed version, commit, and repository without dashboard variables. Do not set the dashboard root directory to `src/worker` while retaining that command; doing both resolves paths incorrectly. Workers Builds deploys production Worker changes only; it does not replace GitHub Actions artifact workflows.

### Local validation and deployment

Run the Worker locally:

```bash
npm run dev
```

Before an intentional production deployment:

```bash
npm run cf-typegen
npm test
npm run typecheck
npm run deploy -- --dry-run
```

Deploy only after the bindings, custom domain, and secrets are correct:

```bash
npm run deploy
```

> **Local deployment caveat:** `npm run deploy -- --dry-run` validates the
> generated configuration and bundle, but it does not perform Wrangler's remote
> dashboard-configuration reconciliation. If this Worker was previously
> configured in the Cloudflare dashboard, a real local deploy can warn that it
> would replace remote routes or observability settings. Treat that prompt as a
> stop: do not approve it blindly. Prefer the configured Workers Build for
> production deployments, or first reconcile the local profile with the
> dashboard configuration you intend to keep.

Then verify `https://<shortener-origin>/privacy`, `https://<shortener-origin>/api/v1/metadata`, a safe test redirect, and deployment logs. Never test a master token in a browser URL or a browser-console screenshot.

## Browser extensions

Chrome, Edge, and Firefox packages use shared source in `src/extensions`:

```bash
npm run extensions:build
npm run extensions:check
```

Output is written to `dist/chrome`, `dist/edge`, and `dist/firefox`. The release workflow packages unsigned archives and source only; store signing and submission are manual. Configure every extension with an issued user token, never `LINK_SHORTENER_API_KEY`.

## Android

The Kotlin/Jetpack Compose app is in `src/android` and supports Android 10 (API 29) and newer:

```powershell
cd src/android
./gradlew test lint assembleDebug
```

The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. Release builds need an upload key outside source control. Local signing uses ignored `signing.properties`; CI uses only these secret names: `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, and `ANDROID_UPLOAD_KEY_PASSWORD`. Android derives `versionName` from the root package version and computes `versionCode` as `major × 1,000,000 + minor × 1,000 + patch`; do not override either in Gradle. The release workflow builds and verifies an APK and AAB; it does not submit to Google Play. Play-distributed installs can offer flexible in-app updates (or an immediate flow for a Play release assigned high update priority); sideloaded and debug builds simply receive no available update from Play.

## Discord command registration

The Worker verifies Discord signatures with `DISCORD_PUBLIC_KEY`. Register commands manually after configuring the production endpoint and public key in the Discord Developer Portal:

```powershell
$env:DISCORD_APPLICATION_ID = '<application-id>'
$env:DISCORD_BOT_TOKEN = '<local-registration-token>'
npm run discord:register
```

This command is intentionally never run by Workers Builds, deployment, or GitHub Actions.

## Shell cli and unified releases

Validate the distributable shell cli before changing them:

```powershell
$files = Get-ChildItem src/cli -Filter *.ps1
foreach ($file in $files) {
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref] $null, [ref] $errors) | Out-Null
  if ($errors) { throw "PowerShell syntax check failed for $($file.FullName)" }
}
```

```bash
bash -n src/cli/short src/cli/short-admin
```

`.github/workflows/release.yml` is the single **Release AITSYS Go** workflow. It creates one `vX.Y.Z` GitHub Release containing the signed Android APK/AAB, Chrome/Edge/Firefox ZIPs, extension source ZIP, and cli ZIP. The root `package.json` is canonical: before building it synchronizes all browser manifest versions, commits `chore(release): vX.Y.Z` to `main`, tags that exact source revision, and then publishes only after every validation succeeds. The release workflow recognizes its own bot-authored version commit and skips a duplicate GitHub Release job, but intentionally does not use a CI-skip marker: Workers Builds must deploy that commit so the public Worker metadata reports the released version and SHA.

Qualifying pushes to `main` automatically make a patch release when they change `src/android/**`, `src/extensions/**`, `src/cli/**`, `scripts/check-extensions.mjs`, `package.json`, `package-lock.json`, or the unified workflow itself. Documentation and Worker-only changes do not create a GitHub Release. Use **Run workflow** on `main` to choose a patch, minor, or major increment. Releases are serialized so concurrent qualifying pushes cannot reuse a version.

The workflow intentionally does **not** call Google Play, use a Play service account, or submit an Android build to any store. Play upload and track promotion remain an operator-controlled follow-up. The Android formula avoids run-number collisions: every Play upload still needs a never-before-used, increasing `versionCode`.
