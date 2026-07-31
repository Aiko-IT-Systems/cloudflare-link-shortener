# AITSYS GO CLI Tools

PowerShell helpers for creating and managing AITSYS GO short links.

## Setup

Set your API key in the system or user environment:

```powershell
[Environment]::SetEnvironmentVariable("AITSYS_SHORT_API_KEY", "<api-key>", "User")
```

Open a new terminal after setting the variable. Add this folder to `PATH` if you want to run the commands from anywhere.

## Commands

Create a random short link for the current GitHub repository:

```powershell
aitsys-short
```

Useful options:

```powershell
aitsys-short -NoClipboard
aitsys-short -ExpiresIn 7d
aitsys-short -ExpiresAt "2026-08-01T00:00:00Z"
aitsys-short -SuppressSocialPreview
aitsys-short -DestinationUrl "https://example.com" -Creator "AITSYS" -Title "Example"
```

Open the interactive admin tool:

```powershell
aitsys-short-admin
```

List links:

```powershell
aitsys-short-admin -List
```
