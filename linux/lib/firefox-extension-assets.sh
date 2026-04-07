#!/bin/bash
set -o pipefail

################################################################################
# firefox-extension-assets.sh - Shared Firefox extension asset helpers
# Part of the OpenPath DNS system
################################################################################

openpath_firefox_asset_log() {
    local message="$1"

    if declare -F log >/dev/null 2>&1; then
        log "$message"
    else
        echo "$message" >&2
    fi
}

openpath_firefox_release_artifact_candidates() {
    local source_root="$1"

    printf '%s\n' \
        "$source_root/browser-extension/firefox-release" \
        "$source_root/firefox-extension/build/firefox-release"
}

find_firefox_release_artifacts_dir() {
    local source_root="$1"
    local candidate=""

    while IFS= read -r candidate; do
        [ -n "$candidate" ] || continue
        if [ -f "$candidate/metadata.json" ]; then
            printf '%s\n' "$candidate"
            return 0
        fi
    done < <(openpath_firefox_release_artifact_candidates "$source_root")

    return 1
}

stage_firefox_release_artifacts() {
    local source_root="$1"
    local destination_dir="$2"
    local release_source=""

    release_source="$(find_firefox_release_artifacts_dir "$source_root")" || return 1

    mkdir -p "$destination_dir"
    cp "$release_source/metadata.json" "$destination_dir/"
    if [ -f "$release_source/openpath-firefox-extension.xpi" ]; then
        cp "$release_source/openpath-firefox-extension.xpi" "$destination_dir/"
    fi

    printf '%s\n' "$release_source"
}

openpath_firefox_unpacked_required_assets() {
    cat <<'EOF'
manifest.json|file|extension manifest
popup/popup.html|file|extension popup HTML
icons|dir|extension icons directory
dist/background.js|file|extension build artifact
dist/popup.js|file|extension build artifact
dist/lib|dir|extension build artifact directory
blocked/blocked.html|file|extension blocked screen
blocked/blocked.css|file|extension blocked screen
blocked/blocked.js|file|extension blocked screen
EOF
}

openpath_firefox_unpacked_bundle_items() {
    cat <<'EOF'
manifest.json
dist/background.js
dist/popup.js
dist/lib
popup
icons
blocked
EOF
}

openpath_firefox_unpacked_optional_stage_items() {
    cat <<'EOF'
native
EOF
}

validate_firefox_unpacked_extension_assets() {
    local ext_source="$1"
    local relative_path=""
    local asset_type=""
    local description=""
    local source_path=""

    if [ ! -d "$ext_source" ]; then
        openpath_firefox_asset_log "⚠ Extension directory not found: $ext_source"
        return 1
    fi

    while IFS='|' read -r relative_path asset_type description; do
        [ -n "$relative_path" ] || continue
        source_path="$ext_source/$relative_path"

        case "$asset_type" in
            file)
                if [ ! -f "$source_path" ]; then
                    openpath_firefox_asset_log "⚠ Missing ${description}: $source_path"
                    return 1
                fi
                ;;
            dir)
                if [ ! -d "$source_path" ]; then
                    openpath_firefox_asset_log "⚠ Missing ${description}: $source_path"
                    return 1
                fi
                ;;
        esac
    done < <(openpath_firefox_unpacked_required_assets)

    return 0
}

copy_firefox_extension_assets_from_list() {
    local ext_source="$1"
    local destination_dir="$2"
    local asset_list_func="$3"
    local relative_path=""
    local source_path=""
    local destination_path=""

    while IFS= read -r relative_path; do
        [ -n "$relative_path" ] || continue

        source_path="$ext_source/$relative_path"
        if [ ! -e "$source_path" ]; then
            continue
        fi

        destination_path="$destination_dir/$relative_path"
        mkdir -p "$(dirname "$destination_path")"

        if [ -d "$source_path" ]; then
            rm -rf "$destination_path"
            cp -r "$source_path" "$destination_path"
        else
            cp "$source_path" "$destination_path"
        fi
    done < <("$asset_list_func")
}

stage_firefox_unpacked_extension_assets() {
    local ext_source="$1"
    local destination_dir="$2"

    validate_firefox_unpacked_extension_assets "$ext_source" || return 1

    mkdir -p "$destination_dir"
    copy_firefox_extension_assets_from_list \
        "$ext_source" \
        "$destination_dir" \
        openpath_firefox_unpacked_bundle_items
}

stage_firefox_installation_bundle() {
    local ext_source="$1"
    local destination_dir="$2"

    stage_firefox_unpacked_extension_assets "$ext_source" "$destination_dir" || return 1
    stage_firefox_optional_extension_assets "$ext_source" "$destination_dir"
}

stage_firefox_optional_extension_assets() {
    local ext_source="$1"
    local destination_dir="$2"

    mkdir -p "$destination_dir"
    copy_firefox_extension_assets_from_list \
        "$ext_source" \
        "$destination_dir" \
        openpath_firefox_unpacked_optional_stage_items
}
