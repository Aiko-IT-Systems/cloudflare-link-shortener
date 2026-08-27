# Fork and self-host AITSYS Go

This guide creates an independent AITSYS Go installation: your own Cloudflare
Worker, KV data, admin credential, domain, branding, and optional Discord app.
Forks do not inherit AITSYS identifiers. The checked-in Worker configuration
selects the AITSYS profile only for the canonical repository; a fork with an
empty user profile receives a generic dashboard-owned configuration.

## What you need

- a GitHub account for the fork;
- a Cloudflare account with Workers and a DNS zone for your chosen HTTPS
  domain; and
- optionally, a Discord application if you want Discord commands.

The browser extensions and Android app are clients of the Worker. You can use
the published artifacts from this project's GitHub Releases instead of building
them yourself, then point them at your own HTTPS origin.

## 1. Fork first, then disable inherited automation

1. Fork this repository into your own GitHub account or organization.
2. Open the fork's **Settings → Actions → General**.
3. Under **Actions permissions**, select **Disable actions** and save.
4. Confirm the **Actions** tab shows workflows disabled.

This repository's workflows can create version commits, tags, GitHub Releases,
and Android artifacts. Disable them before connecting Cloudflare or adding any
secrets. You can later enable only the workflows you understand and configure
for your own release process.

Cloudflare Workers Builds is separate from GitHub Actions. Disabling GitHub
Actions does not prevent Cloudflare from building and deploying the Worker.

## 2. Choose your public origin

Choose the final public origin now, for example `go.example.com`. It must be
HTTPS: the extensions, Android app, and Discord interaction endpoint all expect
a secure origin.

## 3. Deploy without editing configuration

Use the [Deploy to Cloudflare](../README.md#quick-deploy) button, or connect
your fork under **Workers & Pages → Create → Connect to Git**. Select `main`
as the production branch and use these production-only settings:

| Setting | Value |
| --- | --- |
| Build command | none |
| Deploy command | `npm run deploy` |
| Root directory | `/` |
| Non-production branch builds | disabled |
| Build cache | enabled |

Do not configure a preview deploy command or preview environment. The Worker
configuration automatically provisions and binds its `LINKS` KV namespace on
first deployment. It holds links, accounts, token hashes, ownership indexes,
and short-lived Discord batch state; it is not disposable cache.

The repository’s tracked `src/worker/wrangler.user.jsonc` starts as `{}`. Leave
it that way for this dashboard path. It exists only for a fork that deliberately
wants to commit non-secret local Wrangler overrides such as its Worker name,
account or KV ID, or `vars`. Domains and routes remain dashboard-owned.

## 4. Add production settings in Cloudflare

Open **Workers & Pages → _your Worker_ → Settings → Variables and Secrets** and
select **Production**. These are runtime settings, not Workers Build variables.

Create these two values as **encrypted secrets**:

| Secret name | Value |
| --- | --- |
| `LINK_SHORTENER_API_KEY` | A new, long random master admin token |
| `DISCORD_PUBLIC_KEY` | Your Discord application's public key, or a non-empty placeholder until Discord is enabled |

Keep the master token in a password manager. Never put it in a Wrangler config,
the Git repository, browser extensions, Android settings, GitHub Actions, or a
Discord message. Browser and Android clients use revocable **issued user
tokens**, not the master credential.

Set these optional text variables for your own public identity:

| Variable | Example | Used for |
| --- | --- | --- |
| `SITE_NAME` | `Mochi Go` | Redirect pages, titles, and client branding |
| `BRAND_LOGO_URL` | `/logo.png` or `https://cdn.example/logo.svg` | Header/social logo and client metadata |
| `BRAND_LOGO_ALT` | `Mochi Labs` | Accessible logo description |
| `FAVICON_URL` | `/favicon.png` | Worker-generated page favicon |
| `BRAND_COLOR` | `#8b5cf6` | Accent colour and client metadata |
| `PRIVACY_EMAIL` | `privacy@example.com` | Privacy page and metadata contact |

For root-relative logo or favicon paths, replace the corresponding files under
`src/worker/public/` and keep the paths in sync. Absolute HTTPS URLs are useful
when you host branding elsewhere. Check the result through:

```text
https://go.example.com/api/v1/metadata
```

That public endpoint is the source of branding used by the extensions and
Android app. It also exposes the deployed build version, commit SHA, and
repository for troubleshooting.

Attach or confirm your custom domain route after the first deployment. Keep
`workers.dev` and preview URLs disabled; the project supports production
deployments only.

The deploy command gets build metadata from `package.json` and the checked-out
commit. Do not move the dashboard root directory to `src/worker`; the command
expects the repository root.

Before a local deployment, validate the configuration:

```bash
npm run cf-typegen
npm test
npm run typecheck
npm run deploy -- --dry-run
```

The dry run validates the generated configuration and bundle only. On a Worker
that was already configured in the Cloudflare dashboard, a real **local** deploy
may still show a remote-configuration prompt for routes or observability. Do
not approve that prompt automatically: use the configured Workers Build for
production, or reconcile the local profile with the dashboard settings first.

After deployment, visit your `/privacy` page and `/api/v1/metadata` endpoint.
Create one harmless test link, verify the destination preview and redirect,
then delete or disable it.

## 7. Bootstrap accounts and clients

Use the master credential only from an administrator shell or the `short-admin`
tool to create an account and issue an account token. The full request and
response formats are documented in [API.md](API.md).

Give each person their own issued token. It can create and manage only that
account's links, and you can revoke it later. Never give an extension, Android
app, or another person your master `LINK_SHORTENER_API_KEY`.

Configure every client with your exact base URL, without a trailing API path:

```text
https://go.example.com
```

The extension and Android app fetch `/api/v1/metadata` from that origin, so
their displayed name, logo, colour, favicon/icon shortcut data, and privacy
contact follow your Worker branding.

## 8. Use existing releases instead of building apps

Open this project's [GitHub Releases](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/releases) and download the assets
that match the version you want to test:

| Asset | Use |
| --- | --- |
| `*-chrome.zip` | Load unpacked in Chrome or another Chromium browser |
| `*-edge.zip` | Load unpacked in Microsoft Edge |
| `*-firefox.zip` or a later signed `.xpi` | Install/test in Firefox as applicable |
| `*.apk` | Install directly on an Android device for testing |
| `*.aab` | Google Play upload bundle; not directly installable |

After installation, open the app or extension settings and set the base URL to
your own origin plus an issued user token. Do not use AITSYS's public endpoint
or any token from another installation.

The prebuilt clients are compatible with any correctly configured Worker using
this API. If you change client code or need a custom package identity, build
from your fork instead; see [BUILDING.md](BUILDING.md).

## 9. Optional Discord setup

Only configure this after the Worker is live:

1. Create your own Discord application and set its **Interactions Endpoint
   URL** to `https://go.example.com/discord/interactions`.
2. Set its public key as the encrypted Worker secret `DISCORD_PUBLIC_KEY`.
3. Set `DISCORD_APPLICATION_ID` and, if wanted, `DISCORD_ADMIN_USER_ID` in
   the Production dashboard variables, then deploy again.
4. On an administrator machine only, register commands using a local Discord
   registration token as described in [BUILDING.md](BUILDING.md#discord-command-registration).
5. Link Discord identities to accounts before users invoke commands. The Worker
   rejects Discord commands from identities without an active linked account.

The Discord bot/registration token must never be stored in Cloudflare bindings
or GitHub secrets for the Worker.

## Ongoing safety checklist

- Keep GitHub Actions disabled unless you deliberately configure the release
  process and its signing secrets for your fork.
- Use only issued account tokens in extensions and Android; revoke one rather
  than sharing credentials.
- Review the privacy policy and set a contact address you actually monitor.
- Back up your KV namespace and master credential according to your own
  retention and incident-response requirements.
- Keep your fork updated deliberately. Upstream changes can include schema,
  configuration, or dependency changes that need review before deployment.
