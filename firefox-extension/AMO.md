# Firefox Add-ons (AMO) Submission Guide

This document contains information for submitting the extension to [addons.mozilla.org](https://addons.mozilla.org).

---

## Extension Details

- **Name:** Monitor de Bloqueos de Red
- **Version:** 1.1.0
- **Category:** Privacy & Security
- **License:** MIT (or specify your license)

---

## Description (Spanish)

```
Detecta y lista dominios bloqueados por sistemas de whitelist DNS y firewalls.

CARACTERÍSTICAS:
• Detección automática de dominios bloqueados (DNS/Firewall)
• Contador visual de bloqueos por pestaña
• Copiar lista de dominios al portapapeles
• Sin envío de datos a servidores externos
• Compatible con Native Messaging para verificación local

CASOS DE USO:
✓ Identificar recursos que bloquean el funcionamiento de páginas web
✓ Diagnosticar problemas de conectividad en redes corporativas
✓ Facilitar la gestión de whitelists DNS

PRIVACIDAD:
Esta extensión funciona 100% localmente. No envía ningún dato a servidores externos.
Todos los datos se almacenan en memoria volátil y se eliminan al cerrar la pestaña.

CÓDIGO ABIERTO:
El código fuente está disponible en GitHub para revisión.
```

---

## Description (English)

```
Detect and list domains blocked by DNS whitelist systems and firewalls.

FEATURES:
• Automatic detection of blocked domains (DNS/Firewall)
• Visual block counter per tab
• Copy domain list to clipboard
• No data sent to external servers
• Compatible with Native Messaging for local verification

USE CASES:
✓ Identify resources blocking website functionality
✓ Diagnose connectivity issues in corporate networks
✓ Facilitate DNS whitelist management

PRIVACY:
This extension works 100% locally. No data is sent to external servers.
All data is stored in volatile memory and deleted when the tab closes.

OPEN SOURCE:
Source code is available on GitHub for review.
```

---

## Permission Justifications

For the AMO review process, here are justifications for each permission:

### `<all_urls>`

> **Required** to detect blocked third-party resources on any website. Blocked resources can come from any domain (CDNs, APIs, analytics services, etc.). Without this permission, the extension cannot fulfill its core purpose of detecting all blocked domains.

### `webRequest`

> **Required** to intercept and monitor network request errors. This is the only way to detect NS_ERROR_UNKNOWN_HOST and similar errors that indicate blocked domains.

### `webNavigation`

> **Required** to reset the blocked domains list when navigating to a new page, ensuring accurate per-page tracking.

### `tabs`

> **Required** to update the badge counter showing the number of blocked domains for each tab.

### `clipboardWrite`

> **Required** to allow users to copy the list of blocked domains to the clipboard for use with external tools.

### `nativeMessaging`

> **Optional feature** that allows communication with a local Python script to verify domains against the local whitelist system. No external communication occurs.

---

## Reviewer Notes

```
This extension is designed for network administrators and users of DNS whitelist
systems who need to identify blocked resources.

Key points for review:
1. NO external network requests - all functionality is local
2. NO data persistence - all data is in volatile memory
3. NO tracking or analytics
4. Open source - full code available for review

The native messaging feature is optional and only communicates with a local
Python script installed on the user's system.
```

---

## Submission Checklist

- [ ] Create developer account at addons.mozilla.org
- [ ] Build XPI package: `./build-xpi.sh`
- [ ] Validate XPI at https://addons.mozilla.org/developers/addon/validate
- [ ] Submit extension: https://addons.mozilla.org/developers/addon/submit/
- [ ] Upload XPI file
- [ ] Fill in descriptions (use content from this file)
- [ ] Add screenshots (popup showing blocked domains, badge counter)
- [ ] Link privacy policy (point to PRIVACY.md in the repository)
- [ ] Provide source code link for review
- [ ] Wait for review (typically 1-7 days for new extensions)

---

## After Approval

Once approved, update `manifest.json` to remove the signature warning from README.md and update installation instructions.
