# Monitor de Bloqueos de Red - Firefox Extension

Extensión de Firefox para detectar y listar dominios bloqueados por sistemas de whitelist DNS y firewalls.

## Características

- Detección automática de dominios bloqueados (errores DNS / firewall)
- Contador por pestaña (badge)
- Copiar lista al portapapeles
- Solicitud de dominio (envío al servidor cuando está configurado)
- Native Messaging (opcional) para verificar dominios contra el sistema local

## Desarrollo

```bash
npm install
npm run dev
```

En Firefox:

1. `about:debugging`
2. "This Firefox" → "Load Temporary Add-on..."
3. Selecciona `manifest.json`

## Build / XPI

```bash
npm run build
./build-xpi.sh
```

## Uso

1. Navega a cualquier web.
2. Si hay recursos bloqueados, el icono muestra un contador.
3. Abre el popup para ver la lista y copiarla.

Ejemplo (verificar desde Linux con OpenPath instalado):

```bash
cat << 'EOF' | while read domain; do
  sudo openpath check "$domain"
done
cdn.ejemplo.com
api.terceros.com
EOF
```

## Native Messaging (Opcional)

Permite verificar dominios directamente contra el sistema local.

Instalación:

```bash
cd native
./install-native-host.sh
```

Requisitos:

- Python 3
- OpenPath Linux agent instalado (proporciona `/usr/local/bin/openpath`)

## Estructura

```
firefox-extension/
├── manifest.json      # Manifest V3 (Firefox)
├── src/               # TypeScript sources
│   ├── background.ts
│   ├── popup.ts
│   └── lib/
├── dist/              # Build output (JS)
├── popup/             # popup.html + popup.css
├── icons/
├── native/            # Native messaging host
├── tests/
├── build-xpi.sh
└── README.md
```

## Permisos

- `webRequest` / `webRequestBlocking`: detectar errores de red
- `webNavigation`: limpiar estado al navegar
- `tabs`: badge por pestaña
- `clipboardWrite`: copiar lista
- `nativeMessaging`: verificación local (opcional)
- `<all_urls>` (host permissions): observar recursos de terceros
