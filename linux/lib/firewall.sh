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
# firewall.sh - Firewall management functions (iptables)
# Part of the OpenPath DNS system
################################################################################

_firewall_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=firewall-rule-helpers.sh
source "$_firewall_lib_dir/firewall-rule-helpers.sh"
# shellcheck source=firewall-snapshot.sh
source "$_firewall_lib_dir/firewall-snapshot.sh"
# shellcheck source=firewall-runtime.sh
source "$_firewall_lib_dir/firewall-runtime.sh"
unset _firewall_lib_dir
