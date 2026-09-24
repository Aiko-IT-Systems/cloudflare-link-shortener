# AITSYS GO CLI Tools

Cross-platform helpers for creating and managing AITSYS GO short links. Every operation uses the Worker API; Wrangler and a local repository checkout are not required.

## Setup

Set the API base and key. Use an issued account token with `short`, and the master administrator token with `short-admin`:

```powershell
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_BASE", "https://go.aitsys.dev", "User")
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_KEY", "<api-key>", "User")
```

Open a new terminal after setting the variable. Add this folder to `PATH` if you want to run the commands from anywhere.

On Linux:

```bash
export AITSYS_SHORT_API_BASE=https://go.aitsys.dev
export AITSYS_SHORT_API_KEY='<api-key>'
```

Linux requires `curl` and `jq`. Clipboard copying additionally uses `wl-copy`, `xclip`, or `xsel` when available.

## Commands

Create a random short link for the current GitHub repository:

```powershell
short
```

Useful options:

```powershell
short -NoClipboard
short -ExpiresIn 7d
short -ExpiresAt "2026-08-01T00:00:00Z"
short -SuppressSocialPreview
short -DestinationUrl "https://example.com" -Creator "AITSYS" -Title "Example"
```

Open the interactive admin tool:

```powershell
short-admin
```

List links:

```powershell
short-admin -List
```

List issued user-token records and their IDs, account IDs, optional labels, creation dates, and active/revoked state:

```powershell
short-admin -ListTokens
```

Native Bash equivalents include `short-admin list-links`, `short-admin list-tokens`, `short-admin list-accounts`, and the account/token management commands shown by `short-admin --help`.

### Populate Discord preview galleries for existing links

Existing records remain compatible and retain their normal Open Graph preview.
They are not automatically refetched during deployment: bulk-fetching every
destination would create surprise third-party traffic and can be unreliable for
rate-limited social platforms. When you deliberately want to populate the new
response-only `embedMedia` gallery field, run the confirmed, sequential admin
migration:

```powershell
short-admin -MigrateEmbedMedia
```

On Bash installations use `short-admin migrate-embed-media`. It skips disabled
links, preview-suppressed links, and records that already have a gallery. A
failed refresh leaves the existing preview intact and the tool waits one second
between destination requests.

All admin operations use the authenticated Worker API. Global link and token enumeration requires the master administrator key. Complete issued tokens are never stored or retrieved; token listings intentionally omit both the complete token and its SHA-256 digest. Link listings can report that password protection is enabled, but the API and tools never return or print a link password or its verifier.
