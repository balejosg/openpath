# Monitor de Bloqueos de Red - Firefox Extension

Extensión de Firefox para detectar y listar dominios bloqueados por sistemas de whitelist DNS (como el sistema principal de este repositorio).

## Características

- 🔍 **Detección automática** de dominios bloqueados por DNS/Firewall
- 📋 **Copiar al portapapeles** la lista de dominios en formato texto
- 🔗 **Native Messaging** (opcional): Verifica dominios directamente contra el sistema local
- 📦 **Empaquetado XPI** para distribución

## Instalación

### Desarrollo (Temporal)

1. Abre Firefox y navega a `about:debugging`
2. Haz clic en "Este Firefox" (o "This Firefox")
3. Haz clic en "Cargar complemento temporal..."
4. Selecciona el archivo `manifest.json` de este directorio

### Producción (XPI)

```bash
# Crear el archivo XPI
./build-xpi.sh

# El archivo se crea en: monitor-bloqueos-red-X.X.X.xpi
```

Para instalar el XPI:

1. Firefox → `about:addons`
2. Engranaje → "Instalar complemento desde archivo..."
3. Selecciona el archivo XPI

> **Nota**: La extensión no está firmada. Solo funciona en Firefox Developer Edition/Nightly con `xpinstall.signatures.required = false` en `about:config`.

### Firefox Release (XPI firmado)

Firefox Release no puede depender del árbol local descomprimido ni del XPI generado por
`./build-xpi.sh`. Para el rollout administrado de OpenPath en Windows necesitas una
distribución firmada y uno de estos dos caminos:

1. Configurar el agente con `firefoxExtensionId` y `firefoxExtensionInstallUrl`.
2. Copiar artefactos firmados en `build/firefox-release/` para que el bootstrap de Windows los
   distribuya como parte del paquete del agente.

Estructura esperada para `build/firefox-release/`:

```text
build/firefox-release/
├── metadata.json
└── openpath-firefox-extension.xpi
```

`metadata.json` debe incluir al menos el ID de la extensión y la versión:

```json
{
  "extensionId": "monitor-bloqueos@openpath",
  "version": "1.0.0",
  "installUrl": "https://addons.mozilla.org/firefox/downloads/latest/monitor-bloqueos@openpath/latest.xpi"
}
```

- `installUrl` es opcional cuando también existe `openpath-firefox-extension.xpi`.
- Si `installUrl` no está presente, OpenPath usa el XPI firmado copiado mediante una URL
  `file:///`.
- Si no existe ninguna distribución firmada, Windows mantiene las políticas de navegador pero
  omite la auto-instalación en Firefox Release.

### Chromium Gestionado (Edge/Chrome)

```bash
# Generar bundle Chromium y, si hay packager compatible, CRX + metadata gestionada
npm run build:chromium-managed
```

El script siempre prepara `build/chromium-unpacked/` para validación manual. Si además encuentra un navegador compatible para empaquetar y, opcionalmente, una clave estable en `OPENPATH_CHROMIUM_EXTENSION_KEY`, genera `build/chromium-managed/metadata.json` y `openpath-chromium-extension.crx` para el rollout gestionado que consume la API de Windows.

Estructura esperada para `build/chromium-managed/`:

```text
build/chromium-managed/
├── metadata.json
└── openpath-chromium-extension.crx
```

`metadata.json` debe incluir al menos el ID Chromium y la versión:

```json
{
  "extensionId": "abcdefghijklmnopabcdefghijklmnop",
  "version": "1.0.0"
}
```

Flujo recomendado para Windows:

1. Genera `build/chromium-managed/` en el host que publica la API OpenPath.
2. Asegura que `apiUrl` en `C:\OpenPath\data\config.json` apunta a esa API pública.
3. El instalador de Windows busca la metadata Chromium en `browser-extension\chromium-managed\`
   o `firefox-extension\build\chromium-managed\`, la copia bajo
   `C:\OpenPath\browser-extension\chromium-managed\` y escribe `ExtensionInstallForcelist`
   para Chrome y Edge.
4. Chrome/Edge descargan el CRX usando:
   - `GET /api/extensions/chromium/updates.xml`
   - `GET /api/extensions/chromium/openpath.crx`

- Si falta `apiUrl`, Windows no puede resolver la URL del manifiesto de actualización.
- Si faltan `metadata.json` o el CRX publicado por la API, OpenPath mantiene las políticas de
  bloqueo del navegador pero omite la auto-instalación en Edge/Chrome.
- Si el equipo Windows no está gestionado, OpenPath puede usar `chromeExtensionStoreUrl` y
  `edgeExtensionStoreUrl` para abrir la tienda correspondiente y dejar accesos `.url` de
  instalación guiada en vez de intentar un `force install`.

### Publicar en Firefox Add-ons (AMO)

Para publicar la extensión en [addons.mozilla.org](https://addons.mozilla.org):

1. Crea una cuenta de desarrollador en AMO
2. Genera el XPI: `./build-xpi.sh`
3. Valida el XPI en https://addons.mozilla.org/developers/addon/validate
4. Sube la extensión en https://addons.mozilla.org/developers/addon/submit/
5. Usa las descripciones incluidas en [AMO.md](./AMO.md)
6. Enlaza la política de privacidad: [PRIVACY.md](./PRIVACY.md)

> **Tiempo de revisión**: Las extensiones nuevas suelen tardar 1-7 días en ser aprobadas.

Una vez aprobada en AMO, la URL de instalación administrada recomendada para OpenPath es:

```text
https://addons.mozilla.org/firefox/downloads/latest/monitor-bloqueos@openpath/latest.xpi
```

### Flujo Self-Distribution recomendado

Si quieres distribuir el complemento fuera de AMO pero seguir siendo compatible con Firefox
Release, el flujo recomendado es:

1. Firmar la extensión con Mozilla en canal `unlisted`.
2. Preparar `build/firefox-release/` con el XPI firmado y su `metadata.json`.
3. Dejar que el bootstrap de Windows copie esos artefactos al agente.

OpenPath ahora automatiza los pasos locales:

```bash
# Opción A: firmar con Mozilla y preparar el bundle final
WEB_EXT_API_KEY=...
WEB_EXT_API_SECRET=...
npm run sign:firefox-release

# Opción B: si ya descargaste un XPI firmado desde AMO
npm run build:firefox-release -- --signed-xpi /ruta/al/openpath-signed.xpi
```

Opcionalmente puedes fijar la URL gestionada que se escribirá en `metadata.json`:

```bash
npm run sign:firefox-release -- --install-url https://downloads.example/openpath-firefox-extension.xpi
```

Si no pasas `--install-url`, OpenPath usa por defecto la copia firmada local. En Windows, si
`apiUrl` está configurada, el agente preferirá la ruta gestionada
`https://<api>/api/extensions/firefox/openpath.xpi` para facilitar auto-updates; si no hay
`apiUrl`, seguirá usando el XPI stageado localmente mediante `file:///`.

## Uso

1. **Navega** a cualquier sitio web
2. **Observa** el badge rojo en el icono si hay dominios bloqueados
3. **Haz clic** en el icono para ver la lista de dominios
4. **Copia la lista** para usarla con `openpath-cmd.sh`:

```bash
# Después de copiar la lista desde la extensión
# Pega los dominios en un archivo o úsalos directamente:
cat << 'EOF' | while read domain; do
  sudo openpath check "$domain"
done
cdn.ejemplo.com
api.terceros.com
EOF
```

## Native Messaging (Opcional)

Native Messaging permite verificar dominios directamente contra el sistema whitelist local sin salir del navegador.

### Instalación

```bash
# Ejecutar el instalador
cd native
./install-native-host.sh
```

### Uso

Una vez instalado, aparecerá un botón **"🔍 Verificar"** en el popup. Al hacer clic, consulta el sistema local y muestra qué dominios están en la whitelist.

### Requisitos

- Sistema whitelist instalado (`/usr/local/bin/whitelist`)
- Python 3

## Errores Detectados

| Error                         | Causa Típica                |
| ----------------------------- | --------------------------- |
| `NS_ERROR_UNKNOWN_HOST`       | Bloqueo DNS (NXDOMAIN)      |
| `NS_ERROR_CONNECTION_REFUSED` | Bloqueo por Firewall        |
| `NS_ERROR_NET_TIMEOUT`        | Paquetes descartados (DROP) |

## Estructura

```
firefox-extension/
├── manifest.json      # Configuración Manifest V2
├── background.js      # Lógica de captura de errores
├── popup/
│   ├── popup.html     # Interfaz del popup
│   ├── popup.css      # Estilos (tema oscuro)
│   └── popup.js       # Lógica del popup
├── icons/
│   ├── icon-48.png    # Icono 48x48
│   └── icon-96.png    # Icono 96x96
├── native/            # Native Messaging
│   ├── openpath-native-host.py    # Host script
│   ├── whitelist_native_host.json  # Manifest
│   └── install-native-host.sh      # Instalador
├── build-xpi.sh       # Script de empaquetado
└── README.md          # Este archivo
```

## Permisos

- `webRequest`: Monitorear errores de red
- `webNavigation`: Detectar navegación para limpiar estado
- `tabs`: Obtener información de pestañas
- `clipboardWrite`: Copiar lista al portapapeles
- `nativeMessaging`: Comunicación con host nativo (opcional)
- `<all_urls>`: Monitorear todos los dominios

## Privacidad

- Todos los datos se mantienen en **memoria volátil** (per-tab)
- **No se envía** ningún dato a servidores externos
- Los datos se eliminan al cerrar la pestaña o navegar a otra página
- Native Messaging solo se comunica con scripts locales
