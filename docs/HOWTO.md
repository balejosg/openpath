# OpenPath How-To

> Status: maintained
> Applies to: OpenPath repository
> Last verified: 2026-04-13
> Source of truth: `docs/HOWTO.md`

## Install the Linux Agent

Published APT bootstrap:

```bash
curl -fsSL https://raw.githubusercontent.com/balejosg/openpath/gh-pages/apt/apt-bootstrap.sh | sudo bash
```

Managed browser requests are strict on Linux. The bootstrap only runs the browser
request setup after `openpath setup` leaves a valid API URL, classroom state, and
tokenized whitelist URL. Use `--skip-setup` only for package-only installs; it
does not prepare the browser unblock-request flow.

Source install:

```bash
cd linux
sudo ./install.sh --api-url "https://api.example.com" --classroom "<classroom-name>" --registration-token "<token>" --with-native-host
```

For source installs without managed browser requests, omit `--with-native-host`
and run `sudo openpath setup` later when classroom enrollment is available.

## Install the Windows Agent

Run as Administrator:

```powershell
.\Install-OpenPath.ps1 -WhitelistUrl "http://your-server:3000/export/group.txt"
```

Enrollment-token bootstrap:

```powershell
.\Install-OpenPath.ps1 -ApiUrl "https://api.example.com" -ClassroomId "<classroom-id>" -EnrollmentToken "<token>" -Unattended
```

The enrollment flow requires `-ApiUrl`; the installer still supports direct `-WhitelistUrl` bootstrap when you are not using API-backed enrollment.

## Run Core Services Locally

```bash
npm run dev --workspace=@openpath/api
npm run dev --workspace=@openpath/react-spa
npm run dev --workspace=@openpath/dashboard
```

## Build Extension Release Artifacts

```bash
npm run build:chromium-managed --workspace=@openpath/firefox-extension
npm run build:firefox-release --workspace=@openpath/firefox-extension -- --signed-xpi /path/to/signed.xpi
```

## Run Common Checks

```bash
npm run verify:agent
npm run verify:quick
npm run verify:docs
```

Subsystem-specific workflows are documented in the package READMEs linked from [`INDEX.md`](INDEX.md).
