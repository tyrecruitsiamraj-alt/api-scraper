/**
 * Turn an operational failure into a short, repeatable prevention rule.
 * Deliberately excludes credentials, Facebook content and applicant data.
 */
function classifyPostFailure({ mode, requestedBy, workerBuildSha, error } = {}) {
  const raw = String(error || 'ไม่ทราบสาเหตุ').toLowerCase();
  const safeMode = String(mode || 'post');
  const automatic = String(requestedBy || '') === 'auto-daily';

  if (safeMode === 'preflight' && /nologin|__user=0|session|checkpoint|login/.test(raw)) {
    return {
      key: 'facebook:preflight-session-not-established',
      category: 'facebook_session',
      lesson: 'Session Facebook ยังไม่พร้อม จึงต้องยืนยันตัวตนบนเครื่อง Worker ก่อน',
      prevention: 'ห้ามส่งโพสต์จริงจนกว่า Preflight ของบัญชีเดียวกันจะผ่านภายใน 24 ชั่วโมง',
    };
  }
  if (/worker_post_job_max_ms|timeout|timed out/.test(raw)) {
    return {
      key: `facebook:${safeMode}:worker-timeout`,
      category: 'worker_timeout',
      lesson: 'Worker ใช้เวลานานเกินขอบเขตที่ปลอดภัยและถูกหยุดเพื่อปลด lock',
      prevention: 'พักบัญชีและให้ตรวจ Session/หน้า Facebook ก่อน retry; ห้ามวน retry อัตโนมัติ',
    };
  }
  if (automatic && !String(workerBuildSha || '').trim()) {
    return {
      key: 'facebook:auto-daily:unverified-legacy-worker',
      category: 'version_contract',
      lesson: 'Auto Daily เคยถูก Worker เก่าที่ไม่มี Build Contract รับงาน',
      prevention: 'ใช้ Worker ที่ Pin กับบัญชีและมี Build Contract เท่านั้น; Auto Daily ต้องเปิดโดยผู้รับผิดชอบ',
    };
  }
  return {
    key: `facebook:${safeMode}:unclassified-worker-failure`,
    category: 'unclassified',
    lesson: 'Worker Facebook ล้มเหลวโดยยังไม่จัดหมวดสาเหตุ',
    prevention: 'พักการ retry อัตโนมัติ เก็บหลักฐาน และวิเคราะห์ Root Cause ก่อนส่งงานเดิมซ้ำ',
  };
}

module.exports = { classifyPostFailure };
