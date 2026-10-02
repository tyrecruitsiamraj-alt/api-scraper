#!/bin/bash
# ============================================================
#  SO Workers (Mac) — แผงสวิตช์ Scrap / Autopost
#  ดับเบิลคลิก = ขึ้นไดอะล็อกสวิตช์ · ไม่ค้างหน้าต่าง Terminal
# ============================================================
cd "$(dirname "$0")" || exit 1
ROOT="$PWD"

if [ ! -f "$ROOT/package.json" ]; then
  osascript -e 'display dialog "โฟลเดอร์ผิด — ต้องอยู่ที่รากโปรเจกต์ api-scraper" with title "SO Workers" buttons {"ตกลง"} default button 1 with icon stop' >/dev/null
  exit 1
fi

LIB="$ROOT/scripts/so-worker-mac-lib.sh"
PANEL="$ROOT/scripts/so-worker-switch-mac.applescript"
if [ ! -f "$LIB" ] || [ ! -f "$PANEL" ]; then
  osascript -e 'display dialog "ไม่พบสคริปต์แผงสวิตช์ — ลอง git pull ก่อน" with title "SO Workers" buttons {"ตกลง"} default button 1 with icon stop' >/dev/null
  exit 1
fi
chmod +x "$LIB" "$ROOT/SO-Workers.command" 2>/dev/null || true

# เปิดแผงนอก process ของ Terminal แล้วปิดหน้าต่าง .command
/usr/bin/osascript "$PANEL" "$LIB" >/dev/null 2>&1 &

sleep 0.35
/usr/bin/osascript >/dev/null 2>&1 <<'APPLESCRIPT' &
tell application "Terminal"
  try
    repeat with w in (get every window)
      try
        set wname to name of w as text
        if wname contains "SO-Workers" or wname contains "SO Workers" then
          close w saving no
        end if
      end try
    end repeat
  end try
end tell
APPLESCRIPT

exit 0
