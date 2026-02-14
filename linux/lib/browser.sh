#!/bin/bash
set -o pipefail

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
# browser.sh - Browser policy management functions
# Part of the OpenPath DNS system v3.5
################################################################################

# Calculate hash of current policies
# Uses sha256sum for consistency with openpath-update.sh
get_policies_hash() {
    local hash=""
    if [ -f "$FIREFOX_POLICIES" ]; then
        hash="${hash}$(sha256sum "$FIREFOX_POLICIES" 2>/dev/null | cut -d' ' -f1)"
    fi
    # Add hash of blocked_paths to detect WebsiteFilter changes
    hash="${hash}$(echo "${BLOCKED_PATHS[*]}" | sha256sum | cut -d' ' -f1)"
    echo "$hash"
}

# Generate Firefox policies
generate_firefox_policies() {
    log "Generating Firefox policies..."
    
    local policies_file="$FIREFOX_POLICIES"
    mkdir -p "$(dirname "$policies_file")"
    
    # Use Python for merge (preserves SearchEngines)
    python3 << PYEOF
import json
import os

policies_file = "$policies_file"
blocked_paths_str = """${BLOCKED_PATHS[*]}"""
blocked_paths = blocked_paths_str.split() if blocked_paths_str.strip() else []

def normalize_path(path):
    clean = path
    for prefix in ['http://', 'https://', '*://']:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    
    if '/' not in clean and '.' not in clean and '*' not in clean:
        clean = f"*{clean}*"
    else:
        if not clean.endswith('*'):
            clean = f"{clean}*"
    
    if clean.startswith('*.'):
        return f"*://{clean}"
    elif clean.startswith('*/'):
        return f"*://*{clean[1:]}"
    elif '.' in clean and '/' in clean:
        return f"*://*.{clean}"
    else:
        return f"*://{clean}"

# Read existing policies or create new
if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
    except Exception as e:
        print(f"Warning: Failed to read existing policies: {e}", file=sys.stderr)
        policies = {"policies": {}}
else:
    policies = {"policies": {}}

if "policies" not in policies:
    policies["policies"] = {}

# Actualizar WebsiteFilter
normalized_paths = [normalize_path(p) for p in blocked_paths if p.strip()]
policies["policies"]["WebsiteFilter"] = {"Block": normalized_paths}

with open(policies_file, 'w') as f:
    json.dump(policies, f, indent=2)

print(f"Firefox: {len(normalized_paths)} paths bloqueados")
PYEOF
    
    log "✓ Firefox policies generated"
}

# Generate Chromium/Chrome policies
generate_chromium_policies() {
    log "Generating Chromium policies..."
    
    local dirs=(
        "$CHROMIUM_POLICIES_BASE"
        "/etc/chromium-browser/policies/managed"
        "/etc/opt/chrome/policies/managed"
    )
    
    for dir in "${dirs[@]}"; do
        mkdir -p "$dir"
        
        if [ ${#BLOCKED_PATHS[@]} -gt 0 ]; then
            # Generate JSON with URLBlocklist
            python3 << PYEOF
import json

blocked_paths_str = """${BLOCKED_PATHS[*]}"""
blocked_paths = blocked_paths_str.split() if blocked_paths_str.strip() else []

def normalize_path(path):
    clean = path
    for prefix in ['http://', 'https://', '*://']:
        if clean.startswith(prefix):
            clean = clean[len(prefix):]
            break
    if not clean.endswith('*'):
        clean = f"{clean}*"
    return clean

normalized = [normalize_path(p) for p in blocked_paths if p.strip()]

policy = {"URLBlocklist": normalized}

with open("$dir/openpath.json", 'w') as f:
    json.dump(policy, f, indent=2)
PYEOF
        else
            echo '{"URLBlocklist": []}' > "$dir/openpath.json"
        fi
    done
    
    log "✓ Chromium policies generated"
}

# Apply search engine policies (remove Google)
apply_search_engine_policies() {
    log "Applying search engine policies..."
    
    local policies_file="$FIREFOX_POLICIES"
    
    # CRITICAL: Create directory if it doesn't exist
    mkdir -p "$(dirname "$policies_file")"
    
    python3 << 'PYEOF'
import json
import os

policies_file = os.environ.get('FIREFOX_POLICIES', '/etc/firefox/policies/policies.json')

# Create directory if it doesn't exist
os.makedirs(os.path.dirname(policies_file), exist_ok=True)

# Read or create policies
if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
    except Exception as e:
        print(f"Warning: Failed to read existing policies: {e}", file=sys.stderr)
        policies = {"policies": {}}
else:
    policies = {"policies": {}}

if "policies" not in policies:
    policies["policies"] = {}

# Add SearchEngines
policies["policies"]["SearchEngines"] = {
    "Remove": ["Google", "Bing"],
    "Default": "DuckDuckGo",
    "Add": [
        {
            "Name": "DuckDuckGo",
            "Description": "Motor de búsqueda centrado en privacidad",
            "Alias": "ddg",
            "Method": "GET",
            "URLTemplate": "https://duckduckgo.com/?q={searchTerms}",
            "IconURL": "https://duckduckgo.com/favicon.ico",
            "SuggestURLTemplate": "https://ac.duckduckgo.com/ac/?q={searchTerms}&type=list"
        },
        {
            "Name": "Wikipedia (ES)",
            "Description": "Enciclopedia libre",
            "Alias": "wiki",
            "Method": "GET",
            "URLTemplate": "https://es.wikipedia.org/wiki/Special:Search?search={searchTerms}",
            "IconURL": "https://es.wikipedia.org/static/favicon/wikipedia.ico"
        }
    ]
}

# Add Google search blocks to WebsiteFilter
if "WebsiteFilter" not in policies["policies"]:
    policies["policies"]["WebsiteFilter"] = {"Block": []}

google_blocks = [
    "*://www.google.com/search*",
    "*://www.google.es/search*",
    "*://google.com/search*",
    "*://google.es/search*"
]

for block in google_blocks:
    if block not in policies["policies"]["WebsiteFilter"]["Block"]:
        policies["policies"]["WebsiteFilter"]["Block"].append(block)

with open(policies_file, 'w') as f:
    json.dump(policies, f, indent=2)

print("SearchEngines y bloqueos de Google aplicados")
PYEOF
    
    log "✓ Search engines configured"
}

# Clean up browser policies
cleanup_browser_policies() {
    log "Cleaning up browser policies..."
    
    # Firefox - Clean policies.json
    if [ -f "$FIREFOX_POLICIES" ]; then
        echo '{"policies": {}}' > "$FIREFOX_POLICIES"
        log "✓ Firefox policies cleaned"
    fi
    
    # Chromium/Chrome
    local dirs=(
        "$CHROMIUM_POLICIES_BASE"
        "/etc/chromium-browser/policies/managed"
        "/etc/opt/chrome/policies/managed"
    )
    
    for dir in "${dirs[@]}"; do
        rm -f "$dir/openpath.json" 2>/dev/null || true
        rm -f "$dir/url-whitelist.json" 2>/dev/null || true
        rm -f "$dir/search-engines.json" 2>/dev/null || true
    done
    
    log "✓ Browser policies cleaned"
}

# Close browsers to apply policies
force_browser_close() {
    log "Closing browsers..."
    
    local closed=0
    
    # Method 1: pkill by process name (works for native and Snap)
    # -f searches the entire command line
    for pattern in "firefox" "chromium" "chrome"; do
        if pgrep -f "$pattern" >/dev/null 2>&1; then
            log "Detectado proceso: $pattern - enviando SIGTERM..."
            pkill -TERM -f "$pattern" 2>/dev/null || true
            closed=$((closed + 1))
        fi
    done
    
    # Wait for graceful shutdown (max 5 seconds)
    if [ $closed -gt 0 ]; then
        log "Waiting for $closed browser(s) to close..."
        local wait_retries=5
        while [ $wait_retries -gt 0 ]; do
            local still_running=0
            for pattern in "firefox" "chromium" "chrome"; do
                if pgrep -f "$pattern" >/dev/null 2>&1; then
                    still_running=1
                    break
                fi
            done
            [ $still_running -eq 0 ] && break
            sleep 1
            wait_retries=$((wait_retries - 1))
        done
        
        # SIGKILL for those that didn't respond
        for pattern in "firefox" "chromium" "chrome"; do
            if pgrep -f "$pattern" >/dev/null 2>&1; then
                log "Forcing close (SIGKILL): $pattern"
                pkill -9 -f "$pattern" 2>/dev/null || true
            fi
        done
        
        log "✓ Browsers closed"
    else
        log "No open browsers detected"
    fi
}
# ============================================================================
# FIREFOX ESR INSTALLATION
# ============================================================================

# Install Firefox ESR, removing Snap Firefox if present
install_firefox_esr() {
    log "Verificando instalación de Firefox..."
    
    # Check if Snap Firefox is installed
    if snap list firefox &>/dev/null 2>&1; then
        log "⚠ Firefox Snap detected - removing..."
        
        # Close any running Firefox first
        pkill -TERM -f firefox 2>/dev/null || true
        # Wait for close
        for _ in $(seq 1 5); do
            pgrep -f firefox >/dev/null 2>&1 || break
            sleep 1
        done
        pkill -9 -f firefox 2>/dev/null || true
        
        # Remove Snap Firefox
        snap remove --purge firefox 2>/dev/null || snap remove firefox 2>/dev/null || true
        
        log "✓ Firefox Snap removed"
    fi
    
    # Check if Firefox ESR is already installed via APT
    if dpkg -l firefox-esr &>/dev/null 2>&1; then
        log "✓ Firefox ESR already installed"
        return 0
    fi
    
    # Check if regular Firefox (non-snap) is installed
    if dpkg -l firefox &>/dev/null 2>&1 && ! snap list firefox &>/dev/null 2>&1; then
        log "✓ Firefox (APT) already installed"
        return 0
    fi
    
    log "Installing Firefox ESR..."
    
    # Add Mozilla team PPA for Ubuntu (provides firefox-esr)
    if command -v add-apt-repository &>/dev/null; then
        # For Ubuntu: use Mozilla PPA
        add-apt-repository -y ppa:mozillateam/ppa 2>/dev/null || true
        
        # Set Firefox ESR as priority over Snap
        cat > /etc/apt/preferences.d/mozilla-firefox << 'EOF'
Package: *
Pin: release o=LP-PPA-mozillateam
Pin-Priority: 1001

Package: firefox
Pin: version 1:1snap*
Pin-Priority: -1
EOF
    fi
    
    apt-get update -qq
    
    # Try firefox-esr first (Debian), then firefox (Ubuntu with PPA)
    if apt-cache show firefox-esr &>/dev/null 2>&1; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y firefox-esr
        log "✓ Firefox ESR installed"
    else
        DEBIAN_FRONTEND=noninteractive apt-get install -y firefox
        log "✓ Firefox installed from PPA"
    fi
}

# Detect Firefox installation directory
detect_firefox_dir() {
    local dirs=(
        "/usr/lib/firefox-esr"
        "/usr/lib/firefox"
        "/opt/firefox"
    )
    
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ] && { [ -f "$dir/firefox" ] || [ -f "$dir/firefox-bin" ]; }; then
            echo "$dir"
            return 0
        fi
    done
    
    # Fallback: find firefox binary and get its directory
    local firefox_bin
    firefox_bin=$(which firefox-esr 2>/dev/null || which firefox 2>/dev/null)
    if [ -n "$firefox_bin" ]; then
        local real_path
        real_path=$(readlink -f "$firefox_bin")
        dirname "$real_path"
        return 0
    fi
    
    return 1
}

# Generate Firefox autoconfig to disable signature requirements
generate_firefox_autoconfig() {
    local firefox_dir
    firefox_dir=$(detect_firefox_dir)
    
    if [ -z "$firefox_dir" ]; then
        log "⚠ Firefox not detected, skipping autoconfig"
        return 1
    fi
    
    log "Generating autoconfig in $firefox_dir..."
    
    # Create autoconfig.js in defaults/pref
    mkdir -p "$firefox_dir/defaults/pref"
    cat > "$firefox_dir/defaults/pref/autoconfig.js" << 'EOF'
// Autoconfig para OpenPath System
pref("general.config.filename", "mozilla.cfg");
pref("general.config.obscure_value", 0);
EOF
    
    # Create mozilla.cfg (must start with comment line - it's a JS file)
    cat > "$firefox_dir/mozilla.cfg" << 'EOF'
// OpenPath System Configuration
// Disable signature requirement for local extensions
lockPref("xpinstall.signatures.required", false);
lockPref("extensions.langpacks.signatures.required", false);
// Prevent extension blocklist from blocking our extension
lockPref("extensions.blocklist.enabled", false);
EOF
    
    log "✓ Firefox autoconfig generated"
    return 0
}

# ============================================================================
# FIREFOX EXTENSION INSTALLATION
# ============================================================================

# Install Firefox extension system-wide
install_firefox_extension() {
    local ext_source="${1:-$INSTALL_DIR/firefox-extension}"
    local ext_id="monitor-bloqueos@openpath"
    local firefox_app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
    local ext_dir="/usr/share/mozilla/extensions/$firefox_app_id"
    
    if [ ! -d "$ext_source" ]; then
        log "⚠ Extension directory not found: $ext_source"
        return 1
    fi
    
    log "Installing Firefox extension..."
    
    # First, generate autoconfig to disable signature requirements
    generate_firefox_autoconfig
    
    # Create extension directory
    mkdir -p "$ext_dir/$ext_id"
    
    # Copy extension files (excluding native host and build scripts)
    # Manifest references dist/background.js and popup/popup.html (which loads dist/*.js)
    if [[ ! -f "$ext_source/manifest.json" ]]; then
        log "⚠ Missing extension manifest: $ext_source/manifest.json"
        return 1
    fi

    if [[ ! -f "$ext_source/popup/popup.html" ]]; then
        log "⚠ Missing extension popup HTML: $ext_source/popup/popup.html"
        return 1
    fi

    if [[ ! -d "$ext_source/icons" ]]; then
        log "⚠ Missing extension icons directory: $ext_source/icons"
        return 1
    fi

    if [[ ! -f "$ext_source/dist/background.js" ]]; then
        log "⚠ Missing extension build artifact: $ext_source/dist/background.js"
        return 1
    fi

    if [[ ! -f "$ext_source/dist/popup.js" ]]; then
        log "⚠ Missing extension build artifact: $ext_source/dist/popup.js"
        return 1
    fi

    if [[ ! -f "$ext_source/dist/config.js" ]]; then
        log "⚠ Missing extension build artifact: $ext_source/dist/config.js"
        return 1
    fi

    if [[ ! -d "$ext_source/dist/lib" ]]; then
        log "⚠ Missing extension build artifact directory: $ext_source/dist/lib"
        return 1
    fi

    if [[ ! -f "$ext_source/blocked/blocked.html" ]]; then
        log "⚠ Missing extension blocked screen: $ext_source/blocked/blocked.html"
        return 1
    fi

    if [[ ! -f "$ext_source/blocked/blocked.css" ]]; then
        log "⚠ Missing extension blocked screen: $ext_source/blocked/blocked.css"
        return 1
    fi

    if [[ ! -f "$ext_source/blocked/blocked.js" ]]; then
        log "⚠ Missing extension blocked screen: $ext_source/blocked/blocked.js"
        return 1
    fi

    cp "$ext_source/manifest.json" "$ext_dir/$ext_id/"
    mkdir -p "$ext_dir/$ext_id/dist"
    cp "$ext_source/dist/background.js" "$ext_dir/$ext_id/dist/"
    cp "$ext_source/dist/popup.js" "$ext_dir/$ext_id/dist/"
    cp "$ext_source/dist/config.js" "$ext_dir/$ext_id/dist/"
    cp -r "$ext_source/dist/lib" "$ext_dir/$ext_id/dist/"
    cp -r "$ext_source/popup" "$ext_dir/$ext_id/"
    cp -r "$ext_source/icons" "$ext_dir/$ext_id/"
    cp -r "$ext_source/blocked" "$ext_dir/$ext_id/"
    
    # Set permissions
    chmod -R 755 "$ext_dir/$ext_id"
    
    log "✓ Extension copied to $ext_dir/$ext_id"
    
    # Update policies.json to force-install the extension
    add_extension_to_policies "$ext_id" "$ext_dir/$ext_id"
    
    log "✓ Firefox extension installed"
    return 0
}

# Add extension to Firefox policies for force-install
add_extension_to_policies() {
    local ext_id="$1"
    local ext_path="$2"
    
    local policies_file="$FIREFOX_POLICIES"
    mkdir -p "$(dirname "$policies_file")"
    
    python3 << PYEOF
import json
import os

policies_file = "$policies_file"
ext_id = "$ext_id"
ext_path = "$ext_path"

# Read existing policies or create new
if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
    except Exception as e:
        print(f"Warning: Failed to read existing policies: {e}", file=sys.stderr)
        policies = {"policies": {}}
else:
    policies = {"policies": {}}

if "policies" not in policies:
    policies["policies"] = {}

# Add ExtensionSettings for force-install
if "ExtensionSettings" not in policies["policies"]:
    policies["policies"]["ExtensionSettings"] = {}

policies["policies"]["ExtensionSettings"][ext_id] = {
    "installation_mode": "force_installed",
    "install_url": f"file://{ext_path}"
}

# Also add to Extensions.Install list
if "Extensions" not in policies["policies"]:
    policies["policies"]["Extensions"] = {}

if "Install" not in policies["policies"]["Extensions"]:
    policies["policies"]["Extensions"]["Install"] = []

# Add path if not already present
if ext_path not in policies["policies"]["Extensions"]["Install"]:
    policies["policies"]["Extensions"]["Install"].append(ext_path)

# Lock the extension so users can't disable it
if "Locked" not in policies["policies"]["Extensions"]:
    policies["policies"]["Extensions"]["Locked"] = []

if ext_id not in policies["policies"]["Extensions"]["Locked"]:
    policies["policies"]["Extensions"]["Locked"].append(ext_id)

with open(policies_file, 'w') as f:
    json.dump(policies, f, indent=2)

print(f"Extensión {ext_id} añadida a políticas")
PYEOF
    
    log "✓ Extension added to policies.json"
}

# Install native messaging host for the extension
install_native_host() {
    local native_source="${1:-$INSTALL_DIR/firefox-extension/native}"
    local native_manifest_dir="/usr/lib/mozilla/native-messaging-hosts"
    local native_script_dir="/usr/local/lib/openpath"
    
    if [ ! -d "$native_source" ]; then
        log "⚠ Native host directory not found: $native_source"
        return 1
    fi
    
    log "Installing native messaging host..."
    
    # Create directories
    mkdir -p "$native_manifest_dir"
    mkdir -p "$native_script_dir"
    
    # Copy Python script
    cp "$native_source/openpath-native-host.py" "$native_script_dir/"
    chmod +x "$native_script_dir/openpath-native-host.py"
    
    # Generate manifest with correct path
    cat > "$native_manifest_dir/openpath_native_host.json" << EOF
{
    "name": "whitelist_native_host",
    "description": "OpenPath System Native Messaging Host",
    "path": "$native_script_dir/openpath-native-host.py",
    "type": "stdio",
    "allowed_extensions": ["monitor-bloqueos@openpath"]
}
EOF
    
    log "✓ Native messaging host installed"
    return 0
}

# Remove Firefox extension (for uninstall)
remove_firefox_extension() {
    local ext_id="monitor-bloqueos@openpath"
    local firefox_app_id="{ec8030f7-c20a-464f-9b0e-13a3a9e97384}"
    local ext_dir="/usr/share/mozilla/extensions/$firefox_app_id/$ext_id"
    
    log "Removing Firefox extension..."
    
    # Remove extension directory
    rm -rf "$ext_dir" 2>/dev/null || true
    
    # Remove from policies.json
    if [ -f "$FIREFOX_POLICIES" ]; then
        python3 << PYEOF
import json
import os

policies_file = "$FIREFOX_POLICIES"
ext_id = "$ext_id"

if os.path.exists(policies_file):
    try:
        with open(policies_file, 'r') as f:
            policies = json.load(f)
        
        # Remove from ExtensionSettings
        if "policies" in policies and "ExtensionSettings" in policies["policies"]:
            policies["policies"]["ExtensionSettings"].pop(ext_id, None)
        
        # Remove from Extensions lists
        if "policies" in policies and "Extensions" in policies["policies"]:
            ext = policies["policies"]["Extensions"]
            if "Install" in ext:
                ext["Install"] = [p for p in ext["Install"] if ext_id not in p]
            if "Locked" in ext:
                ext["Locked"] = [e for e in ext["Locked"] if e != ext_id]
        
        with open(policies_file, 'w') as f:
            json.dump(policies, f, indent=2)
    except Exception as e:
        print(f"Warning: Failed to update Firefox policies during extension removal: {e}", file=sys.stderr)
PYEOF
    fi
    
    # Remove native host
    rm -f "/usr/lib/mozilla/native-messaging-hosts/openpath_native_host.json" 2>/dev/null || true
    rm -f "/usr/local/lib/openpath/openpath-native-host.py" 2>/dev/null || true
    
    # Remove autoconfig
    local firefox_dir
    firefox_dir=$(detect_firefox_dir 2>/dev/null)
    if [ -n "$firefox_dir" ]; then
        rm -f "$firefox_dir/defaults/pref/autoconfig.js" 2>/dev/null || true
        rm -f "$firefox_dir/mozilla.cfg" 2>/dev/null || true
    fi
    
    log "✓ Firefox extension removed"
}
