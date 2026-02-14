#!/bin/bash
################################################################################
# pre-install-validation.sh - Pre-installation validation tests
# 
# Validates that all required files, directories, and permissions are present
# BEFORE attempting installation. This catches packaging/release issues early.
#
# Usage: ./tests/e2e/pre-install-validation.sh
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ============== Helper Functions ==============

test_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    PASSED=$((PASSED + 1))
}

test_fail() {
    echo -e "  ${RED}✗${NC} $1"
    FAILED=$((FAILED + 1))
}

test_warn() {
    echo -e "  ${YELLOW}⚠${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

test_section() {
    echo ""
    echo -e "${BLUE}[$1]${NC} $2"
}

# ============== Validation Tests ==============

test_file_permissions() {
    test_section "1/6" "Script execution permissions"
    
    local scripts=(
        "linux/install.sh"
        "linux/uninstall.sh"
        "linux/scripts/runtime/openpath-update.sh"
        "linux/scripts/runtime/dnsmasq-watchdog.sh"
        "linux/scripts/runtime/captive-portal-detector.sh"
        "linux/scripts/runtime/openpath-cmd.sh"
    )
    
    for script in "${scripts[@]}"; do
        local script_path="$PROJECT_ROOT/$script"
        if [ -f "$script_path" ]; then
            if [ -x "$script_path" ]; then
                test_pass "$script has execute permission"
            else
                test_fail "$script missing execute permission (needs chmod +x)"
            fi
        else
            test_warn "$script not found (may be optional)"
        fi
    done
    
    # Check lib scripts
    if [ -d "$PROJECT_ROOT/linux/lib" ]; then
        local lib_count=0
        for lib_script in "$PROJECT_ROOT"/linux/lib/*.sh; do
            if [ -f "$lib_script" ]; then
                lib_count=$((lib_count + 1))
            fi
        done
        
        if [ $lib_count -eq 6 ]; then
            test_pass "Found 6 library scripts in linux/lib/"
        else
            test_fail "Expected 6 library scripts, found $lib_count"
        fi
    fi
}

test_required_directories() {
    test_section "2/6" "Required directory structure"
    
    local required_dirs=(
        "linux/lib"
        "linux/scripts"
        "linux/scripts/runtime"
        "linux/scripts/build"
        "linux/scripts/dev"
        "firefox-extension"
        "firefox-extension/icons"
        "firefox-extension/popup"
        "firefox-extension/native"
        "windows"
        "windows/lib"
        "windows/scripts"
        "tests"
        "tests/e2e"
    )
    
    for dir in "${required_dirs[@]}"; do
        local dir_path="$PROJECT_ROOT/$dir"
        if [ -d "$dir_path" ]; then
            test_pass "Directory $dir exists"
        else
            if [[ "$dir" == "windows"* ]]; then
                test_warn "Directory $dir missing (Windows-specific)"
            else
                test_fail "Directory $dir missing"
            fi
        fi
    done
}

test_required_files() {
    test_section "3/6" "Critical installation files"
    
    local required_files=(
        # Core installers
        "linux/install.sh"
        "linux/uninstall.sh"
        
        # Library modules
        "linux/lib/common.sh"
        "linux/lib/dns.sh"
        "linux/lib/firewall.sh"
        "linux/lib/browser.sh"
        "linux/lib/services.sh"
        "linux/lib/rollback.sh"
        
        # Runtime scripts
        "linux/scripts/runtime/openpath-update.sh"
        "linux/scripts/runtime/dnsmasq-watchdog.sh"
        "linux/scripts/runtime/captive-portal-detector.sh"
        "linux/scripts/runtime/openpath-cmd.sh"
        
        # Firefox extension
        "firefox-extension/manifest.json"
        "firefox-extension/dist/background.js"
        "firefox-extension/dist/config.js"
        "firefox-extension/dist/lib/logger.js"
        "firefox-extension/popup/popup.html"
        "firefox-extension/dist/popup.js"
        "firefox-extension/popup/popup.css"
        "firefox-extension/blocked/blocked.html"
        "firefox-extension/blocked/blocked.css"
        "firefox-extension/blocked/blocked.js"
        "firefox-extension/native/openpath-native-host.py"
        "firefox-extension/native/openpath_native_host.json"
        "firefox-extension/native/install-native-host.sh"
    )
    
    for file in "${required_files[@]}"; do
        local file_path="$PROJECT_ROOT/$file"
        if [ -f "$file_path" ]; then
            test_pass "File $file exists"
        else
            test_fail "File $file missing"
        fi
    done
}

test_firefox_extension_structure() {
    test_section "4/6" "Firefox extension structure"
    
    local ext_dir="$PROJECT_ROOT/firefox-extension"
    
    # Check manifest version (2 or 3 are valid)
    if [ -f "$ext_dir/manifest.json" ]; then
        if grep -qE '"manifest_version": [23]' "$ext_dir/manifest.json"; then
            test_pass "manifest.json has valid manifest_version"
        else
            test_fail "manifest.json missing or invalid manifest_version"
        fi
        
        # Check extension ID
        if grep -q '"id":.*"monitor-bloqueos@openpath"' "$ext_dir/manifest.json"; then
            test_pass "Extension ID correctly set"
        else
            test_fail "Extension ID missing or incorrect"
        fi
    fi
    
    # Check icon files
    if [ -d "$ext_dir/icons" ]; then
        local icon_count
        icon_count=$(find "$ext_dir/icons" -type f \( -name "*.png" -o -name "*.svg" \) 2>/dev/null | wc -l)
        if [ "$icon_count" -gt 0 ]; then
            test_pass "Found $icon_count icon file(s)"
        else
            test_warn "No icon files found in firefox-extension/icons/"
        fi
    fi
    
    # Check native messaging host is executable
    if [ -f "$ext_dir/native/openpath-native-host.py" ]; then
        if head -1 "$ext_dir/native/openpath-native-host.py" | grep -q "^#!/usr/bin"; then
            test_pass "Native host has shebang"
        else
            test_warn "Native host missing shebang line"
        fi
    fi
}

test_release_tarball_simulation() {
    test_section "5/6" "Release tarball contents simulation"
    
    # Simulate what would be in the Linux release tarball
    local tarball_contents=(
        "linux/install.sh"
        "linux/uninstall.sh"
        "linux/lib/"
        "linux/scripts/"
        "firefox-extension/"
    )
    
    echo -e "  ${BLUE}Checking if tarball would contain all required files...${NC}"
    
    local all_present=true
    for item in "${tarball_contents[@]}"; do
        local item_path="$PROJECT_ROOT/$item"
        if [ -e "$item_path" ]; then
            if [ -d "$item_path" ]; then
                local file_count
                file_count=$(find "$item_path" -type f 2>/dev/null | wc -l)
                test_pass "Directory $item ($file_count files)"
            else
                test_pass "File $item"
            fi
        else
            test_fail "Missing in tarball: $item"
            all_present=false
        fi
    done
    
    if [ "$all_present" = true ]; then
        test_pass "All required tarball contents present"
    else
        test_fail "Tarball would be incomplete"
    fi
    
    # Check that install.sh step 12 requirements are met
    if [ -d "$PROJECT_ROOT/firefox-extension" ]; then
        test_pass "firefox-extension/ available for install.sh step 12"
    else
        test_fail "firefox-extension/ missing - install.sh step 12 will fail"
    fi
}

test_installer_extension_paths() {
    test_section "6/6" "Firefox installer path consistency"

    local browser_sh="$PROJECT_ROOT/linux/lib/browser.sh"

    if grep -Fq 'cp "$ext_source/dist/background.js" "$ext_dir/$ext_id/dist/"' "$browser_sh"; then
        test_pass "installer copies dist/background.js"
    else
        test_fail "installer does not copy dist/background.js"
    fi

    if grep -Fq 'cp "$ext_source/dist/popup.js" "$ext_dir/$ext_id/dist/"' "$browser_sh"; then
        test_pass "installer copies dist/popup.js"
    else
        test_fail "installer does not copy dist/popup.js"
    fi

    if grep -Fq 'cp "$ext_source/dist/config.js" "$ext_dir/$ext_id/dist/"' "$browser_sh"; then
        test_pass "installer copies dist/config.js"
    else
        test_fail "installer does not copy dist/config.js"
    fi

    if grep -Fq 'cp -r "$ext_source/dist/lib" "$ext_dir/$ext_id/dist/"' "$browser_sh"; then
        test_pass "installer copies dist/lib"
    else
        test_fail "installer does not copy dist/lib"
    fi

    if grep -Fq 'cp -r "$ext_source/blocked" "$ext_dir/$ext_id/"' "$browser_sh"; then
        test_pass "installer copies blocked screen assets"
    else
        test_fail "installer does not copy blocked screen assets"
    fi

    if grep -q 'cp "\$ext_source/background.js"' "$browser_sh"; then
        test_fail "installer still references legacy root background.js"
    else
        test_pass "installer no longer references legacy root background.js"
    fi
}

# ============== Main ==============

main() {
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  Pre-Installation Validation Tests${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    echo "Project root: $PROJECT_ROOT"
    
    test_file_permissions
    test_required_directories
    test_required_files
    test_firefox_extension_structure
    test_release_tarball_simulation
    test_installer_extension_paths
    
    # Summary
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo -e "  Results: ${GREEN}$PASSED passed${NC}, ${YELLOW}$WARNINGS warnings${NC}, ${RED}$FAILED failed${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
    echo ""
    
    if [ "$FAILED" -gt 0 ]; then
        echo -e "${RED}✗ PRE-INSTALLATION VALIDATION FAILED${NC}"
        echo ""
        echo "These issues must be fixed before packaging/release:"
        echo "- Fix file permissions: chmod +x <file>"
        echo "- Add missing files/directories"
        echo "- Update release workflow to include all required files"
        exit 1
    elif [ "$WARNINGS" -gt 0 ]; then
        echo -e "${YELLOW}⚠ VALIDATION PASSED WITH WARNINGS${NC}"
        echo ""
        echo "Consider addressing warnings before release"
        exit 0
    else
        echo -e "${GREEN}✓ PRE-INSTALLATION VALIDATION PASSED${NC}"
        echo ""
        echo "All required files and permissions are present"
        exit 0
    fi
}

main "$@"
