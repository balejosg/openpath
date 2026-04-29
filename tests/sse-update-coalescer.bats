#!/usr/bin/env bats
################################################################################
# sse-update-coalescer.bats - Tests for Linux SSE update coalescing policy
################################################################################

load 'test_helper'

setup_coalescer_fixture() {
    export OPENPATH_RUN="$TEST_TMP_DIR/run"
    export LOG_FILE="$TEST_TMP_DIR/openpath.log"
    mkdir -p "$OPENPATH_RUN"

    UPDATE_SCRIPT="$TEST_TMP_DIR/openpath-update.sh"
    cat > "$UPDATE_SCRIPT" <<EOF
#!/bin/sh
echo update >> "$TEST_TMP_DIR/update-calls"
EOF
    chmod +x "$UPDATE_SCRIPT"

    # shellcheck source=/dev/null
    source "$PROJECT_DIR/linux/lib/common.sh"
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/linux/lib/sse-update-coalescer.sh"

    export SSE_UPDATE_COOLDOWN=1
}

@test "sse coalescer runs immediate update when there is no recent update" {
    setup_coalescer_fixture

    sse_trigger_update "$UPDATE_SCRIPT" 100

    [ "$(cat "$OPENPATH_RUN/sse-last-update")" = "100" ]
    [ ! -f "$OPENPATH_RUN/sse-pending-update" ]
    [ "$(wc -l < "$TEST_TMP_DIR/update-calls")" -eq 1 ]
}

@test "sse coalescer schedules one deferred update during cooldown" {
    setup_coalescer_fixture
    echo 100 > "$OPENPATH_RUN/sse-last-update"

    sse_trigger_update "$UPDATE_SCRIPT" 100
    sse_trigger_update "$UPDATE_SCRIPT" 100

    [ -f "$OPENPATH_RUN/sse-pending-update" ]
    sleep 2

    [ ! -f "$OPENPATH_RUN/sse-pending-update" ]
    [ "$(wc -l < "$TEST_TMP_DIR/update-calls")" -eq 1 ]
}

@test "sse coalescer clears pending marker after deferred update runs" {
    setup_coalescer_fixture
    echo "$(date +%s)" > "$OPENPATH_RUN/sse-last-update"

    sse_trigger_update "$UPDATE_SCRIPT"
    [ -f "$OPENPATH_RUN/sse-pending-update" ]

    sleep 2

    [ ! -f "$OPENPATH_RUN/sse-pending-update" ]
    [ "$(wc -l < "$TEST_TMP_DIR/update-calls")" -eq 1 ]
}

@test "sse coalescer warns and continues when update command is missing" {
    setup_coalescer_fixture
    missing_update="$TEST_TMP_DIR/missing-openpath-update.sh"

    run sse_trigger_update "$missing_update" 200

    [ "$status" -eq 0 ]
    grep -q "Update script not found" "$LOG_FILE"
}

@test "sse coalescer treats malformed last update as stale" {
    setup_coalescer_fixture
    echo "not-a-timestamp" > "$OPENPATH_RUN/sse-last-update"

    sse_trigger_update "$UPDATE_SCRIPT" 300

    [ "$(cat "$OPENPATH_RUN/sse-last-update")" = "300" ]
    [ "$(wc -l < "$TEST_TMP_DIR/update-calls")" -eq 1 ]
}
