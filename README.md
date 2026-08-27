# AITSYS Go

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

If a version was submitted, we'll update the release with the signed package once it is available. (Firefox will have an `.xpi` package, and Chrome & Edge an `.crx` package)

Play Store releases are manually as well. If you want to install a release, use the apk. The aab file is for us to submit to the Play Store.

## Documentation

- [Privacy policy](PRIVACY.md)
- [Fork and self-host with your own branding](docs/SELF_HOSTING.md)
- [Building, configuration, and releases](docs/BUILDING.md)
- [REST API reference](docs/API.md)

## Quick local check

```bash
npm ci
npm test
npm run typecheck
```

The Worker lives in `src/worker`, browser extensions in `src/extensions`, the Android app in `src/android`, and shell cli in `src/cli`.
