[![Latest release](https://img.shields.io/github/v/release/Aiko-IT-Systems/cloudflare-link-shortener?display_name=tag&sort=semver&style=for-the-badge)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/releases/latest) [![Release pipeline](https://img.shields.io/github/actions/workflow/status/Aiko-IT-Systems/cloudflare-link-shortener/release.yml?branch=main&label=release&style=for-the-badge)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/actions/workflows/release.yml) [![Repository size](https://img.shields.io/github/repo-size/Aiko-IT-Systems/cloudflare-link-shortener?label=repository%20size&style=for-the-badge)](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener) [![License](https://img.shields.io/badge/license-Apache--2.0-7f52ff?style=for-the-badge)](LICENSE.md)

[![Firefox Add-ons](https://img.shields.io/amo/v/aitsys-go?style=for-the-badge&logo=firefoxbrowser&logoColor=FF7139&label=Firefox)](https://addons.mozilla.org/en-US/firefox/addon/aitsys-go/) [![Chrome Web Store](https://img.shields.io/chrome-web-store/v/aojofmfhigoogjgafmnciphnijnkcmpe?style=for-the-badge&logo=googlechrome&logoColor=4285F4&label=Chrome)](https://chromewebstore.google.com/detail/aojofmfhigoogjgafmnciphnijnkcmpe) [![Microsoft Edge](https://img.shields.io/badge/Edge-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)]([text](https://microsoftedge.microsoft.com/addons/detail/fokopafcjnjknmmndcplhgainhapcdoc)) [![Google Play](https://img.shields.io/badge/Google_Play-414141?style=for-the-badge&logo=googleplay&logoColor=white)](https://play.google.com/store/apps/details?id=dev.aitsys.go)

# AITSYS Go

![Hero](/media/web_home.png)

AITSYS Go is a privacy-first, multi-user link shortener built on Cloudflare Workers. It shows people where a short link leads before redirecting them and does not collect click analytics, use cookies, or serve advertising.

It provides:

- a versioned REST API with account-scoped, revocable user tokens;
- a small web redirector with optional previews, passwords, and expiry;
- creation-focused Chrome, Microsoft Edge, and Firefox extensions;
- an Android 10+ share target and link-management app;
- a private Discord user app; and
- PowerShell and Bash tools for creating and administering links.

## Apps & Extensions

### Chrome, Firefox, and Edge Extensions

You can quickly create short links from the browser with the Chrome, Firefox, and Edge extensions.

<details>
<summary>Screenshots</summary>

![Extension](/media/extension_quickcreate.png)

</details>

### Android App

The Android app is a share target and link management tool. It can be used to create short links from any app that supports sharing, and it can also be used to manage your links.

<details>
<summary>Screenshots</summary>

![Android App Create](/media/android_create.png)
![Android App Manage](/media/android_manage.png)
![Android App Settings](/media/android_settings.png)

</details>

### CLI Tools

The CLI tools are available for PowerShell and Bash. 

The have the most functionality of any of the apps, including creating links, managing links, and managing users.

### Discord User App

The Discord user app is a bot that can be added to your account.

It allows you to create links and manage links from Discord in servers & direct messages.

The most important commands are:

| Type                 | Command         | Description                        |
|----------------------|-----------------|------------------------------------|
| Slash Command        | `/shorten`      | Create a new short link            |
| Slash Command        | `/manage`       | Manage your links                  |
| Message Context Menu | `Shorten Links` | Create one or more new short links |

<details>
<summary>Screenshots</summary>

![Discord User App Shorten](/media/discord_shorten_command.png)
![Discord User App Manage](/media/discord_manage_command.png)
![Discord User App Create From Message](/media/discord_message_command.png)

</details>

### API

We provide a versioned REST API with account-scoped, revocable user tokens. The API is documented in [docs/API.md](docs/API.md).

## Releases

Releases are built and published automatically from the `main` branch. 

> [!WARNING]
> Due to limitations, the extensions in GitHub Releases are not signed.

The following extensions / apps are auto published:

| Type      | Publish Delay |
|-----------|---------------|
| chrome    | ~half hour    |
| firefox   | ~half hour    |
| edge      | ~half hour    |
| android\* | ~half hour    |
| cli       | Instantly     |

> [!NOTE]
> \* See the `publish-stores.yml` [runs](https://github.com/Aiko-IT-Systems/cloudflare-link-shortener/actions/workflows/publish-stores.yml) to get access to the app sharing link if you don't have access to the Play Store version yet.

## Documentation

- [Privacy policy](PRIVACY.md)
- [Fork and self-host with your own branding](docs/SELF_HOSTING.md)
- [Building, configuration, and releases](docs/BUILDING.md)
- [REST API reference](docs/API.md)
