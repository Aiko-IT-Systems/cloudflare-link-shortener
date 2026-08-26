# AITSYS Go Privacy Policy

Last updated: 26 August 2026

AITSYS Go creates and manages short links. It does not use advertising, analytics, click tracking, cookies, or telemetry.

## Browser extension

The extension stores the shortener API base URL and an issued user token in your browser's extension storage. Browser extension storage is not encrypted. When you choose **Create short link**, it sends the selected page URL and the link fields you enter to the shortener API you configured, using that token. It also fetches public branding metadata from that same API. It does not send data to an analytics or advertising service.

## Android app

The Android app stores the shortener API base URL, sharing preference, and cached public branding on your device. It encrypts the issued user token with Android Keystore and excludes app settings and token storage from device backup. When you create or manage a link, it sends the destination and fields you enter to the shortener API you configured. It fetches public branding metadata and a capped logo or favicon from that same shortener for in-app presentation and an optional home-screen shortcut. It has no analytics, advertising, telemetry, contacts access, or location access.

## Shortener service and Discord

The shortener stores the information needed to operate a link: its destination, slug, optional title, password, expiry, preview settings, public creator name, ownership record, and fetched or manually supplied preview metadata. Issued API tokens are stored only as hashes; the complete token is shown once when issued.

If you use the Discord app, Discord supplies your Discord user ID and username. The service uses the user ID to check ownership and stores the username as the public author of links you create through Discord.

For a multi-link Discord batch, the service temporarily stores the pending URLs and the invoking user ID for up to 15 minutes so you can continue or abort the batch.

## Your choices

You can revoke an issued token, disable a link, and ask the service administrator to remove an account. Removing an account revokes its active tokens; existing public links are retained but can no longer be managed by that account.

For privacy questions, contact [privacy@aitsys.dev](mailto:privacy@aitsys.dev) or open an issue in this repository.
