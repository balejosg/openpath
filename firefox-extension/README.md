# Monitor de Bloqueos de Red (Firefox Extension)

> Status: maintained
> Applies to: `firefox-extension/`
> Last verified: 2026-03-05
> Source of truth: `firefox-extension/README.md`

Firefox extension that detects and lists domains blocked by DNS whitelists or firewalls.

## What It Does

- Detects blocked requests (DNS/firewall-like failures) and aggregates blocked domains
- Shows a per-tab badge counter
- Lets you copy the blocked domain list
- Optional: submit domain requests to an API endpoint (when configured)
- Optional: Native Messaging host to verify domains against the local OpenPath CLI

## Development

From the OpenPath repo root (recommended):

```bash
npm install
npm run dev --workspace=@openpath/firefox-extension
```

Load into Firefox (temporary add-on):

1. Open `about:debugging`
2. "This Firefox" -> "Load Temporary Add-on..."
3. Select `firefox-extension/manifest.json`

## Build / XPI

```bash
npm run build --workspace=@openpath/firefox-extension
cd firefox-extension
./build-xpi.sh
```

## Using It

1. Browse normally.
2. When resources are blocked, the action badge shows a count.
3. Open the popup to view and copy the list.

Example: verify domains on Linux (with OpenPath installed):

```bash
sudo openpath check github.com
sudo openpath check api.somevendor.com
```

## Native Messaging (Optional)

Install the native host:

```bash
cd firefox-extension/native
./install-native-host.sh
```

Requirements:

- Python 3
- OpenPath Linux agent installed (provides the `openpath` CLI)

## Layout

```text
firefox-extension/
  manifest.json
  src/
  dist/
  popup/
  icons/
  native/
  tests/
  build-xpi.sh
  README.md
```

## Permissions

- `webRequest` / `webRequestBlocking`: detect network errors that indicate blocks
- `webNavigation`: clear tab state on navigation
- `tabs`: per-tab badge counter
- `clipboardWrite`: copy blocked domains
- `storage`: local preferences/state
- `nativeMessaging`: optional local verification
- `<all_urls>`: observe blocked third-party resources on any site
