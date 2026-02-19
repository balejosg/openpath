# ADR: Sistema OpenPath DNS

**Fecha**: 2025-12-21  
**Estado**: Implementado  
**Versión del Sistema**: 4.1.0

---

## Resumen Ejecutivo

Sistema integral de control de acceso a internet diseñado para entornos educativos. Utiliza un enfoque de "denegación por defecto" donde todo el tráfico DNS se bloquea excepto los dominios explícitamente permitidos (whitelist).

```mermaid
graph TB
    subgraph "Capa de Administración"
        WEB["🌐 Web App<br/>(dashboard)"]
        EXT["🦊 Firefox Extension"]
    end

    subgraph "Capa de Control"
        DNSMASQ["📡 dnsmasq<br/>DNS Sinkhole"]
        IPTABLES["🔥 iptables<br/>Firewall"]
        BROWSER["🌍 Browser<br/>Policies"]
    end

    subgraph "Capa de Automatización"
        WHITELIST["📋 openpath-update.sh<br/>Actualización cada 5 min"]
        WATCHDOG["🔍 dnsmasq-watchdog.sh<br/>Health check cada 1 min"]
        CAPTIVE["📶 captive-portal-detector.sh"]
    end

    subgraph "Capa de Datos"
        REMOTE["☁️ GitHub/URL Remoto<br/>whitelist.txt"]
        LOCAL["/etc/openpath/<br/>Estado local"]
    end

    WEB --> REMOTE
    EXT --> WHITELIST
    WHITELIST --> REMOTE
    WHITELIST --> DNSMASQ
    WHITELIST --> BROWSER
    WATCHDOG --> DNSMASQ
    CAPTIVE --> IPTABLES
    DNSMASQ --> LOCAL
```

---

## Contexto y Problema

### Problema

En entornos educativos (aulas de informática), es necesario restringir el acceso a internet para evitar distracciones y contenido inapropiado, permitiendo solo recursos educativos específicos.

### Restricciones

- Los estudiantes tienen acceso físico a las máquinas
- Deben poder usar navegadores web para recursos educativos
- La administración debe ser centralizada y remota
- El sistema debe auto-recuperarse de fallos

---

## Decisiones Arquitectónicas

### ADR-001: DNS Sinkhole como Mecanismo Principal

**Decisión**: Usar `dnsmasq` como DNS sinkhole que bloquea todos los dominios por defecto (`address=/#/`) y solo permite dominios whitelisteados (`server=/domain.com/upstream`).

**Alternativas Consideradas**:
| Alternativa | Pros | Contras |
|-------------|------|---------|
| Proxy HTTP (Squid) | Control granular URLs | Computacionalmente costoso, bypass por HTTPS |
| Pi-hole | Solución completa | Orientado a blocklist, no whitelist |
| Firewall puro | Simple | No inspecciona DNS, bypass por IP |
| DNS Sinkhole ✓ | Ligero, efectivo, difícil bypass | Requiere capas adicionales |

**Consecuencias**:

- ✅ Bajo consumo de recursos
- ✅ Cobertura total del sistema
- ⚠️ Requiere capas adicionales (firewall, browser policies)

---

### ADR-002: Arquitectura de Protección Multi-Capa

**Decisión**: Implementar tres capas de protección independientes.

```mermaid
flowchart LR
    subgraph "Capa 1: DNS"
        A[Petición DNS] --> B{¿En Whitelist?}
        B -->|Sí| C[Resolver Normal]
        B -->|No| D["NXDOMAIN (Bloqueado)"]
    end

    subgraph "Capa 2: Firewall"
        E[Tráfico Saliente] --> F{¿Puerto Permitido?}
        F -->|HTTP/HTTPS| G[Permitir]
        F -->|DNS/VPN/Tor| H[Bloquear]
    end

    subgraph "Capa 3: Browser"
        I[Navegador] --> J{¿Ruta Bloqueada?}
        J -->|No| K[Cargar Página]
        J -->|Sí| L[Bloquear en UI]
    end
```

#### Capa 1: DNS (`lib/dns.sh`)

- Bloquea resolución de dominios no permitidos
- Vulnerabilidad: Bypass por IP directa

#### Capa 2: Firewall (`lib/firewall.sh`)

- Bloquea puertos: 53 (DNS externo), 853 (DoT), VPN, Tor
- Permite: HTTP/HTTPS, ICMP, NTP, DHCP, LAN
- Vulnerabilidad: IPs hardcodeadas

#### Capa 3: Browser (`lib/browser.sh`)

- Firefox: `policies.json` con `WebsiteFilter`
- Chromium: `URLBlocklist` en managed policies
- Bloquea rutas específicas (`/ads/`, `/tracking/`)

---

### ADR-003: Fail-Open vs Fail-Closed

**Decisión**: El sistema **fail-open** (modo permisivo en fallos).

**Justificación**: En un entorno educativo, es peor perder conectividad (clases no pueden continuar) que permitir acceso temporal.

**Implementación**:
| Escenario | Comportamiento |
|-----------|----------------|
| Fallo descarga whitelist | Usar última whitelist local |
| dnsmasq falla 3 veces | Desactivar firewall |
| Portal cautivo detectado | Desactivar firewall temporalmente |
| Marcador `#DESACTIVADO` | Modo completamente permisivo |

---

### ADR-004: Arquitectura Modular con Bibliotecas Shell

**Decisión**: Separar funcionalidad en módulos reutilizables en `lib/`.

```
lib/
├── common.sh    # Variables globales, logging, parsing
├── dns.sh       # Configuración dnsmasq
├── firewall.sh  # Reglas iptables
├── browser.sh   # Políticas navegadores
└── services.sh  # Gestión systemd
```

**Beneficios**:

- Código testeable por módulo
- Reutilización entre scripts
- Mantenimiento simplificado

---

### ADR-005: Gestión Centralizada vía URL Remota

**Decisión**: La whitelist se descarga desde una URL configurable (por defecto GitHub).

```mermaid
sequenceDiagram
    participant Timer as systemd timer<br/>(cada 5 min)
    participant Script as openpath-update.sh
    participant GitHub as GitHub Raw
    participant dnsmasq as dnsmasq
    participant Browser as Navegadores

    Timer->>Script: Ejecutar
    Script->>GitHub: GET whitelist.txt
    GitHub-->>Script: Contenido
    Script->>Script: Parsear secciones
    Script->>dnsmasq: Regenerar config
    Script->>dnsmasq: systemctl reload
    Script->>Browser: Actualizar policies
    Note over Script,Browser: Solo cierra browsers si hay cambios
```

**Formato de Whitelist**:

```
## WHITELIST
google.com
github.com

## BLOCKED-SUBDOMAINS
ads.google.com

## BLOCKED-PATHS
*/tracking/*
```

---

### ADR-006: Extensión Firefox para Diagnóstico

**Decisión**: Desarrollar extensión nativa para identificar dominios bloqueados.

**Problema Resuelto**: Los usuarios no saben qué dominios faltan en la whitelist cuando una página no carga correctamente.

**Arquitectura**:

```
firefox-extension/
├── manifest.json       # Manifest V2
├── background.js       # Escucha webRequest.onErrorOccurred
├── popup/              # UI para listar dominios bloqueados
└── native/             # Native Messaging → openpath-cmd.sh
```

**Flujo**:

1. Usuario navega a `ejemplo.com`
2. Página carga recursos de `cdn.tercero.com` (no whitelisteado)
3. dnsmasq devuelve NXDOMAIN
4. Firefox dispara `NS_ERROR_UNKNOWN_HOST`
5. Extensión captura y muestra en badge "1"
6. Usuario abre popup y ve dominios faltantes

---

### ADR-007: Aplicación Web para Administración

**Decisión**: Reemplazar edición manual de archivos en GitHub por interfaz web.

**Stack Tecnológico**:
| Componente | Tecnología |
|------------|------------|
| Backend | Node.js + Express |
| Frontend | React + TypeScript + Tailwind CSS |
| Almacenamiento | JSON file-based |
| Autenticación | JWT con bcrypt |
| Despliegue | Docker |

**Arquitectura**:

```
dashboard/
├── server/
│   ├── index.js    # API REST: /api/groups, /api/rules, /api/auth
│   └── db.js       # Operaciones CRUD sobre JSON
├── public/
│   ├── index.html  # Dashboard
│   ├── css/        # Estilos
│   └── js/         # Lógica cliente
├── data/           # Almacenamiento JSON
├── Dockerfile
└── docker-compose.yml
```

**Endpoints API**:

- `POST /api/auth/login` - Autenticación
- `GET /api/groups` - Listar grupos de reglas
- `GET /api/rules/:group` - Reglas por grupo
- `POST /api/rules` - Crear regla
- `DELETE /api/rules/:id` - Eliminar regla
- `GET /api/export/:group` - Exportar formato compatible

---

### ADR-008: API de Solicitudes de Dominios

**Decisión**: Implementar API REST en servidor local para que los usuarios puedan solicitar nuevos dominios directamente desde la extensión de Firefox.

**Stack Tecnológico**:
| Componente | Tecnología |
|------------|------------|
| Backend | Node.js + Express |
| Base de datos | SQLite |
| Autenticación | API key compartida |
| Despliegue | Servidor local (home server) |

**Arquitectura**:

```
api/
├── routes/
│   └── requests.js     # Endpoints de solicitudes
├── middleware/
│   └── auth.js         # Validación API key
├── db/
│   └── database.sqlite # Base de datos SQLite
├── server.js           # Punto de entrada
└── Dockerfile          # Containerización
```

**Endpoints API**:

- `POST /api/request` - Solicitar nuevo dominio
- `GET /api/requests` - Listar solicitudes pendientes
- `POST /api/approve/:id` - Aprobar solicitud
- `POST /api/reject/:id` - Rechazar solicitud
- `GET /health` - Health check

**Integración con Firefox Extension**:
La extensión detecta dominios bloqueados y permite al usuario solicitar su inclusión en la whitelist. Las solicitudes se envían a esta API para revisión por el administrador.

---

## Componentes del Sistema

### Resumen de Componentes

| Componente                   | Ubicación                      | Propósito                        |
| ---------------------------- | ------------------------------ | -------------------------------- |
| `install.sh`                 | Raíz                           | Instalación completa del sistema |
| `uninstall.sh`               | Raíz                           | Desinstalación limpia            |
| `lib/*.sh`                   | `/usr/local/lib/openpath/lib/` | Módulos de funcionalidad         |
| `openpath-update.sh`         | `/usr/local/bin/`              | Actualización periódica          |
| `dnsmasq-watchdog.sh`        | `/usr/local/bin/`              | Monitoreo de salud               |
| `captive-portal-detector.sh` | `/usr/local/bin/`              | Detección WiFi portales          |
| `openpath-cmd.sh`            | `/usr/local/bin/openpath`      | CLI para usuarios                |
| Firefox Extension            | `firefox-extension/`           | Diagnóstico de bloqueos          |
| Web App                      | `dashboard/`                   | Administración centralizada      |
| Request API                  | `api/`                         | API para solicitudes de dominios |
| React SPA                    | `react-spa/`                   | UI web (Vite + React)            |

### Servicios systemd

```mermaid
graph LR
    subgraph "Boot"
        TIMER1["openpath-dnsmasq.timer<br/>OnBootSec=2min"]
        TIMER2["dnsmasq-watchdog.timer<br/>OnCalendar=*-*-* *:*:00"]
        CAPTIVE["captive-portal-detector.service"]
    end

    subgraph "Ejecución"
        S1["openpath-dnsmasq.service"]
        S2["dnsmasq-watchdog.service"]
        DNSMASQ["dnsmasq.service"]
    end

    TIMER1 --> S1
    TIMER2 --> S2
    S1 --> DNSMASQ
    S2 --> DNSMASQ
```

---

## Flujos de Datos

### Flujo de Instalación

```mermaid
flowchart TD
    A[install.sh] --> B[Instalar dependencias]
    B --> C[Copiar lib/ a /usr/local/lib/]
    C --> D[Copiar scripts/ a /usr/local/bin/]
    D --> E[Detectar DNS upstream]
    E --> F[Descargar whitelist inicial]
    F --> G[Generar dnsmasq.conf]
    G --> H[Configurar iptables]
    H --> I[Generar browser policies]
    I --> J[Crear servicios systemd]
    J --> K[Habilitar timers]
    K --> L[Sistema activo]
```

### Flujo de Actualización (cada 5 min)

```mermaid
flowchart TD
    A["openpath-update.sh<br/>(timer 5 min)"] --> B{Obtener lock?}
    B -->|No| Z[Salir]
    B -->|Sí| C[Descargar whitelist]
    C --> D{¿#DESACTIVADO?}
    D -->|Sí| E[Modo fail-open]
    D -->|No| F[Parsear secciones]
    F --> G{¿Config cambió?}
    G -->|No| H[Mantener actual]
    G -->|Sí| I[Regenerar dnsmasq.conf]
    I --> J[Reload dnsmasq]
    J --> K{¿Policies cambiaron?}
    K -->|No| L[Fin]
    K -->|Sí| M[Cerrar browsers]
    M --> N[Aplicar policies]
```

### Flujo de Health Check (cada 1 min)

```mermaid
flowchart TD
    A["dnsmasq-watchdog.sh<br/>(timer 1 min)"] --> B{¿dnsmasq activo?}
    B -->|No| C[Intentar restart]
    B -->|Sí| D{¿DNS upstream OK?}
    C --> E{¿3 fallos seguidos?}
    E -->|Sí| F[Modo fail-open]
    E -->|No| G[Incrementar contador]
    D -->|No| H[Reconfigurar upstream]
    D -->|Sí| I{¿resolv.conf correcto?}
    I -->|No| J[Corregir resolv.conf]
    I -->|Sí| K[Sistema OK]
```

---

## Seguridad

### Vectores de Ataque Mitigados

| Vector               | Mitigación                                  |
| -------------------- | ------------------------------------------- |
| DNS alternativo      | iptables bloquea puerto 53/853 externo      |
| DoH (DNS over HTTPS) | Bloqueo de dominios DoH conocidos           |
| VPN                  | iptables bloquea puertos OpenVPN, WireGuard |
| Tor                  | iptables bloquea puertos Tor                |
| Edición local        | Archivos requieren root                     |

### Vulnerabilidades Conocidas

| Vulnerabilidad           | Riesgo | Estado             |
| ------------------------ | ------ | ------------------ |
| IPs hardcodeadas         | Medio  | No mitigado        |
| Dispositivos USB con Tor | Medio  | Fuera de alcance   |
| Live USB bypass          | Alto   | Requiere BIOS lock |

---

## Directorios del Sistema

```
/usr/local/lib/openpath/              # Código fuente
├── lib/                              # Módulos shell
└── scripts/                          # Scripts auxiliares

/usr/local/bin/                       # Ejecutables
├── openpath                          # CLI principal
├── openpath-update.sh
├── dnsmasq-watchdog.sh
└── captive-portal-detector.sh

/etc/openpath/                        # Configuración
├── whitelist-url.conf                # URL de whitelist
├── original-dns.conf                 # DNS upstream detectado
└── health-api-*.conf                 # Config health API

/var/lib/openpath/                    # Estado persistente
├── whitelist.txt                     # Whitelist descargada
├── dnsmasq.hash                      # Hash config para cambios
└── browser-policies.hash             # Hash policies

/etc/dnsmasq.d/
└── openpath.conf                     # Config dnsmasq generada

/etc/firefox/policies/
└── policies.json                     # Políticas Firefox

/etc/chromium/policies/managed/
└── openpath.json                     # Políticas Chromium

/var/log/
└── openpath.log                      # Log principal
```

---

## Requisitos del Sistema

| Requisito    | Detalle                                                                                        |
| ------------ | ---------------------------------------------------------------------------------------------- |
| OS           | Ubuntu 20.04+ / Debian 10+                                                                     |
| Arquitectura | x86_64 (amd64)                                                                                 |
| Init System  | systemd                                                                                        |
| Acceso       | root/sudo                                                                                      |
| Dependencias | dnsmasq, iptables, iptables-persistent, ipset, curl, libcap2-bin, dnsutils, conntrack, python3 |
| Puerto       | 53 disponible (systemd-resolved deshabilitado)                                                 |

---

## Conclusión

El sistema de Whitelist DNS implementa una solución robusta de control de acceso utilizando:

1. **DNS Sinkhole** como mecanismo principal de bloqueo
2. **Protección multi-capa** (DNS + Firewall + Browser)
3. **Filosofía fail-open** para maximizar disponibilidad
4. **Administración centralizada** vía URL remota
5. **Auto-recuperación** mediante watchdog
6. **Herramientas de diagnóstico** (extensión Firefox)
7. **Interfaz de administración** (aplicación web)

Esta arquitectura proporciona un balance entre seguridad y usabilidad apropiado para entornos educativos.
