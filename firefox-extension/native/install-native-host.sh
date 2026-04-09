#!/bin/bash

# OpenPath - Strict Internet Access Control
# Copyright (C) 2025 OpenPath Authors
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

################################################################################
# install-native-host.sh - Instala el host de Native Messaging
# Parte del sistema Monitor de Bloqueos de Red
################################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}Instalando Native Messaging Host...${NC}"
echo ""

# Verificar que existe el script
if [ ! -f "$SCRIPT_DIR/openpath-native-host.py" ]; then
    echo -e "${RED}Error: openpath-native-host.py no encontrado${NC}"
    exit 1
fi

# Instalar el script del host
echo "  → Instalando script en /usr/local/bin/..."
sudo cp "$SCRIPT_DIR/openpath-native-host.py" /usr/local/bin/
sudo chmod +x /usr/local/bin/openpath-native-host.py

# Crear directorio para manifests de usuario (sin sudo)
NATIVE_HOST_DIR="$HOME/.mozilla/native-messaging-hosts"
echo "  → Creando directorio $NATIVE_HOST_DIR..."
mkdir -p "$NATIVE_HOST_DIR"

# Instalar el manifest
echo "  → Instalando manifest de Native Messaging..."
cp "$SCRIPT_DIR/whitelist_native_host.json" "$NATIVE_HOST_DIR/whitelist_native_host.json"

# Crear archivo de log
echo "  → Configurando archivo de log..."
sudo touch /var/log/openpath-native-host.log
sudo chmod 666 /var/log/openpath-native-host.log

echo ""
echo -e "${GREEN}✓ Native Messaging Host instalado correctamente${NC}"
echo ""
echo "Para usar esta funcionalidad:"
echo "  1. Recarga la extensión en about:debugging"
echo "  2. El botón 'Verificar en Lista' estará disponible en el popup"
echo ""
