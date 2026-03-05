# Firefox Extension AGENTS.md

WebExtension for detecting DNS/firewall blocks and submitting domain requests.

## Structure

```
firefox-extension/
├── src/
│   ├── background.ts   # Background script entry (compiled to dist/background.js)
│   ├── popup.ts        # Popup logic (compiled to dist/popup.js)
│   └── lib/            # Shared utilities
├── popup/              # popup.html + popup.css (loads dist/popup.js)
├── dist/               # Build output
├── native/             # Native messaging host (optional)
├── manifest.json       # Manifest V3
└── tests/              # Unit tests
```

## Manifest

- Manifest version: 3
- Background: module script (`dist/background.js`)
- Popup: `popup/popup.html` (loads `dist/popup.js`)

## Native Messaging

Optional Python host for local whitelist verification.

```bash
cd native
./install-native-host.sh
```

## Testing

```bash
npm test
npm run lint
npm run typecheck
```

## Build

```bash
npm run build
./build-xpi.sh
```
