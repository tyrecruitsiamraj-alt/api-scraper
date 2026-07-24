#!/bin/bash
# SO Recruitment — แผงงานประจำ (ดับเบิลคลิกเปิด)
# รันงานทีละอย่างในหน้าต่างเดียว แล้วสรุปสั้น ๆ ว่าสำเร็จไหม/error อะไร
# log เต็มเก็บไว้ที่ logs/tasks/ (ไว้ดูตอนต้องแก้) — ไม่รก terminal
#
# หมายเหตุ: นี่คือ "งานเป็นครั้งคราว" (migrate/สำรวจเทรนด์/SEO/best-time)
#           ส่วน worker 24 ชม. (scrape+โพสต์) ยังเปิดด้วย start-mac.command แยกเหมือนเดิม
cd "$(dirname "$0")" || exit 1

LOGDIR="logs/tasks"
mkdir -p "$LOGDIR"

G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[0;33m'; B=$'\033[1m'; D=$'\033[2m'; N=$'\033[0m'

NAMES=(); RESULTS=()

run_quiet() {
  local title="$1"; shift
  local safe; safe=$(printf '%s' "$title" | tr ' /' '__')
  local log="$LOGDIR/$(date +%Y%m%d-%H%M%S)-$safe.log"
  printf "\n${B}▶ %s${N} ${D}— กำลังทำ...${N}\n" "$title"
  local start; start=$(date +%s)
  "$@" >"$log" 2>&1
  local code=$?
  local dur=$(( $(date +%s) - start ))
  if [ $code -eq 0 ]; then
    printf "  ${G}✓ สำเร็จ${N} ${D}(%ss)${N}\n" "$dur"
    tail -n 3 "$log" | sed "s/^/    ${D}/;s/\$/${N}/"
    NAMES+=("$title"); RESULTS+=("ok")
  else
    printf "  ${R}✗ ล้มเหลว (exit %s)${N} ${D}(%ss)${N}\n" "$code" "$dur"
    printf "  ${Y}บรรทัดที่น่าจะเป็นสาเหตุ:${N}\n"
    if grep -iE 'error|fail|ล้ม|ไม่สำเร็จ|exception|ECONN|ENOTFOUND|EHOSTUNREACH|throw|checkpoint|login' "$log" >/dev/null 2>&1; then
      grep -iE 'error|fail|ล้ม|ไม่สำเร็จ|exception|ECONN|ENOTFOUND|EHOSTUNREACH|throw|checkpoint|login' "$log" | tail -n 12 | sed "s/^/    /"
    else
      tail -n 8 "$log" | sed "s/^/    /"
    fi
    NAMES+=("$title"); RESULTS+=("fail:$code")
  fi
  printf "    ${D}log เต็ม: %s${N}\n" "$log"
}

summary() {
  printf "\n${B}══════════ สรุป ══════════${N}\n"
  local i=0 okc=0 failc=0
  for n in "${NAMES[@]}"; do
    if [ "${RESULTS[$i]}" = "ok" ]; then
      printf "  ${G}✓${N} %s\n" "$n"; okc=$((okc+1))
    else
      printf "  ${R}✗${N} %s ${D}(${RESULTS[$i]})${N}\n" "$n"; failc=$((failc+1))
    fi
    i=$((i+1))
  done
  printf "\n  รวม: ${G}สำเร็จ %s${N}"  "$okc"
  [ $failc -gt 0 ] && printf " · ${R}ล้มเหลว %s${N}" "$failc"
  printf "\n"
  [ $failc -gt 0 ] && printf "  ${Y}มีงานล้มเหลว — เปิด log เต็มด้านบนดูสาเหตุ แล้วบอก Claude ได้เลย${N}\n"
}

menu() {
  clear
  NAMES=(); RESULTS=()
  printf "${B}SO Recruitment · แผงงานประจำ${N}\n"
  printf "${D}เลือกเลข แล้วกด Enter — ผลลัพธ์สรุปสั้น ๆ · log เต็มเก็บที่ logs/tasks/${N}\n\n"
  echo "  1) สำรวจเทรนด์จากกลุ่ม FB   (trend-discover)"
  echo "  2) อัปเดตคำค้น SEO           (seo-update)"
  echo "  3) อัปเดตช่วงเวลาโพสต์       (best-time)"
  echo "  4) อัปเดตฐานข้อมูล           (migrate)"
  echo "  5) บันทึกกลุ่มสำรวจ          (seed groups)"
  echo ""
  printf "  ${B}A) รันงานประจำสัปดาห์ทั้งหมด${N}  (1 + 2 + 3)\n"
  echo "  0) ออก"
  echo ""
  printf "เลือก: "
  read -r choice
  case "$choice" in
    1) run_quiet "สำรวจเทรนด์จากกลุ่ม" node scripts/trend-discover.mjs ;;
    2) run_quiet "อัปเดตคำค้น SEO" node scripts/seo-update.mjs ;;
    3) run_quiet "อัปเดตช่วงเวลาโพสต์" node scripts/best-time-update.mjs ;;
    4) run_quiet "อัปเดตฐานข้อมูล" npm run migrate ;;
    5) run_quiet "บันทึกกลุ่มสำรวจ" node scripts/seed-research-groups.mjs ;;
    A|a)
      run_quiet "สำรวจเทรนด์จากกลุ่ม" node scripts/trend-discover.mjs
      run_quiet "อัปเดตคำค้น SEO" node scripts/seo-update.mjs
      run_quiet "อัปเดตช่วงเวลาโพสต์" node scripts/best-time-update.mjs
      ;;
    0) exit 0 ;;
    *) printf "${Y}ไม่รู้จักตัวเลือก \"%s\"${N}\n" "$choice" ;;
  esac
  [ ${#NAMES[@]} -gt 0 ] && summary
  printf "\n${D}กด Enter เพื่อกลับเมนู...${N}"
  read -r _
  menu
}

menu
