## Summary

<!-- Explain the behavior change and why it is needed. -->

## Scope and public impact

- [ ] No credentials, private URLs, personal data, keystores, or generated build artifacts are included.
- [ ] I updated `README.md`, `docs/SELF_HOSTING.md`, `docs/BUILDING.md`, `docs/API.md`, and/or `PRIVACY.md` where relevant.
- [ ] I updated Worker `/privacy` content and tests where a privacy disclosure changed.
- [ ] I considered compatibility for existing master credentials, issued user tokens, and stored links.

## Validation

Mark every relevant target. Leave an unchecked item only when it does not apply, and say why below.

| Target                   | Checks                                                                                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Worker/API               | `npm test`, `npm run typecheck`, and `npm run cf-typegen` if bindings changed                                                                                                                                                      |
| Chrome extension         | `npm run extensions:build:chrome` and `npm run extensions:check`                                                                                                                                                                   |
| Microsoft Edge extension | `npm run extensions:build:edge` and `npm run extensions:check`                                                                                                                                                                     |
| Firefox extension        | `npm run extensions:build:firefox` and `npm run extensions:check`                                                                                                                                                                  |
| Android                  | From `src/android`: `./gradlew test lint`; build debug/release artifacts when Gradle, manifests, or app behavior changed                                                                                                           |
| Shell tools              | PowerShell parser validation for changed `src/cli` and `local-bin` scripts; `bash -n src/cli/short src/cli/short-admin`                                                                                                            |
| Workflows and releases   | Reviewed affected `pr-checks.yml`, `release.yml`, and `publish-stores.yml` triggers, environments, permissions, artifact paths, secret names, signing/attestation behavior, and the root-package/manifest/Android version contract |
| Branding/docs            | Verified asset references and Markdown links                                                                                                                                                                                       |

### Commands run and results

<!-- Include concise, redacted results. -->

### Checks intentionally not run

<!-- List each non-applicable target and why. -->
