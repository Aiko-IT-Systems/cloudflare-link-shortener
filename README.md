[![Latest release](https://img.shields.io/github/v/release/Aiko-IT-Systems/cloudflare-link-shortener?display_name=tag&sort=semver&style=for-the-badge)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/releases/latest) [![Release pipeline](https://img.shields.io/github/actions/workflow/status/Aiko-IT-Systems/cloudflare-link-shortener/release.yml?branch=main&label=release&style=for-the-badge)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/actions/workflows/release.yml) [![Repository size](https://img.shields.io/github/repo-size/Aiko-IT-Systems/cloudflare-link-shortener?label=repository%20size&style=for-the-badge)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener) [![License](https://img.shields.io/badge/license-Apache--2.0-7f52ff?style=for-the-badge)](LICENSE.md)

[![Firefox Add-ons](https://img.shields.io/amo/v/aitsys-go?style=for-the-badge&logo=firefoxbrowser&logoColor=FF7139&label=Firefox)](https://addons.mozilla.org/en-US/firefox/addon/aitsys-go/) [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/aojofmfhigoogjgafmnciphnijnkcmpe?style=for-the-badge&logo=googlechrome&logoColor=4285F4&label=Chrome)](https://chromewebstore.google.com/detail/aojofmfhigoogjgafmnciphnijnkcmpe) <!--[![Microsoft Edge](https://img.shields.io/badge/Edge-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](4dc3a2fb-ed19-43f9-99a9-9decb431ccfb) -->[![Google Play](https://img.shields.io/badge/Google_Play-414141?style=for-the-badge&logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=dev.aitsys.go)

# AITSYS Go

![Hero](/branding/hero.png)

AITSYS Go is a privacy-first, multi-user link shortener built on Cloudflare Workers. It shows people where a short link leads before redirecting them and does not collect click analytics, use cookies, or serve advertising.

It provides:

- a versioned REST API with account-scoped, revocable user tokens;
- a small web redirector with optional previews, passwords, and expiry;
- creation-focused Chrome, Microsoft Edge, and Firefox extensions;
- an Android 10+ share target and link-management app;
- a private Discord user app; and
- PowerShell and Bash tools for creating and administering links.

## Releases

Releases are built and published automatically from the `main` branch. 

> [!WARNING]
> Due to limitations, the extensions in releases are not signed initially.

The following extensions / apps are auto published:

| Type     | Publish Delay                         | Public Release?                  |
|----------|---------------------------------------|----------------------------------|
| chrome   | Can take a few days (manual approval) | Yes                              |
| firefox  | Can take a few days (manual approval) | Yes                              |
| android  | Usually within an hour                | No (Google Group or App Sharing) |

> [!NOTE]
> We try to attach the signed extension package to the release when they become available.

> [!NOTE]
> See the `publish-stores.yml` [runs](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/actions/workflows/publish-stores.yml) to get access to the app sharing link if you don't have access to the Play Store version yet.

> [!WARNING]
> Edge is still pending initial review.

## Documentation

- [Privacy policy](PRIVACY.md)
- [Fork and self-host with your own branding](docs/SELF_HOSTING.md)
- [Building, configuration, and releases](docs/BUILDING.md)
- [REST API reference](docs/API.md)
