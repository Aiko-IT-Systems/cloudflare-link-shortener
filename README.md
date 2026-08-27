# AITSYS Go

[![Latest release](https://img.shields.io/github/v/release/Aiko-IT-Systems/cloudflare-link-shortener?display_name=tag&sort=semver&style=flat-square)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/releases/latest)
[![Release pipeline](https://img.shields.io/github/actions/workflow/status/Aiko-IT-Systems/cloudflare-link-shortener/release.yml?branch=main&label=release&style=flat-square)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/actions/workflows/release.yml)
[![Repository size](https://img.shields.io/github/repo-size/Aiko-IT-Systems/cloudflare-link-shortener?label=repository%20size&style=flat-square)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener)
[![License](https://img.shields.io/badge/license-Apache--2.0-7f52ff?style=flat-square)](LICENSE.md)

<!-- Store badges — enable these once the public listings are ready.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-4285F4?style=flat-square&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/aojofmfhigoogjgafmnciphnijnkcmpe)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-FF7139?style=flat-square&logo=firefoxbrowser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/98583e96ee6b4e0d89a2)
[![Google Play](https://img.shields.io/badge/Google_Play-414141?style=flat-square&logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=dev.aitsys.go)

TODO: add the Microsoft Edge Add-ons listing badge when its public listing URL is available (product ID: 4dc3a2fb-ed19-43f9-99a9-9decb431ccfb).
-->

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

Due to extension store limitations, extension zips are not signed.

If a version was submitted, we'll update the release with the signed package once it is available. (Firefox will have an `.xpi` package, and Chrome & Edge an `.crx` package. We are currently in the review process of these platforms)

Play Store releases are automatic. See the `publish-stores.yml` [runs](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/actions/workflows/publish-stores.yml) to get access to the app sharing link if you don't have access to the Play Store version yet.

## Documentation

- [Privacy policy](PRIVACY.md)
- [Fork and self-host with your own branding](docs/SELF_HOSTING.md)
- [Building, configuration, and releases](docs/BUILDING.md)
- [REST API reference](docs/API.md)
