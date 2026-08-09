#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="GenOffice"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ELECTRON_BIN="$ROOT_DIR/node_modules/.bin/electron"
ELECTRON_PROCESS="$ROOT_DIR/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron"
PID_FILE="$ROOT_DIR/.codex/genoffice-run.pid"
RUN_DATA_DIR="$ROOT_DIR/.codex/run-data"
LOG_FILE="$ROOT_DIR/.codex/genoffice-run.log"

stop_previous_run() {
  [[ -f "$PID_FILE" ]] || return 0
  local pid
  pid="$(tr -cd '0-9' <"$PID_FILE")"
  [[ -n "$pid" ]] || return 0
  local command
  command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  if [[ "$command" == *"$ROOT_DIR/apps/shell"* ]] &&
    { [[ "$command" == *"$ELECTRON_BIN"* ]] || [[ "$command" == *"$ELECTRON_PROCESS"* ]]; }; then
    kill "$pid"
  fi
  rm -f "$PID_FILE"
}

require_build_tools() {
  if ! command -v cargo >/dev/null 2>&1; then
    echo "error: cargo is required to build the sheets sidecar; install a Rust toolchain first" >&2
    exit 127
  fi
  if [[ ! -x "$ELECTRON_BIN" ]]; then
    echo "error: Electron is not installed; run npm install first" >&2
    exit 127
  fi
  if ! "$ELECTRON_BIN" --version >/dev/null 2>&1; then
    echo "error: Electron runtime is missing; run npm rebuild electron first" >&2
    exit 127
  fi
}

launch_app() {
  mkdir -p "$RUN_DATA_DIR"
  nohup env GENOFFICE_USER_DATA="$RUN_DATA_DIR" \
    "$ELECTRON_BIN" "$ROOT_DIR/apps/shell" >>"$LOG_FILE" 2>&1 &
  APP_PID=$!
  printf '%s\n' "$APP_PID" >"$PID_FILE"
}

stop_previous_run
require_build_tools
cd "$ROOT_DIR"
npm run build:all

case "$MODE" in
  run)
    launch_app
    ;;
  --debug | debug)
    GENOFFICE_USER_DATA="$RUN_DATA_DIR" lldb -- "$ELECTRON_BIN" "$ROOT_DIR/apps/shell"
    ;;
  --logs | logs)
    launch_app
    /usr/bin/log stream --info --style compact --predicate 'process == "Electron"'
    ;;
  --telemetry | telemetry)
    launch_app
    /usr/bin/log stream --info --style compact --predicate 'process == "Electron"'
    ;;
  --verify | verify)
    launch_app
    sleep 8
    kill -0 "$APP_PID"
    echo "$APP_NAME stayed running for the startup smoke test (pid $APP_PID)"
    stop_previous_run
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
