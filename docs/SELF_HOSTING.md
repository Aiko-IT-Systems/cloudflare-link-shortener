# Fork and self-host AITSYS Go

This guide creates an independent AITSYS Go installation: your own Cloudflare
Worker, KV data, admin credential, domain, branding, and optional Discord app.
Do not deploy a fork with the identifiers that are checked into this repository.
They belong to the AITSYS Go deployment and must be replaced.

## What you need

- a GitHub account for the fork;
- a Cloudflare account with Workers, KV, a Secrets Store, and a DNS zone for
  your chosen HTTPS domain;
- Node.js 24 and npm for the one-time local setup; and
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

## 2. Prepare the fork locally

Clone your fork and install the locked dependencies:

```bash
git clone https://github.com/<your-account>/<your-fork>.git
cd <your-fork>
npm ci
```

Choose the final public origin now, for example `go.example.com`. It must be
HTTPS: the extensions, Android app, and Discord interaction endpoint all expect
a secure origin.

## 3. Create independent Cloudflare resources

In the Cloudflare account that will own this installation:

1. Create a **KV namespace** for AITSYS Go data. It stores links, accounts,
   hashes of issued tokens, ownership indexes, and short-lived Discord batch
   state. Do not use it as disposable cache.
2. Create a **Secrets Store**.
3. In that store, create these secret records with freshly generated values:

   | Worker binding | Secret record name | Value |
   | --- | --- | --- |
   | `LINK_SHORTENER_API_KEY` | `LINK_SHORTENER_API_KEY` | A new, long random master admin token |
   | `DISCORD_PUBLIC_KEY` | `LINK_SHORTENER_DISCORD_PUBLIC_KEY` | Your Discord application's public key, if Discord is enabled |

Keep the master token in a password manager. Never put it in `wrangler.jsonc`,
the Git repository, browser extensions, Android settings, GitHub Actions, or a
Discord message. Browser and Android clients use revocable **issued user
tokens**, not the master credential.

If you will not use Discord initially, still create a placeholder secret record
with a non-empty value. The Worker binding is required at runtime. You can set
the real Discord public key before enabling the Discord endpoint.

## 4. Replace every deployment-specific value

Open [`src/worker/wrangler.jsonc`](src/worker/wrangler.jsonc). Replace all of
the following values; do not merely change the route.

| Setting | Replace it with |
| --- | --- |
| `name` | A unique Worker name in your Cloudflare account |
| `route.pattern` | Your custom domain, such as `go.example.com` |
| `route.zone_id` | The zone ID for that domain in your Cloudflare account |
| `account_id` | Your Cloudflare account ID |
| `kv_namespaces[0].id` | The ID of the KV namespace you just created |
| every `secrets_store_secrets[*].store_id` | Your Secrets Store ID |
| `DISCORD_APPLICATION_ID` | Your Discord application ID, or an empty string until Discord is configured |
| `DISCORD_ADMIN_USER_ID` | Your Discord user ID, or an empty string until Discord is configured |

Keep these Worker settings as they are unless you deliberately want different
behavior:

- `workers_dev: false` and `preview_urls: false` prevent public Workers.dev and
  version-preview URLs;
- the Worker cache remains disabled so link disables, passwords, and expiries
  take effect immediately; and
- `nodejs_compat`, Smart Placement, static assets, minification, and
  observability stay enabled.

## 5. Set your brand

The Worker reads its public identity from `vars` in `wrangler.jsonc`. Change
these values before the first deployment:

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

## 6. Connect and deploy the Worker

You may deploy locally with Wrangler, or connect the fork in the Cloudflare
dashboard. For the dashboard route:

1. Go to **Workers & Pages → Create → Connect to Git** and select your fork.
2. Select the Worker and set the production branch to `main`.
3. In **Settings → Builds**, use these production-only values:

   | Setting | Value |
   | --- | --- |
   | Build command | none |
   | Deploy command | `npm run deploy` |
   | Root directory | `/` |
   | Non-production branch builds | disabled |
   | Build cache | enabled |
   | Build variables/secrets | none required |

4. Do not configure a preview deploy command or preview environment. This
   project intentionally supports production deployments only.
5. In **Settings → Variables and Secrets**, use the **Production** tab and bind
   your KV namespace as `LINKS`, then bind both Secrets Store records under the
   exact binding names in the table above.
6. Deploy from `main` once, then attach or confirm the custom domain route.

The deploy command gets build metadata from `package.json` and the checked-out
commit. Do not move the dashboard root directory to `src/worker`; the command
expects the repository root.

Before a local deployment, validate the configuration:

```bash
npm run cf-typegen
npm test
npm run typecheck
npx wrangler deploy --dry-run --cwd src/worker
```

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
2. Copy its public key into your Cloudflare Secrets Store record
   `LINK_SHORTENER_DISCORD_PUBLIC_KEY`.
3. Set `DISCORD_APPLICATION_ID` and, if wanted, `DISCORD_ADMIN_USER_ID` in
   `wrangler.jsonc`, then deploy again.
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
