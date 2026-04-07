#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

IMAGE_TAG="${OPENPATH_STUDENT_E2E_IMAGE_TAG:-openpath-student-e2e:latest}"
CONTAINER_NAME="${OPENPATH_STUDENT_E2E_CONTAINER_NAME:-student-policy-test-$$}"
API_PORT="${OPENPATH_STUDENT_API_PORT:-3101}"
FIXTURE_PORT="${OPENPATH_STUDENT_FIXTURE_PORT:-18081}"
MACHINE_NAME="${OPENPATH_STUDENT_MACHINE_NAME:-linux-student-e2e}"
ARTIFACTS_DIR="${OPENPATH_STUDENT_ARTIFACTS_DIR:-$PROJECT_ROOT/tests/e2e/artifacts/linux-student-policy}"
STUDENT_HOST_SUFFIX="${OPENPATH_STUDENT_HOST_SUFFIX:-127.0.0.1.sslip.io}"

API_PID=""
FIXTURE_PID=""
_context_dir=""
_started_test_db=false

cleanup() {
    if [[ -n "$FIXTURE_PID" ]]; then
        kill "$FIXTURE_PID" >/dev/null 2>&1 || true
    fi

    if [[ -n "$API_PID" ]]; then
        kill "$API_PID" >/dev/null 2>&1 || true
    fi

    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true

    if [[ "$_started_test_db" == true ]]; then
        docker compose -f "$PROJECT_ROOT/docker-compose.test.yml" down -v >/dev/null 2>&1 || true
    fi

    if [[ -n "$_context_dir" && -d "$_context_dir" ]]; then
        rm -rf "$_context_dir" || true
    fi
}

debug_state() {
    echo ""
    echo "Linux student-policy debug information..."
    echo ""
    echo "Docker containers:"
    docker ps -a || true
    echo ""
    echo "Container system status:"
    docker exec "$CONTAINER_NAME" systemctl is-system-running --wait 2>/dev/null || true
    echo ""
    echo "openpath-sse-listener.service status:"
    docker exec "$CONTAINER_NAME" systemctl status openpath-sse-listener.service --no-pager 2>/dev/null || true
    echo ""
    echo "openpath-update.service status:"
    docker exec "$CONTAINER_NAME" systemctl status openpath-update.service --no-pager 2>/dev/null || true
    echo ""
    echo "Linux OpenPath log tail:"
    docker exec "$CONTAINER_NAME" bash -lc 'tail -n 200 /var/log/openpath.log 2>/dev/null || true' || true
    echo ""
    echo "Whitelist snapshot:"
    docker exec "$CONTAINER_NAME" bash -lc 'cat /var/lib/openpath/whitelist.txt 2>/dev/null || true' || true
}

on_error() {
    local rc=$?
    echo ""
    echo "Linux student-policy runner failed (exit code: $rc)"
    debug_state
    exit "$rc"
}

trap cleanup EXIT
trap on_error ERR

require_command() {
    local command_name="$1"
    if ! command -v "$command_name" >/dev/null 2>&1; then
        echo "Missing required command: $command_name" >&2
        exit 1
    fi
}

require_file() {
    local file_path="$1"
    if [[ ! -f "$file_path" ]]; then
        echo "Missing required file: $file_path" >&2
        exit 1
    fi
}

require_dir() {
    local dir_path="$1"
    if [[ ! -d "$dir_path" ]]; then
        echo "Missing required directory: $dir_path" >&2
        exit 1
    fi
}

is_port_in_use() {
    local port="$1"
    python3 - "$port" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
try:
    sock.bind(('127.0.0.1', port))
except OSError:
    sys.exit(0)
finally:
    sock.close()

sys.exit(1)
PY
}

get_free_port() {
    python3 - <<'PY'
import socket

sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind(('127.0.0.1', 0))
print(sock.getsockname()[1])
sock.close()
PY
}

wait_for_postgres() {
    local attempts=30
    local sleep_seconds=1

    for ((i = 1; i <= attempts; i += 1)); do
        if docker exec openpath-test-db pg_isready -U openpath -d openpath_test >/dev/null 2>&1; then
            return 0
        fi
        sleep "$sleep_seconds"
    done

    echo "Test PostgreSQL did not become ready in time" >&2
    exit 1
}

wait_for_http() {
    local url="$1"
    local host_header="${2:-}"
    local attempts="${3:-30}"

    for ((i = 1; i <= attempts; i += 1)); do
        if [[ -n "$host_header" ]]; then
            if curl -fsS -H "Host: $host_header" "$url" >/dev/null 2>&1; then
                return 0
            fi
        else
            if curl -fsS "$url" >/dev/null 2>&1; then
                return 0
            fi
        fi
        sleep 1
    done

    echo "Timed out waiting for HTTP endpoint: $url" >&2
    exit 1
}

wait_for_container_http() {
    local url="$1"
    local host_header="${2:-}"
    local attempts="${3:-30}"

    for ((i = 1; i <= attempts; i += 1)); do
        if [[ -n "$host_header" ]]; then
            if docker exec "$CONTAINER_NAME" curl -fsS -H "Host: $host_header" "$url" >/dev/null 2>&1; then
                return 0
            fi
        else
            if docker exec "$CONTAINER_NAME" curl -fsS "$url" >/dev/null 2>&1; then
                return 0
            fi
        fi
        sleep 1
    done

    echo "Timed out waiting for container HTTP endpoint: $url" >&2
    exit 1
}

wait_for_systemd() {
    local attempts=40

    for ((i = 1; i <= attempts; i += 1)); do
        local state
        state=$(docker exec "$CONTAINER_NAME" systemctl is-system-running 2>/dev/null || true)
        if [[ "$state" == "running" || "$state" == "degraded" ]]; then
            return 0
        fi
        sleep 1
    done

    echo "Timed out waiting for systemd inside $CONTAINER_NAME" >&2
    exit 1
}

reserve_runtime_ports() {
    if is_port_in_use "$API_PORT"; then
        API_PORT="$(get_free_port)"
    fi

    if is_port_in_use "$FIXTURE_PORT"; then
        FIXTURE_PORT="$(get_free_port)"
    fi
}

create_context() {
    local tmp
    tmp="$(mktemp -d -t openpath-student-e2e-context.XXXXXXXX)"

    mkdir -p "$tmp/linux" "$tmp/runtime" "$tmp/windows" "$tmp/tests/e2e" "$tmp/tests/selenium" "$tmp/firefox-extension"

    cp -a "$PROJECT_ROOT/linux/." "$tmp/linux/"
    cp -a "$PROJECT_ROOT/runtime/." "$tmp/runtime/"
    cp -a "$PROJECT_ROOT/windows/." "$tmp/windows/"
    cp -a "$PROJECT_ROOT/tests/e2e/." "$tmp/tests/e2e/"
    cp -a "$PROJECT_ROOT/tests/selenium/." "$tmp/tests/selenium/"

    require_file "$PROJECT_ROOT/firefox-extension/manifest.json"
    require_dir "$PROJECT_ROOT/firefox-extension/dist"
    require_dir "$PROJECT_ROOT/firefox-extension/popup"
    require_dir "$PROJECT_ROOT/firefox-extension/blocked"
    require_dir "$PROJECT_ROOT/firefox-extension/native"
    require_dir "$PROJECT_ROOT/firefox-extension/icons"

    cp -a "$PROJECT_ROOT/firefox-extension/manifest.json" "$tmp/firefox-extension/"
    cp -a "$PROJECT_ROOT/firefox-extension/dist" "$tmp/firefox-extension/"
    cp -a "$PROJECT_ROOT/firefox-extension/popup" "$tmp/firefox-extension/"
    cp -a "$PROJECT_ROOT/firefox-extension/blocked" "$tmp/firefox-extension/"
    cp -a "$PROJECT_ROOT/firefox-extension/native" "$tmp/firefox-extension/"
    cp -a "$PROJECT_ROOT/firefox-extension/icons" "$tmp/firefox-extension/"

    require_file "$PROJECT_ROOT/VERSION"
    require_file "$PROJECT_ROOT/runtime/browser-policy-spec.json"
    require_file "$PROJECT_ROOT/tests/e2e/Dockerfile.student"

    cp -a "$PROJECT_ROOT/VERSION" "$tmp/"
    cp -a "$PROJECT_ROOT/tests/e2e/Dockerfile.student" "$tmp/Dockerfile.student"

    echo "$tmp"
}

start_test_db() {
    echo "Starting test PostgreSQL..."
    docker compose -f "$PROJECT_ROOT/docker-compose.test.yml" down -v >/dev/null 2>&1 || true
    docker compose -f "$PROJECT_ROOT/docker-compose.test.yml" up -d
    _started_test_db=true
    wait_for_postgres
}

initialize_test_database() {
    echo "Initializing E2E test database..."
    (
        cd "$PROJECT_ROOT"
        DB_HOST=localhost \
        DB_PORT=5433 \
        DB_NAME=openpath_test \
        DB_USER=openpath \
        DB_PASSWORD=openpath_test \
        npm run db:setup:e2e --workspace=@openpath/api
    )
}

prepare_workspace() {
    echo "Building shared and Firefox extension workspaces..."
    (
        cd "$PROJECT_ROOT"
        npm run build --workspace=@openpath/shared
        npm run build --workspace=@openpath/firefox-extension
    )
}

resolve_student_host_suffix() {
    export OPENPATH_STUDENT_HOST_SUFFIX="$STUDENT_HOST_SUFFIX"
}

start_api_server() {
    local data_dir="$ARTIFACTS_DIR/api-data"
    mkdir -p "$data_dir"

    echo "Starting API on host port $API_PORT..."
    (
        cd "$PROJECT_ROOT"
        NODE_ENV=test \
        JWT_SECRET=openpath-student-policy-secret \
        SHARED_SECRET=openpath-student-policy-shared \
        DB_HOST=localhost \
        DB_PORT=5433 \
        DB_NAME=openpath_test \
        DB_USER=openpath \
        DB_PASSWORD=openpath_test \
        PORT="$API_PORT" \
        DATA_DIR="$data_dir" \
        PUBLIC_URL="http://host.docker.internal:$API_PORT" \
        node --import tsx api/src/server.ts >"$ARTIFACTS_DIR/api.log" 2>&1
    ) &
    API_PID=$!
    wait_for_http "http://127.0.0.1:$API_PORT/trpc/healthcheck.ready"
}

bootstrap_scenario() {
    local scenario_label="${1:-Linux Student Policy}"
    echo "Bootstrapping student-policy scenario..."
    local raw_json="$ARTIFACTS_DIR/student-scenario.raw.json"
    local final_json="$ARTIFACTS_DIR/student-scenario.json"

    (
        cd "$PROJECT_ROOT"
        OPENPATH_STUDENT_HOST_SUFFIX="$OPENPATH_STUDENT_HOST_SUFFIX" \
        node --import tsx tests/e2e/student-flow/backend-harness.ts bootstrap \
            --api-url "http://127.0.0.1:$API_PORT" \
            --scenario-name "$scenario_label" \
            --machine-hostname "$MACHINE_NAME" \
            >"$raw_json"
    )

    python3 - "$raw_json" "$final_json" "$API_PORT" <<'PY'
import json
import sys

raw_path, final_path, api_port = sys.argv[1:4]
with open(raw_path, 'r', encoding='utf-8') as fh:
    payload = json.load(fh)

payload['apiUrl'] = f'http://host.docker.internal:{api_port}'

with open(final_path, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, indent=2)
    fh.write('\n')
PY
}

build_image() {
    echo "Building Linux student-policy image..."
    _context_dir="$(create_context)"
    docker build -f "$_context_dir/Dockerfile.student" -t "$IMAGE_TAG" "$_context_dir"
}

start_container() {
    echo "Starting student-policy container..."
    docker run -d \
        --name "$CONTAINER_NAME" \
        --hostname "$MACHINE_NAME" \
        --privileged \
        --cgroupns=host \
        --tmpfs /run \
        --tmpfs /run/lock \
        --volume /sys/fs/cgroup:/sys/fs/cgroup:rw \
        --volume "$ARTIFACTS_DIR:/artifacts" \
        --add-host host.docker.internal:host-gateway \
        "$IMAGE_TAG" >/dev/null

    wait_for_systemd
}

start_container_fixture_server() {
    echo "Starting fixture server inside container on port $FIXTURE_PORT..."
    docker exec \
        -e OPENPATH_STUDENT_HOST_SUFFIX="$OPENPATH_STUDENT_HOST_SUFFIX" \
        "$CONTAINER_NAME" \
        bash -lc "cd /openpath/tests/selenium && nohup npx tsx /openpath/tests/e2e/student-flow/fixture-server.ts --host 0.0.0.0 --port '$FIXTURE_PORT' >/artifacts/fixture-server.json 2>/artifacts/fixture-server.log < /dev/null &"

    wait_for_container_http "http://127.0.0.1:$FIXTURE_PORT/ok" "portal.${OPENPATH_STUDENT_HOST_SUFFIX}:$FIXTURE_PORT"
}

configure_client() {
    local install_client="${1:-true}"

    if [[ "$install_client" == "true" ]]; then
        echo "Installing Linux OpenPath client in container..."
        docker exec "$CONTAINER_NAME" bash -lc 'rm -rf /openpath/linux/firefox-extension && cp -a /openpath/firefox-extension /openpath/linux/firefox-extension && cd /openpath && ./linux/install.sh --unattended --skip-firefox --with-native-host'
    else
        echo "Reconfiguring existing Linux OpenPath client in container..."
    fi

    local classroom_id
    local enrollment_token
    classroom_id=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["classroom"]["id"])' "$ARTIFACTS_DIR/student-scenario.json")
    enrollment_token=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1], encoding="utf-8"))["auth"]["teacher"]["accessToken"])' "$ARTIFACTS_DIR/student-scenario.json")

    # Replace the placeholder bearer token with a real enrollment token tied to the classroom.
    enrollment_token=$(curl -fsS \
        -H "Authorization: Bearer $enrollment_token" \
        -X POST "http://127.0.0.1:$API_PORT/api/enroll/$classroom_id/ticket" | \
        python3 -c 'import json,sys; print(json.load(sys.stdin)["enrollmentToken"])')

    docker exec "$CONTAINER_NAME" bash -lc \
        "/usr/local/bin/openpath setup --api-url 'http://host.docker.internal:$API_PORT' --classroom-id '$classroom_id' --enrollment-token '$enrollment_token' --machine-name '$MACHINE_NAME'"

    docker exec "$CONTAINER_NAME" bash -lc '/usr/local/bin/openpath-update.sh'
    docker exec "$CONTAINER_NAME" bash -lc 'mkdir -p /root/.mozilla/native-messaging-hosts && cp /usr/lib/mozilla/native-messaging-hosts/openpath_native_host.json /root/.mozilla/native-messaging-hosts/whitelist_native_host.json'

    local whitelist_url
    whitelist_url="$(docker exec "$CONTAINER_NAME" bash -lc 'cat /etc/openpath/whitelist-url.conf')"

    python3 - "$ARTIFACTS_DIR/student-scenario.json" "$whitelist_url" <<'PY'
import json
import re
import sys

scenario_path, whitelist_url = sys.argv[1:3]
match = re.search(r'/w/([^/]+)/', whitelist_url)
if match is None:
    raise SystemExit(f'Could not extract machine token from {whitelist_url}')

with open(scenario_path, 'r', encoding='utf-8') as fh:
    payload = json.load(fh)

payload['machine']['whitelistUrl'] = whitelist_url
payload['machine']['machineToken'] = match.group(1)

with open(scenario_path, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, indent=2)
    fh.write('\n')
PY
}

run_student_suite() {
    local mode="${1:-sse}"
    echo "Running Selenium student-policy suite inside container (mode: $mode)..."
    docker exec \
        -e OPENPATH_STUDENT_SCENARIO_FILE=/artifacts/student-scenario.json \
        -e OPENPATH_STUDENT_DIAGNOSTICS_DIR=/artifacts/selenium-diagnostics \
        -e OPENPATH_FIXTURE_PORT="$FIXTURE_PORT" \
        -e OPENPATH_STUDENT_HOST_SUFFIX="$OPENPATH_STUDENT_HOST_SUFFIX" \
        -e OPENPATH_EXTENSION_PATH=/openpath/firefox-extension/openpath-firefox-extension.xpi \
        -e OPENPATH_WHITELIST_PATH=/var/lib/openpath/whitelist.txt \
        -e OPENPATH_FORCE_UPDATE_COMMAND=/usr/local/bin/openpath-update.sh \
        -e OPENPATH_DISABLE_SSE_COMMAND='systemctl stop openpath-sse-listener.service' \
        -e OPENPATH_ENABLE_SSE_COMMAND='systemctl start openpath-sse-listener.service' \
        -e OPENPATH_STUDENT_MODE="$mode" \
        -e CI=true \
        "$CONTAINER_NAME" \
        bash -lc 'cd /openpath/tests/selenium && npm run test:student-policy:ci'
}

main() {
    require_command curl
    require_command docker
    require_command node
    require_command npm
    require_command python3

    mkdir -p "$ARTIFACTS_DIR"

    reserve_runtime_ports
    prepare_workspace
    resolve_student_host_suffix
    start_test_db
    initialize_test_database
    start_api_server
    bootstrap_scenario "Linux Student Policy SSE"
    build_image
    start_container
    start_container_fixture_server
    configure_client true
    run_student_suite sse
    bootstrap_scenario "Linux Student Policy Fallback"
    configure_client false
    run_student_suite fallback

    echo "Linux student-policy runner completed successfully"
}

main "$@"
