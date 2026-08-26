# AITSYS Go

AITSYS Go is a privacy-first, multi-user link shortener built on Cloudflare Workers. It shows people where a short link leads before redirecting them and does not collect click analytics, use cookies, or serve advertising.

It provides:

- a versioned REST API with account-scoped, revocable user tokens;
- a small web redirector with optional previews, passwords, and expiry;
- creation-focused Chrome, Microsoft Edge, and Firefox extensions;
- an Android 10+ share target and link-management app;
- a private Discord user app; and
- PowerShell and Bash tools for creating and administering links.

## Documentation

- [Privacy policy](PRIVACY.md)
- [Building, configuration, and releases](BUILDING.md)
- [REST API reference](API.md)

## Quick local check

```bash
npm ci
npm test
npm run typecheck
```

The Worker lives in `src/worker`, browser extensions in `src/extensions`, the Android app in `src/android`, and shell tools in `src/tools`.
