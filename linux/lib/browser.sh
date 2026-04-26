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
# Part of the OpenPath DNS system
################################################################################

_browser_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=firefox-extension-assets.sh
source "$_browser_lib_dir/firefox-extension-assets.sh"
# shellcheck source=firefox-policy.sh
source "$_browser_lib_dir/firefox-policy.sh"
# shellcheck source=firefox-managed-extension.sh
source "$_browser_lib_dir/firefox-managed-extension.sh"
# shellcheck source=browser-request-readiness.sh
source "$_browser_lib_dir/browser-request-readiness.sh"
# shellcheck source=chromium-managed-extension.sh
source "$_browser_lib_dir/chromium-managed-extension.sh"
# shellcheck source=browser-process.sh
source "$_browser_lib_dir/browser-process.sh"
# shellcheck source=browser-firefox.sh
source "$_browser_lib_dir/browser-firefox.sh"
# shellcheck source=browser-native-host.sh
source "$_browser_lib_dir/browser-native-host.sh"
unset _browser_lib_dir

OPENPATH_FIREFOX_NATIVE_HOST_NAME="${OPENPATH_FIREFOX_NATIVE_HOST_NAME:-whitelist_native_host}"
OPENPATH_FIREFOX_NATIVE_HOST_FILENAME="${OPENPATH_FIREFOX_NATIVE_HOST_FILENAME:-${OPENPATH_FIREFOX_NATIVE_HOST_NAME}.json}"
OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME="${OPENPATH_CHROMIUM_NATIVE_HOST_FILENAME:-openpath_native_host.json}"
OPENPATH_NATIVE_HOST_SCRIPT_NAME="${OPENPATH_NATIVE_HOST_SCRIPT_NAME:-openpath-native-host.py}"
