/**
 * สรุปสาเหตุจาก output ของ Playwright ตอนงานโพสต์/ตรวจความพร้อมล้มเหลว
 *
 * เดิมเก็บแค่ 12 บรรทัดท้าย ซึ่งเป็นสรุปของ Playwright ("1 failed", ที่อยู่ trace.zip)
 * บรรทัด Error จริงอยู่ก่อนหน้านั้นจึงหลุด หน้าเว็บเลยบอกได้แค่ "exit code 1"
 * ตอนนี้ดึงข้อความ Error ของเทสต์ + บรรทัดสุดท้ายที่บอทพิมพ์ก่อนพัง (บอกว่าพังที่ขั้นไหน)
 */

const ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;
/** บรรทัด Error ในรายงานความล้มเหลวของ Playwright เช่น "    Error: ..." / "TimeoutError: page.goto: Timeout ..." */
const ERROR_LINE_RE = /^\s*(?:[A-Za-z]*Error|Error)(?:\s*\[[^\]]*\])?:\s*(.+)$/;
const TEST_TIMEOUT_RE = /Test timeout of (\d+)ms exceeded/;
/** หัวรายงานความล้มเหลว เช่น "  1) [GoogleChrome] › tests\postAll.spec.ts:45:5 › ..." */
const FAILURE_HEADER_RE = /^\s*\d+\)\s+\[[^\]]+\]\s+›/;
/** บรรทัดของ reporter ที่ไม่ได้บอกว่าบอททำอะไรอยู่ */
const REPORTER_LINE_RE = /^\s*(?:Running \d+ tests?|\[\d+\/\d+\]|\d+ (?:failed|passed|flaky|skipped)|─{5,}|Slow test file|Consider running|npx playwright|Usage:|attachment #|test-results[\\/])/;

function cleanLines(text) {
  return String(text || '')
    .replace(ANSI_RE, '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''));
}

/**
 * @param {string} output ข้อความ stdout+stderr ช่วงท้ายของ Playwright
 * @returns {{ reason: string|null, lastSteps: string[] }}
 */
function extractFailure(output) {
  const lines = cleanLines(output);
  const headerAt = lines.findIndex((line) => FAILURE_HEADER_RE.test(line));
  const report = headerAt >= 0 ? lines.slice(headerAt) : lines;

  let reason = null;
  for (const line of report) {
    const m = ERROR_LINE_RE.exec(line);
    if (m && m[1].trim()) {
      reason = m[1].trim();
      break;
    }
  }
  if (!reason) {
    const t = lines.map((line) => TEST_TIMEOUT_RE.exec(line)).find(Boolean);
    if (t) reason = `หมดเวลาของรอบ (${Math.round(Number(t[1]) / 60000)} นาที)`;
  }

  const before = headerAt >= 0 ? lines.slice(0, headerAt) : lines;
  const lastSteps = before
    .map((line) => line.trim())
    .filter((line) => line && !REPORTER_LINE_RE.test(line) && !FAILURE_HEADER_RE.test(line))
    .slice(-3)
    .map((line) => line.slice(0, 300));

  return { reason: reason ? reason.slice(0, 500) : null, lastSteps };
}

/**
 * ข้อความ error ที่เก็บลง post_run_queue.error (หน้างานโพสต์แสดงข้อความนี้)
 * @param {number|null} code exit code
 * @param {string} output
 */
function describeWorkerFailure(code, output) {
  const { reason, lastSteps } = extractFailure(output);
  const head = reason || `เครื่องหยุดทำงานกลางคัน (exit code ${code})`;
  const steps = lastSteps.length ? `\nขั้นสุดท้ายก่อนหยุด:\n${lastSteps.join('\n')}` : '';
  if (reason) return `${head}${steps}`;
  // ไม่เจอบรรทัด Error — เก็บท้าย output แบบเดิมไว้ให้ไล่ต่อ
  const tail = cleanLines(output).filter(Boolean).slice(-12).join('\n');
  return `${head}${steps}${tail ? `\n\n${tail}` : ''}`;
}

module.exports = { extractFailure, describeWorkerFailure };
