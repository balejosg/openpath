# Firefox Extension AGENTS.md

WebExtension for detecting DNS/firewall blocks and submitting domain requests.

## Structure

```
firefox-extension/
├── src/
│   ├── background.ts   # Service worker entry
│   ├── content.ts      # Content script (injected)
│   ├── popup/          # Browser action popup
│   └── lib/            # Shared utilities
├── native/             # Native messaging host
│   ├── openpath-native-host.py
│   └── install-native-host.sh
├── manifest.json       # Extension manifest (MV2)
└── tests/              # Unit tests
```

## Key Components

| Component       | Purpose                                             |
| --------------- | --------------------------------------------------- |
| `background.ts` | webRequest interception, badge updates              |
| `content.ts`    | Page-level block detection                          |
| `native/`       | Local whitelist verification via native messaging   |
| `popup/`        | UI for viewing blocked domains, submitting requests |

## Manifest

- **Manifest Version**: 2 (Firefox compatibility)
- **Permissions**: `webRequest`, `webRequestBlocking`, `tabs`, `storage`, `nativeMessaging`
- **Content scripts**: Injected on all URLs

## Native Messaging

Python host for local whitelist verification:

```bash
./native/install-native-host.sh  # Installs host manifest
```

Host location: `~/.mozilla/native-messaging-hosts/`

## Conventions

- **Logging**: Use `lib/logger.ts`, not raw `console.*`
- **Storage**: `browser.storage.local` for persistence
- **Errors**: Graceful degradation if native host unavailable

## Testing

```bash
npm test                                    # All tests
npx tsx --test tests/background.test.ts    # Single file
```

## Build

```bash
npm run build      # Compile TS → dist/
./build-xpi.sh     # Create .xpi package
```

## Anti-Patterns

- Using Manifest V3 features (Firefox support incomplete)
- Blocking requests without user feedback
- Storing sensitive data in `storage.sync`
