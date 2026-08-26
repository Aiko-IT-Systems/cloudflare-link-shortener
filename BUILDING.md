# Building and operating AITSYS Go

## Prerequisites

- Node.js and npm, using the version recorded by `packageManager` in `package.json`.
- Cloudflare access only when you intentionally run or deploy the Worker.
- Android Studio or JDK 17+ plus the Android SDK for Android builds.
- PowerShell 7+ and Bash to validate both tool variants.

Install JavaScript dependencies from the repository root:

```bash
npm ci
```

## Worker

The Cloudflare Worker is in `src/worker`. Run it locally or deploy it only when you have deliberately configured the relevant Cloudflare account and bindings:

```bash
npm run dev
npm run deploy
```

`src/worker/wrangler.jsonc` contains non-secret site configuration, including branding, `PRIVACY_EMAIL`, the route, KV binding, and Discord application IDs. Use Cloudflare secrets for `LINK_SHORTENER_API_KEY` and `LINK_SHORTENER_DISCORD_PUBLIC_KEY`; never put their values in source control. After changing bindings or public vars, refresh generated Worker types:

```bash
npm run cf-typegen
npm test
npm run typecheck
```

## Browser extensions

Chrome, Edge, and Firefox packages use shared source in `src/extensions`:

```bash
npm run extensions:build
npm run extensions:check
```

The output is written to `dist/chrome`, `dist/edge`, and `dist/firefox`. The release workflow packages unsigned archives only; browser-store submission and signing are deliberately manual.

## Android

The Kotlin/Jetpack Compose app is in `src/android` and supports Android 10 (API 29) and newer. Build it with the Gradle wrapper:

```powershell
cd src/android
./gradlew test lint assembleDebug
```

Release artifacts require an upload key outside source control. Local signing uses ignored `signing.properties`; CI receives the keystore and passwords only through the four `ANDROID_UPLOAD_KEY_*` repository secrets. The Android release workflow builds and verifies an APK and AAB but does not submit anything to Google Play.

## Discord registration

The Worker verifies Discord interactions using its public key. Command registration is a local administrator operation and is never run by deployment or CI:

```powershell
$env:DISCORD_APPLICATION_ID = '<application-id>'
$env:DISCORD_BOT_TOKEN = '<local-registration-token>'
npm run discord:register
```

The registration token is not a Worker binding and must not be committed.

## Shell tools

`src/tools` contains the distributable PowerShell and Bash clients. Validate both before release changes:

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

## Release workflows

The repository has separate GitHub Actions workflows for Android, browser extensions, and shell tools. They build versioned GitHub Release artifacts for their respective target. Review the workflow trigger and required secrets before enabling, dispatching, or changing a release path.
