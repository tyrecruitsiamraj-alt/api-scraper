#!/bin/bash
# SO Recruitment — แผงควบคุมหน้าเดียว (Mac)
# เปิด/รีเฟรช/หยุด worker + ดูสถานะ + รันงานประจำ ในหน้าต่างเดียว
# worker วิ่งเป็น background (nohup) → ปิดหน้าต่างนี้ได้ worker ยังทำงานต่อ
cd "$(dirname "$0")" || exit 1

RUN=".run"; LOGT="logs/tasks"
mkdir -p "$RUN" "$LOGT"
G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[0;33m'; B=$'\033[1m'; D=$'\033[2m'; C=$'\033[0;36m'; N=$'\033[0m'

# ---------- worker (background) ----------
running() { local f="$RUN/$1.pid"; [ -f "$f" ] && kill -0 "$(cat "$f" 2>/dev/null)" 2>/dev/null; }

start_workers() {
  printf "\n${B}▶ ดึงโค้ดล่าสุด (git pull)...${N}\n"
  git pull 2>&1 | tail -n 3 | sed "s/^/  /"

  if running scraper; then
    printf "  ${D}scraper ทำงานอยู่แล้ว (pid %s)${N}\n" "$(cat "$RUN/scraper.pid")"
  else
    nohup npm run scraper:pool > "$RUN/scraper.log" 2>&1 &
    echo $! > "$RUN/scraper.pid"
    printf "  ${G}✓ เปิด scraper (scrape + คิด content) pid %s${N}\n" "$!"
  fi

  if running autopost; then
    printf "  ${D}autopost ทำงานอยู่แล้ว (pid %s)${N}\n" "$(cat "$RUN/autopost.pid")"
  else
    # cwd ต้องเป็น autopost (มันอ่าน .env/.auth ที่นั่น) — ใช้ nohup bash -c + exec ให้ pid ตรงตัว npm
    nohup bash -c 'cd autopost && exec npm run worker:post' > "$RUN/autopost.log" 2>&1 &
    echo $! > "$RUN/autopost.pid"
    printf "  ${G}✓ เปิด autopost (โพสต์ FB) pid %s${N}\n" "$(cat "$RUN/autopost.pid" 2>/dev/null)"
  fi

  # กันเครื่องหลับตราบใดที่ scraper ยังวิ่ง
  if ! running caffeinate; then
    caffeinate -is -w "$(cat "$RUN/scraper.pid")" > /dev/null 2>&1 &
    echo $! > "$RUN/caffeinate.pid"
  fi
  printf "  ${D}(กันเครื่องหลับให้แล้ว · ปิดหน้าต่างนี้ได้ worker ยังวิ่งต่อ)${N}\n"
  # งานประจำสัปดาห์ (เทรนด์/SEO/เวลาโพสต์) ตั้ง cron ให้อัตโนมัติ — ไม่ต้องกดตั้งเอง
  install_cron quiet || true
}

stop_workers() {
  printf "\n${B}■ หยุด worker...${N}\n"
  for name in scraper autopost caffeinate; do
    local f="$RUN/$name.pid"
    if [ -f "$f" ]; then
      local pid; pid=$(cat "$f" 2>/dev/null)
      pkill -TERM -P "$pid" 2>/dev/null
      kill -TERM "$pid" 2>/dev/null
      rm -f "$f"
      printf "  ${Y}หยุด %s${N}\n" "$name"
    fi
  done
  # เก็บกวาด worker ที่หลุด track (เช่นจากรอบที่ pid ไม่ถูกบันทึก)
  pkill -f "scraper-pool.mjs" 2>/dev/null && printf "  ${D}เก็บกวาด scraper ที่ค้าง${N}\n"
  pkill -f "worker:post" 2>/dev/null && printf "  ${D}เก็บกวาด autopost ที่ค้าง${N}\n"
  return 0
}

refresh_workers() {
  printf "\n${B}↻ รีเฟรช worker (รับโค้ดใหม่)${N}\n"
  stop_workers
  sleep 2
  start_workers
}

# ---------- ตั้งเวลารันอัตโนมัติ (cron จันทร์) — แทน setup-seo-cron.command ----------
install_cron() {
  local quiet="${1:-}"
  [ -z "$quiet" ] && printf "\n${B}▶ ตั้งเวลารันอัตโนมัติ (ทุกวันจันทร์)...${N}\n"
  local NODE; NODE="$(command -v node || true)"
  if [ -z "$NODE" ]; then [ -z "$quiet" ] && printf "  ${R}✗ ไม่พบ node ใน PATH${N}\n"; return 1; fi
  mkdir -p output
  local ROOT; ROOT="$(pwd)"
  local L1="30 8 * * 1 cd $ROOT && $NODE scripts/seo-update.mjs >> $ROOT/output/seo-update.log 2>&1"
  local L2="45 8 * * 1 cd $ROOT && $NODE scripts/best-time-update.mjs >> $ROOT/output/best-time.log 2>&1"
  # cron ไม่มีจอ → trend-discover บังคับ headless; ถ้า FB บล็อกค่อยรันมือ (ปุ่ม ⚡ = headful)
  local L3="0 9 * * 1 cd $ROOT && TREND_HEADLESS=1 $NODE scripts/trend-discover.mjs >> $ROOT/output/trend-discover.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v 'seo-update.mjs' | grep -v 'best-time-update.mjs' | grep -v 'trend-discover.mjs' ; echo "$L1"; echo "$L2"; echo "$L3" ) | crontab - 2>/dev/null
  if [ -z "$quiet" ]; then
    printf "  ${G}✓ ตั้งแล้ว (จันทร์): SEO 08:30 · ช่วงเวลาโพสต์ 08:45 · สำรวจเทรนด์ 09:00${N}\n"
    printf "  ${D}log อยู่ที่ output/*.log · ตั้งซ้ำได้ ไม่ซ้ำซ้อน${N}\n"
  fi
}

# ---------- งานประจำ (เงียบ + สรุป) ----------
TASK_OK=0; TASK_FAIL=0
run_quiet() {
  local title="$1"; shift
  local log="$LOGT/$(date +%Y%m%d-%H%M%S)-$(printf '%s' "$title" | tr ' /' '__').log"
  printf "\n${B}▶ %s${N} ${D}— กำลังทำ...${N}\n" "$title"
  local s; s=$(date +%s)
  "$@" > "$log" 2>&1
  local code=$?; local dur=$(( $(date +%s) - s ))
  if [ $code -eq 0 ]; then
    TASK_OK=$((TASK_OK+1))
    printf "  ${G}✓ สำเร็จ${N} ${D}(%ss)${N}\n" "$dur"
    tail -n 3 "$log" | sed "s/^/    ${D}/;s/\$/${N}/"
  else
    TASK_FAIL=$((TASK_FAIL+1))
    printf "  ${R}✗ ล้มเหลว (exit %s, %ss)${N}\n" "$code" "$dur"
    grep -iE 'error|fail|ล้ม|ไม่สำเร็จ|exception|ECONN|ENOTFOUND|EHOSTUNREACH|throw|checkpoint|login' "$log" | tail -n 10 | sed "s/^/    /"
  fi
  printf "    ${D}log: %s${N}\n" "$log"
}

tasks_menu() {
  printf "\n${B}งานประจำ (เป็นครั้งคราว)${N}\n"
  echo "  1) สำรวจเทรนด์จากกลุ่ม   2) SEO คำค้น   3) ช่วงเวลาโพสต์"
  echo "  4) อัปเดตฐานข้อมูล        5) บันทึกกลุ่มสำรวจ   A) รันทั้งหมด(1-3)"
  echo "  6) ตั้งเวลารันอัตโนมัติ (cron ทุกจันทร์: 1+2+3)   ว่าง=กลับ"
  printf "เลือก: "; read -r t
  case "$t" in
    1) run_quiet "สำรวจเทรนด์" node scripts/trend-discover.mjs ;;
    2) run_quiet "SEO คำค้น" node scripts/seo-update.mjs ;;
    3) run_quiet "ช่วงเวลาโพสต์" node scripts/best-time-update.mjs ;;
    4) run_quiet "อัปเดตฐานข้อมูล" npm run migrate ;;
    5) run_quiet "บันทึกกลุ่ม" node scripts/seed-research-groups.mjs ;;
    6) install_cron ;;
    A|a) run_quiet "สำรวจเทรนด์" node scripts/trend-discover.mjs
         run_quiet "SEO คำค้น" node scripts/seo-update.mjs
         run_quiet "ช่วงเวลาโพสต์" node scripts/best-time-update.mjs ;;
    *) return ;;
  esac
  printf "\n${D}กด Enter...${N}"; read -r _
}

status_line() {
  local name="$1" label="$2"
  if running "$name"; then
    local pid; pid=$(cat "$RUN/$name.pid")
    local last; last=$(tail -n 1 "$RUN/$name.log" 2>/dev/null | cut -c1-54)
    printf "  ${G}● ทำงาน${N}  %-26s ${D}pid %s · %s${N}\n" "$label" "$pid" "$last"
  else
    printf "  ${R}○ หยุด ${N}  %-26s ${D}(กด S เพื่อเริ่ม)${N}\n" "$label"
  fi
}

dashboard() {
  clear
  printf "${B}SO Recruitment · แผงควบคุม (Mac)${N}\n"
  printf "${D}โค้ดปัจจุบัน: %s${N}\n\n" "$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-50)"
  printf "${B}สถานะ worker${N}\n"
  status_line scraper  "scrape + คิด content"
  status_line autopost "โพสต์ Facebook"
  printf "\n${B}คำสั่ง${N}\n"
  printf "  ${C}S${N}) เริ่มทำงาน (pull + เปิด worker)     ${C}R${N}) รีเฟรช (มีโค้ดใหม่ → หยุด+pull+เปิด)\n"
  printf "  ${C}X${N}) หยุด worker                          ${C}T${N}) งานประจำ (สำรวจเทรนด์/SEO/best-time)\n"
  printf "  ${C}L${N}) ดู log สด (Ctrl-C กลับ)             ${C}Q${N}) ออก (worker วิ่งต่อเบื้องหลัง)\n\n"
  printf "เลือก: "
}

# ---------- โหมดปุ่มคลิก (macOS dialog — คลิกแล้วทำงาน ไม่ต้องพิมพ์) ----------
BTN_START="▶ เริ่มทำงาน"
BTN_REFRESH="↻ รีเฟรช (รับโค้ดใหม่)"
BTN_STOP="■ หยุด worker"
BTN_RUNNOW="⚡ สำรวจเทรนด์ + SEO ตอนนี้"
BTN_CLOSE="✕ ปิดแผง (worker วิ่งต่อ)"

have_gui() { command -v osascript >/dev/null 2>&1 && [ -z "$SO_CONTROL_TUI" ]; }

gui_msg() {
  osascript -e 'on run argv' \
    -e 'display dialog (item 1 of argv) with title "SO Recruitment" buttons {"ตกลง"} default button 1 with icon note' \
    -e 'end run' "$1" >/dev/null 2>&1
}

gui_note() { osascript -e "display notification \"$1\" with title \"SO Recruitment\"" >/dev/null 2>&1; }

gui_pick() {
  osascript -e 'on run argv' \
    -e "set c to choose from list {\"$BTN_START\", \"$BTN_REFRESH\", \"$BTN_STOP\", \"$BTN_RUNNOW\"} with title \"SO Recruitment · แผงควบคุม\" with prompt (item 1 of argv) default items {\"$BTN_START\"} OK button name \"ทำเลย\" cancel button name \"ปิดแผง\"" \
    -e 'if c is false then return "ปิด"' \
    -e 'return item 1 of c' \
    -e 'end run' "$1" 2>/dev/null
}

gui_status_text() {
  local s1 s2
  if running scraper; then s1="🟢 ดึงข้อมูล + คิดคอนเทนต์ — ทำงานอยู่"; else s1="🔴 ดึงข้อมูล + คิดคอนเทนต์ — หยุด"; fi
  if running autopost; then s2="🟢 โพสต์ Facebook — ทำงานอยู่"; else s2="🔴 โพสต์ Facebook — หยุด"; fi
  printf '%s\n%s\n\nงานประจำ (เทรนด์/SEO/เวลาโพสต์) ทำเองทุกจันทร์เช้า — ไม่ต้องกด\n\nเลือกแล้วกด "ทำเลย":' "$s1" "$s2"
}

gui_loop() {
  # เปิดแผง = ตั้งงานประจำอัตโนมัติให้เลย (เงียบ ๆ)
  install_cron quiet || true
  while true; do
    local choice; choice="$(gui_pick "$(gui_status_text)")"
    case "$choice" in
      "$BTN_START")
        start_workers
        gui_msg "เริ่มทำงานแล้ว ✓

• ดึงข้อมูล + คิดคอนเทนต์
• โพสต์ Facebook
• งานประจำสัปดาห์ ตั้งเวลาอัตโนมัติแล้ว

ปิดหน้าต่างได้เลย — worker วิ่งต่อเอง" ;;
      "$BTN_REFRESH")
        refresh_workers
        gui_msg "รีเฟรชเสร็จ ✓ ใช้โค้ดล่าสุด:
$(git log -1 --format='%h %s' 2>/dev/null | cut -c1-70)" ;;
      "$BTN_STOP")
        stop_workers
        gui_msg "หยุด worker แล้ว — กดเริ่มทำงานเมื่อพร้อม" ;;
      "$BTN_RUNNOW")
        gui_note "กำลังรัน 3 งาน (~5-10 นาที) — ดูความคืบหน้าใน Terminal"
        TASK_OK=0; TASK_FAIL=0
        run_quiet "สำรวจเทรนด์" node scripts/trend-discover.mjs
        run_quiet "SEO คำค้น" node scripts/seo-update.mjs
        run_quiet "ช่วงเวลาโพสต์" node scripts/best-time-update.mjs
        if [ "$TASK_FAIL" -eq 0 ]; then
          gui_msg "งานประจำเสร็จ ✓ สำเร็จ $TASK_OK/3

เทรนด์ใหม่ (ถ้ามี) รออนุมัติที่เว็บ → ตั้งค่า → เทรนด์คอนเทนต์"
        else
          gui_msg "งานประจำเสร็จ: สำเร็จ $TASK_OK · ล้มเหลว $TASK_FAIL

ดูรายละเอียดในหน้าต่าง Terminal (log: logs/tasks/)"
        fi ;;
      *) # ปิดแผง / กด cancel — worker วิ่งต่อ
        printf "\n${D}ปิดแผงแล้ว — worker ยังทำงานเบื้องหลัง (เปิดใหม่เมื่อไรก็ได้)${N}\n"
        exit 0 ;;
    esac
  done
}

# ---------- entry: มี GUI = โหมดปุ่มคลิก / ไม่มีหรือ SO_CONTROL_TUI=1 = โหมดพิมพ์ ----------
if have_gui; then
  printf "${B}SO Recruitment · แผงควบคุม${N}\n${D}โหมดปุ่มคลิก — หน้าต่างเลือกคำสั่งจะเด้งขึ้นมา (log งานโชว์ที่นี่)${N}\n"
  gui_loop
fi

# ---------- loop (โหมดพิมพ์ fallback) ----------
install_cron quiet || true
while true; do
  dashboard
  read -r cmd
  case "$cmd" in
    S|s) start_workers; printf "\n${D}กด Enter...${N}"; read -r _ ;;
    R|r) refresh_workers; printf "\n${D}กด Enter...${N}"; read -r _ ;;
    X|x) stop_workers; printf "\n${D}กด Enter...${N}"; read -r _ ;;
    T|t) tasks_menu ;;
    L|l) printf "${D}(Ctrl-C เพื่อกลับแผง)${N}\n"; tail -n 20 -f "$RUN/scraper.log" "$RUN/autopost.log" 2>/dev/null || true ;;
    Q|q) printf "\n${D}ออกแล้ว — worker ยังทำงานเบื้องหลัง (เปิดแผงใหม่มาดู/หยุดได้)${N}\n"; exit 0 ;;
    *) : ;;
  esac
done
