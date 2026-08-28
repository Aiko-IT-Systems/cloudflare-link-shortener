# AITSYS Go Privacy Policy

Last updated: 26 August 2026

AITSYS Go creates and manages short links. AITSYS Go does not use advertising, analytics, click tracking, cookies, tracking pixels, or telemetry.

## The shortener service

The service is hosted on Cloudflare Workers and uses Cloudflare KV to store the application data needed to operate the shortener. Cloudflare may process normal technical request data while providing that infrastructure under its own privacy policy.

When a link is created or managed, AITSYS Go stores its destination URL, slug, creation time, public creator name, ownership information, optional fallback title, password, expiry, preview choices, disable status, and fetched or manually supplied preview metadata. A short link and its preview details may be publicly visible to anyone who opens that short link.

Accounts store an account ID, public creator name, optional linked Discord user ID, and status. Issued user tokens are stored only as cryptographic hashes. The complete token is returned once when it is issued and cannot be retrieved later.

## Browser extensions

The Chrome, Microsoft Edge, and Firefox extensions store the configured API base URL and issued user token in browser extension storage. Browser extension storage is **not encrypted**. Never use the master administrator token in an extension; use a revocable issued user token instead.

When a person creates a link, the extension sends the selected page URL and the fields they enter to the configured shortener API. It also requests public branding metadata from that same API. The extension has no analytics, telemetry, advertising, or third-party data destination.

## Android app

The Android app stores its issued user token encrypted with an Android Keystore AES-GCM key and excludes the token from Android backup. It stores ordinary settings and cached public branding locally with DataStore. It sends entered link data, management requests, and optionally shared text containing a URL to the configured shortener API, and requests public branding metadata from it.

The app can optionally require the device's biometric authentication or device PIN, pattern, or password after it leaves the foreground. It does not create, store, or transmit an app-specific passcode. The app has no analytics, ads, telemetry, contacts access, or location access.

Google Play-distributed installs use Google Play's in-app update service to check for and install available updates. Google Play processes device metadata, the installed application version, and the list of installed modules or asset packs for that purpose. Google states that this data is encrypted, is not transferred to third parties, and is deleted after a fixed retention period. AITSYS Go does not receive this update-check data. Sideloaded builds do not receive updates through this service.

## Discord

The private Discord user app receives Discord interaction data to provide the requested command or message action. A stable Discord user ID is used for ownership checks and the current Discord username is stored as a public link author. If a selected message has multiple URLs, AITSYS Go temporarily stores the remaining URLs and invoking user ID for up to 15 minutes so that the batch can be continued or aborted.

## Distribution platforms

Browser extension stores and Google Play distribute the relevant application packages. Their account, download, installation, and store-review processing is governed by their own privacy policies. AITSYS Go does not receive store account data merely because someone installs an extension or app.

## Your choices

An administrator can revoke an issued token, disable a link, remove an account, or unlink a Discord identity. Account removal revokes the account's active tokens and prevents future account access, but existing public short links are retained so another account cannot inherit or manage them.

For privacy questions or data requests, contact [privacy@aitsys.dev](mailto:privacy@aitsys.dev).
