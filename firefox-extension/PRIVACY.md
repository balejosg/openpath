# Privacy Policy - Monitor de Bloqueos de Red

**Last updated:** December 2024

## Overview

"Monitor de Bloqueos de Red" is a Firefox browser extension that helps identify domains blocked by DNS whitelists or firewalls. This privacy policy explains how the extension handles your data.

## Data Collection

**We do not collect any personal data.**

The extension operates entirely locally within your browser and does not transmit any information to external servers.

## Data Storage

| Data Type            | Storage Location     | Retention               |
| -------------------- | -------------------- | ----------------------- |
| Blocked domains list | Browser memory (RAM) | Cleared when tab closes |
| Tab-specific state   | Browser memory (RAM) | Cleared on navigation   |
| User preferences     | None stored          | N/A                     |

## Permissions Explained

| Permission        | Purpose                                            |
| ----------------- | -------------------------------------------------- |
| `webRequest`      | Monitor network errors to detect blocked domains   |
| `webNavigation`   | Reset state when navigating to new pages           |
| `tabs`            | Display blocked domain count per tab               |
| `clipboardWrite`  | Allow copying domain list to clipboard             |
| `nativeMessaging` | Optional local communication with whitelist system |
| `<all_urls>`      | Monitor all websites for blocked resources         |

### Why `<all_urls>`?

This extension needs access to all URLs because blocked resources can come from any domain. Without this permission, the extension could not detect third-party resources being blocked on websites you visit.

## Native Messaging

If you enable the optional native messaging feature:

- Communication occurs **only** with a local Python script on your computer
- The script queries your local whitelist configuration
- **No data leaves your computer**

## Third-Party Services

This extension does **not** use any third-party services, analytics, or tracking.

## Data Sharing

We do **not** share, sell, or transfer any data to third parties.

## Changes to This Policy

Any changes to this privacy policy will be reflected in the extension's repository and the "Last updated" date above.

## Contact

For questions about this privacy policy, please open an issue at:
https://github.com/balejosg/openpath/issues

## Open Source

This extension is open source. You can review the complete source code at:
https://github.com/balejosg/openpath/tree/main/firefox-extension
