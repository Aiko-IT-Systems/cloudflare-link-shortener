# Building and operating AITSYS Go

This is the supported production setup. AITSYS Go has one production Worker and deliberately does **not** support preview deployments, preview URLs, staging bindings, or non-production branch builds.

## Layout and prerequisites

| Path | Contents |
| --- | --- |
| `src/worker` | Cloudflare Worker and static assets |
| `src/extensions` | Shared Chrome, Edge, and Firefox extension source |
| `src/android` | Android 10+ Kotlin/Compose app |
| `src/tools` | PowerShell and Bash shell tools |

Install the Node.js version recorded in `package.json`, then install locked dependencies from the repository root:

```bash
npm ci
```

For Android, install Android Studio or JDK 17+ with Android SDK Platform 36 and Build Tools 36.0.0. PowerShell 7+ and Bash are needed to validate both tool variants.

## Cloudflare Worker production setup

[`src/worker/wrangler.jsonc`](src/worker/wrangler.jsonc) is authoritative. Do not copy account IDs, KV IDs, Secrets Store IDs, Discord IDs, or secret values from another deployment. Create or select equivalent resources in the intended Cloudflare account and update only non-secret identifiers.

### Backing resources

In **Workers & Pages**:

1. Create or select the Worker that serves the shortener custom domain.
2. Create a KV namespace and bind it as `LINKS`. It holds links, accounts, token hashes, ownership indexes, and short-lived Discord batch state; it is not disposable cache.
3. Create or select a Cloudflare Secrets Store. Create these records in it, then bind them to the Worker:

   | Worker binding | Secret record name | Purpose |
   | --- | --- | --- |
   | `LINK_SHORTENER_API_KEY` | `LINK_SHORTENER_API_KEY` | Master administrator credential |
   | `DISCORD_PUBLIC_KEY` | `LINK_SHORTENER_DISCORD_PUBLIC_KEY` | Discord interaction signature verification key |

   The Discord registration bot token is deliberately **not** a Worker secret. It exists only on an administrator machine while registering commands.
4. Add the production custom-domain route. `go.aitsys.dev` is this deployment’s example; another installation needs its own domain and zone.

### Runtime variables and bindings

Open **Workers & Pages → _Worker_ → Settings → Variables and Secrets** and use **Production**. These are runtime settings, not Workers Build variables. The checked-in `vars` block provides the production defaults; dashboard values must agree after deployment.

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

Bind `LINKS` plus both Secrets Store records under their exact binding names. The Worker requires all three bindings before production traffic is accepted. Do not create them as Build secrets: they are runtime bindings used by the Worker.

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
npx wrangler deploy --dry-run --cwd src/worker
```

Deploy only after the bindings, custom domain, and secrets are correct:

```bash
npm run deploy
```

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

The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. Release builds need an upload key outside source control. Local signing uses ignored `signing.properties`; CI uses only these secret names: `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEY_ALIAS`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, and `ANDROID_UPLOAD_KEY_PASSWORD`. Android derives `versionName` from the root package version and computes `versionCode` as `major × 1,000,000 + minor × 1,000 + patch`; do not override either in Gradle. The release workflow builds and verifies an APK and AAB; it does not submit to Google Play.

## Discord command registration

The Worker verifies Discord signatures with `DISCORD_PUBLIC_KEY`. Register commands manually after configuring the production endpoint and public key in the Discord Developer Portal:

```powershell
$env:DISCORD_APPLICATION_ID = '<application-id>'
$env:DISCORD_BOT_TOKEN = '<local-registration-token>'
npm run discord:register
```

This command is intentionally never run by Workers Builds, deployment, or GitHub Actions.

## Shell tools and unified releases

Validate the distributable shell tools before changing them:

```powershell
$files = Get-ChildItem src/tools -Filter *.ps1
foreach ($file in $files) {
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref] $null, [ref] $errors) | Out-Null
  if ($errors) { throw "PowerShell syntax check failed for $($file.FullName)" }
}
```

```bash
bash -n src/tools/short src/tools/short-admin
```

`.github/workflows/release.yml` is the single **Release AITSYS Go** workflow. It creates one `vX.Y.Z` GitHub Release containing the signed Android APK/AAB, Chrome/Edge/Firefox ZIPs, extension source ZIP, and tools ZIP. The root `package.json` is canonical: before building it synchronizes all browser manifest versions, commits `chore(release): vX.Y.Z` to `main`, tags that exact source revision, and then publishes only after every validation succeeds. The release workflow recognizes its own bot-authored version commit and skips a duplicate GitHub Release job, but intentionally does not use a CI-skip marker: Workers Builds must deploy that commit so the public Worker metadata reports the released version and SHA.

Qualifying pushes to `main` automatically make a patch release when they change `src/android/**`, `src/extensions/**`, `src/tools/**`, `scripts/check-extensions.mjs`, `package.json`, `package-lock.json`, or the unified workflow itself. Documentation and Worker-only changes do not create a GitHub Release. Use **Run workflow** on `main` to choose a patch, minor, or major increment. Releases are serialized so concurrent qualifying pushes cannot reuse a version.

The workflow intentionally does **not** call Google Play, use a Play service account, or submit an Android build to any store. Play upload and track promotion remain an operator-controlled follow-up. The Android formula avoids run-number collisions: every Play upload still needs a never-before-used, increasing `versionCode`.
