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

### Publicar en Firefox Add-ons (AMO)

Para publicar la extensión en [addons.mozilla.org](https://addons.mozilla.org):

1. Crea una cuenta de desarrollador en AMO
2. Genera el XPI: `./build-xpi.sh`
3. Valida el XPI en https://addons.mozilla.org/developers/addon/validate
4. Sube la extensión en https://addons.mozilla.org/developers/addon/submit/
5. Usa las descripciones incluidas en [AMO.md](./AMO.md)
6. Enlaza la política de privacidad: [PRIVACY.md](./PRIVACY.md)

> **Tiempo de revisión**: Las extensiones nuevas suelen tardar 1-7 días en ser aprobadas.

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
│   ├── openpath_native_host.json  # Manifest
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
