## Summary

<!-- Explain the behavior change and why it is needed. -->

## Scope and public impact

- [ ] No credentials, private URLs, personal data, keystores, or generated build artifacts are included.
- [ ] I updated `README.md`, `BUILDING.md`, `API.md`, and/or `PRIVACY.md` where relevant.
- [ ] I updated Worker `/privacy` content and tests where a privacy disclosure changed.
- [ ] I considered compatibility for existing master credentials, issued user tokens, and stored links.

## Validation

Mark every relevant target. Leave an unchecked item only when it does not apply, and say why below.

| Target | Checks |
| --- | --- |
| Worker/API | `npm test`, `npm run typecheck`, and `npm run cf-typegen` if bindings changed |
| Chrome extension | `npm run extensions:build:chrome` and `npm run extensions:check` |
| Microsoft Edge extension | `npm run extensions:build:edge` and `npm run extensions:check` |
| Firefox extension | `npm run extensions:build:firefox` and `npm run extensions:check` |
| Android | `./gradlew test lint`; build debug/release artifacts when Gradle, manifests, or app behavior changed |
| Shell tools | PowerShell parser validation and `bash -n src/tools/short src/tools/short-admin` |
| Workflows/releases | Reviewed triggers, permissions, artifact paths, and required secret names |
| Branding/docs | Verified asset references and Markdown links |

### Commands run and results

<!-- Include concise, redacted results. -->

### Checks intentionally not run

<!-- List each non-applicable target and why. -->
