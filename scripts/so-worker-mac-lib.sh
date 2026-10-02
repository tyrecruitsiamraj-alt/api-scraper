#!/bin/bash
# Shared Mac worker start/stop helpers for the switch panel (no Terminal UI).
# Usage: so-worker-mac-lib.sh <status|start-scrape|stop-scrape|start-autopost|stop-autopost|update|hostname|sha>

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RUN="$ROOT/.run"
mkdir -p "$RUN" "$ROOT/output/worker-logs"

# Prefer Homebrew / common Node paths when launched from AppleScript (minimal PATH).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

running() {
  local name="$1" f="$RUN/$name.pid"
  [ -f "$f" ] && kill -0 "$(cat "$f" 2>/dev/null)" 2>/dev/null
}

terminate_tree() {
  local pid="$1" child
  [ -n "${pid:-}" ] || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    terminate_tree "$child"
  done
  kill -TERM "$pid" 2>/dev/null || true
  local waited=0
  while kill -0 "$pid" 2>/dev/null && [ "$waited" -lt 8 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  kill -KILL "$pid" 2>/dev/null || true
}

cleanup_pattern() {
  local pattern="$1" pid
  for pid in $(pgrep -f "$pattern" 2>/dev/null || true); do
    terminate_tree "$pid"
  done
}

ensure_main() {
  local branch
  branch="$(git branch --show-current 2>/dev/null || true)"
  if [ "$branch" != "main" ]; then
    echo "ต้องอยู่ branch main (ตอนนี้: ${branch:-detached})"
    return 1
  fi
}

pull_main() {
  ensure_main
  git fetch origin main >/dev/null 2>&1
  git pull --ff-only origin main >/dev/null 2>&1
  local sha remote
  sha="$(git rev-parse HEAD)"
  remote="$(git rev-parse origin/main)"
  if [ "$sha" != "$remote" ]; then
    echo "branch ยังไม่ตรง origin/main"
    return 1
  fi
  export WORKER_BUILD_SHA="$sha"
  echo "$sha"
}

start_caffeinate() {
  if running caffeinate; then return 0; fi
  if running scraper; then
    caffeinate -is -w "$(cat "$RUN/scraper.pid")" >/dev/null 2>&1 &
    echo $! > "$RUN/caffeinate.pid"
  fi
}

cmd_status() {
  local scrape=off auto=off sha
  running scraper && scrape=on
  running autopost && auto=on
  sha="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
  printf 'scrape=%s\nautopost=%s\nsha=%s\nhost=%s\n' "$scrape" "$auto" "$sha" "$(hostname)"
}

cmd_start_scrape() {
  ensure_main
  if running scraper; then
    echo "scrap already on"
    return 0
  fi
  local sha
  sha="$(pull_main)"
  export WORKER_BUILD_SHA="$sha"
  nohup npm run scraper:pool > "$RUN/scraper.log" 2>&1 &
  echo $! > "$RUN/scraper.pid"
  start_caffeinate
  echo "scrap on sha=$sha"
}

cmd_stop_scrape() {
  if [ -f "$RUN/scraper.pid" ]; then
    terminate_tree "$(cat "$RUN/scraper.pid")"
    rm -f "$RUN/scraper.pid"
  fi
  cleanup_pattern 'workers/scraper-pool\.mjs'
  cleanup_pattern 'workers/runner\.js'
  if [ -f "$RUN/caffeinate.pid" ]; then
    terminate_tree "$(cat "$RUN/caffeinate.pid")"
    rm -f "$RUN/caffeinate.pid"
  fi
  echo "scrap off"
}

cmd_start_autopost() {
  ensure_main
  if running autopost; then
    echo "autopost already on"
    return 0
  fi
  local sha
  sha="$(git rev-parse HEAD)"
  export WORKER_BUILD_SHA="$sha"
  nohup bash -c 'cd autopost && exec npm run worker:post' > "$RUN/autopost.log" 2>&1 &
  echo $! > "$RUN/autopost.pid"
  echo "autopost on"
}

cmd_stop_autopost() {
  if [ -f "$RUN/autopost.pid" ]; then
    terminate_tree "$(cat "$RUN/autopost.pid")"
    rm -f "$RUN/autopost.pid"
  fi
  cleanup_pattern 'scripts/post-remote-worker-supervisor\.js'
  cleanup_pattern 'scripts/post-remote-worker\.js'
  echo "autopost off"
}

cmd_update() {
  local was_scrape=0 was_auto=0
  if running scraper; then was_scrape=1; fi
  if running autopost; then was_auto=1; fi
  cmd_stop_scrape >/dev/null || true
  cmd_stop_autopost >/dev/null || true
  local sha
  sha="$(pull_main)"
  if [ "$was_scrape" -eq 1 ]; then cmd_start_scrape >/dev/null; fi
  if [ "$was_auto" -eq 1 ]; then cmd_start_autopost >/dev/null; fi
  echo "updated $sha"
}

cmd_open_logs() {
  open "$RUN" 2>/dev/null || open "$ROOT/output/worker-logs" 2>/dev/null || true
  echo "ok"
}

case "${1:-}" in
  status) cmd_status ;;
  start-scrape) cmd_start_scrape ;;
  stop-scrape) cmd_stop_scrape ;;
  start-autopost) cmd_start_autopost ;;
  stop-autopost) cmd_stop_autopost ;;
  toggle-scrape)
    if running scraper; then cmd_stop_scrape; else cmd_start_scrape; fi
    ;;
  toggle-autopost)
    if running autopost; then cmd_stop_autopost; else cmd_start_autopost; fi
    ;;
  update) cmd_update ;;
  open-logs) cmd_open_logs ;;
  *)
    echo "usage: $0 status|start-scrape|stop-scrape|toggle-scrape|start-autopost|stop-autopost|toggle-autopost|update|open-logs" >&2
    exit 2
    ;;
esac
