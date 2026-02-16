#!/bin/bash
################################################################################
# run-tests.sh - Ejecuta tests bats
#
# Uso:
#   ./tests/run-tests.sh           # Ejecutar todos los tests
#   ./tests/run-tests.sh common    # Ejecutar solo common.bats
################################################################################

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Verificar bats instalado
if ! command -v bats &>/dev/null; then
    echo -e "${RED}ERROR: bats no está instalado${NC}"
    echo ""
    echo "Instalar con:"
    echo "  Ubuntu/Debian: sudo apt install bats"
    echo "  macOS:         brew install bats-core"
    echo "  npm:           npm install -g bats"
    echo ""
    echo "O clonar el repositorio:"
    echo "  git clone https://github.com/bats-core/bats-core.git"
    echo "  cd bats-core && sudo ./install.sh /usr/local"
    exit 1
fi

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Bats Tests - OpenPath System${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo ""

cd "$SCRIPT_DIR"

if [ -n "$1" ]; then
    # Ejecutar test específico
    if [ -f "$1.bats" ]; then
        bats "$1.bats"
    elif [ -f "$1" ]; then
        bats "$1"
    else
        echo -e "${RED}Test no encontrado: $1${NC}"
        exit 1
    fi
else
    # Ejecutar todos los tests
    bats *.bats
fi

echo ""
echo -e "${GREEN}✓ Tests completados${NC}"
