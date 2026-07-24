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
    ( cd autopost && nohup npm run worker:post > "../$RUN/autopost.log" 2>&1 & echo $! > "../$RUN/autopost.pid" )
    printf "  ${G}✓ เปิด autopost (โพสต์ FB) pid %s${N}\n" "$(cat "$RUN/autopost.pid")"
  fi

  # กันเครื่องหลับตราบใดที่ scraper ยังวิ่ง
  if ! running caffeinate; then
    caffeinate -is -w "$(cat "$RUN/scraper.pid")" > /dev/null 2>&1 &
    echo $! > "$RUN/caffeinate.pid"
  fi
  printf "  ${D}(กันเครื่องหลับให้แล้ว · ปิดหน้าต่างนี้ได้ worker ยังวิ่งต่อ)${N}\n"
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
}

refresh_workers() {
  printf "\n${B}↻ รีเฟรช worker (รับโค้ดใหม่)${N}\n"
  stop_workers
  sleep 2
  start_workers
}

# ---------- งานประจำ (เงียบ + สรุป) ----------
run_quiet() {
  local title="$1"; shift
  local log="$LOGT/$(date +%Y%m%d-%H%M%S)-$(printf '%s' "$title" | tr ' /' '__').log"
  printf "\n${B}▶ %s${N} ${D}— กำลังทำ...${N}\n" "$title"
  local s; s=$(date +%s)
  "$@" > "$log" 2>&1
  local code=$?; local dur=$(( $(date +%s) - s ))
  if [ $code -eq 0 ]; then
    printf "  ${G}✓ สำเร็จ${N} ${D}(%ss)${N}\n" "$dur"
    tail -n 3 "$log" | sed "s/^/    ${D}/;s/\$/${N}/"
  else
    printf "  ${R}✗ ล้มเหลว (exit %s, %ss)${N}\n" "$code" "$dur"
    grep -iE 'error|fail|ล้ม|ไม่สำเร็จ|exception|ECONN|ENOTFOUND|EHOSTUNREACH|throw|checkpoint|login' "$log" | tail -n 10 | sed "s/^/    /"
  fi
  printf "    ${D}log: %s${N}\n" "$log"
}

tasks_menu() {
  printf "\n${B}งานประจำ (เป็นครั้งคราว)${N}\n"
  echo "  1) สำรวจเทรนด์จากกลุ่ม   2) SEO คำค้น   3) ช่วงเวลาโพสต์"
  echo "  4) อัปเดตฐานข้อมูล        5) บันทึกกลุ่มสำรวจ   A) รันทั้งหมด(1-3)   ว่าง=กลับ"
  printf "เลือก: "; read -r t
  case "$t" in
    1) run_quiet "สำรวจเทรนด์" node scripts/trend-discover.mjs ;;
    2) run_quiet "SEO คำค้น" node scripts/seo-update.mjs ;;
    3) run_quiet "ช่วงเวลาโพสต์" node scripts/best-time-update.mjs ;;
    4) run_quiet "อัปเดตฐานข้อมูล" npm run migrate ;;
    5) run_quiet "บันทึกกลุ่ม" node scripts/seed-research-groups.mjs ;;
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

# ---------- loop ----------
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
