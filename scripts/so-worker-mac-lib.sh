#!/bin/bash
# Shared Mac worker start/stop helpers for the switch panel (no Terminal UI).
# Usage: so-worker-mac-lib.sh <status|start-scrape|stop-scrape|start-autopost|stop-autopost|update|autostart|install-autostart|uninstall-autostart>

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
RUN="$ROOT/.run"
mkdir -p "$RUN" "$ROOT/output/worker-logs"

# Prefer Homebrew / common Node paths when launched from AppleScript (minimal PATH).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

running() {
  local name="$1"
  local f="$RUN/$name.pid"
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
  ensure_main || return 1
  # เช็กผลทีละคำสั่ง: เรียกผ่าน `|| ...` แล้ว set -e ไม่ทำงาน ห้ามปล่อยให้ fetch พังแล้วรายงานว่าอัปเดตแล้ว
  git fetch origin main >/dev/null 2>&1 || { echo "ดึงโค้ดจาก GitHub ไม่ได้" >&2; return 1; }
  git pull --ff-only origin main >/dev/null 2>&1 || { echo "รวมโค้ดใหม่ไม่ได้ (มีไฟล์แก้ค้างบนเครื่อง?)" >&2; return 1; }
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

# จำว่าคนเปิดสวิตช์ไหนไว้ — เครื่องรีสตาร์ตแล้ว autostart เปิดตามนี้
want() { touch "$RUN/want-$1"; }
unwant() { rm -f "$RUN/want-$1"; }
wanted() { [ -f "$RUN/want-$1" ]; }

cmd_start_scrape() {
  ensure_main
  if running scraper; then
    echo "scrap already on"
    return 0
  fi
  local sha
  sha="$(pull_main)"
  launch_scrape "$sha"
}

launch_scrape() {
  export WORKER_BUILD_SHA="$1"
  nohup npm run scraper:pool > "$RUN/scraper.log" 2>&1 &
  echo $! > "$RUN/scraper.pid"
  start_caffeinate
  echo "scrap on sha=$1"
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
  # ดึงโค้ดไม่ผ่าน (เน็ตหลุด/มีไฟล์แก้ค้าง) ต้องไม่ทิ้งเครื่องไว้แบบปิดอยู่ — เปิดกลับด้วยโค้ดเดิมแล้วบอกว่าไม่ผ่าน
  local sha status=0
  sha="$(pull_main)" || { status=1; sha="$(git rev-parse HEAD)"; }
  if [ "$was_scrape" -eq 1 ]; then launch_scrape "$sha" >/dev/null; fi
  if [ "$was_auto" -eq 1 ]; then cmd_start_autopost >/dev/null; fi
  if [ "$status" -ne 0 ]; then
    echo "update failed: ดึงโค้ดใหม่ไม่ได้ เปิดกลับด้วยโค้ดเดิม $(git rev-parse --short HEAD)"
    return 1
  fi
  echo "updated $sha"
}

# เปิดเครื่อง/ล็อกอินแล้ว: รอเน็ตถึง GitHub (สูงสุด ~5 นาที) แล้วเปิดสวิตช์ที่เคยเปิดไว้
cmd_autostart() {
  echo "[$(date '+%F %T')] autostart"
  local tries=0
  until git ls-remote --exit-code origin main >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -ge 30 ]; then echo "ยังต่อ GitHub ไม่ได้ — เปิดด้วยโค้ดเดิม"; break; fi
    sleep 10
  done
  if wanted scrape && ! running scraper; then
    local sha
    sha="$(pull_main)" || sha="$(git rev-parse HEAD)"
    launch_scrape "$sha"
  fi
  if wanted autopost && ! running autopost; then cmd_start_autopost; fi
  cmd_status
}

AGENT_LABEL="com.so.workers.autostart"
AGENT_PLIST="$HOME/Library/LaunchAgents/$AGENT_LABEL.plist"

# ตั้งให้ macOS เรียก autostart ทุกครั้งที่ล็อกอิน (เปิดเครื่อง + ล็อกอินอัตโนมัติ = worker ขึ้นเอง)
cmd_install_autostart() {
  local node_dir
  node_dir="$(dirname "$(command -v node)")" || { echo "ไม่พบ node"; return 1; }
  # เครื่องที่เปิดสวิตช์ไว้ก่อนมีระบบนี้ ยังไม่มีไฟล์จำ — จำจากที่กำลังวิ่งอยู่
  if ! wanted scrape && ! wanted autopost; then
    if running scraper; then want scrape; fi
    if running autopost; then want autopost; fi
  fi
  mkdir -p "$HOME/Library/LaunchAgents"
  cat > "$AGENT_PLIST.tmp" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$AGENT_LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$ROOT/scripts/so-worker-mac-lib.sh</string><string>autostart</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$node_dir:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$RUN/autostart.log</string>
  <key>StandardErrorPath</key><string>$RUN/autostart.log</string>
</dict>
</plist>
PLIST
  if cmp -s "$AGENT_PLIST.tmp" "$AGENT_PLIST" 2>/dev/null; then
    rm -f "$AGENT_PLIST.tmp"
  else
    mv "$AGENT_PLIST.tmp" "$AGENT_PLIST"
  fi
  echo "autostart installed"
}

cmd_uninstall_autostart() {
  launchctl bootout "gui/$(id -u)/$AGENT_LABEL" >/dev/null 2>&1 || true
  rm -f "$AGENT_PLIST"
  echo "autostart removed"
}

cmd_open_logs() {
  open "$RUN" 2>/dev/null || open "$ROOT/output/worker-logs" 2>/dev/null || true
  echo "ok"
}

case "${1:-}" in
  status) cmd_status ;;
  start-scrape) want scrape; cmd_start_scrape ;;
  stop-scrape) unwant scrape; cmd_stop_scrape ;;
  start-autopost) want autopost; cmd_start_autopost ;;
  stop-autopost) unwant autopost; cmd_stop_autopost ;;
  toggle-scrape)
    if running scraper; then unwant scrape; cmd_stop_scrape; else want scrape; cmd_start_scrape; fi
    ;;
  toggle-autopost)
    if running autopost; then unwant autopost; cmd_stop_autopost; else want autopost; cmd_start_autopost; fi
    ;;
  update) cmd_update ;;
  autostart) cmd_autostart ;;
  install-autostart) cmd_install_autostart ;;
  uninstall-autostart) cmd_uninstall_autostart ;;
  open-logs) cmd_open_logs ;;
  *)
    echo "usage: $0 status|start-scrape|stop-scrape|toggle-scrape|start-autopost|stop-autopost|toggle-autopost|update|autostart|install-autostart|uninstall-autostart|open-logs" >&2
    exit 2
    ;;
esac
