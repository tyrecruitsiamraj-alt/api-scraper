import sql from 'mssql';
import { envBool, envInt, envString } from '../config.js';

/**
 * ERP intake (read-only) — ดึง "ใบขอกำลังคน" ที่ยังหาคนไม่ครบ จาก SQL Server เดิม (ST/HR).
 * ใช้ query ที่ทีมงานให้มา (โหมด staffing_queue): เฉพาะใบขอบอร์ด (request_code 005/006/013/014)
 * ที่ status='A', ยังไม่ stop, ยังแจ้งคนไม่ครบ (effective_inform_qty < request_qty), ไม่ใช่ "ทดแทน".
 *
 * ไม่มี MSSQL_HOST = ปิด feature (คืน null เงียบ ๆ) — ระบบส่วนอื่นไม่พัง.
 */
const OPEN_REQUESTS_SQL = `
DECLARE
  @deptFrom char(3)  = '_',
  @deptTo   char(3)  = 'Z',
  @siteFrom char(10) = '_',
  @siteTo   char(10) = 'Z',
  @limit    int      = 2000;

;WITH recent AS (
  SELECT TOP (@limit) A.request_no
  FROM st_request_head A
  INNER JOIN ms_site SS ON A.site_code = SS.site_code
  WHERE A.status = 'A'
    AND A.is_stop = 'N'
    AND (A.stop_no IS NULL OR RTRIM(A.stop_no) = '')
    AND ISNULL(A.is_inform_all, 'N') <> 'Y'
    AND (
      NOT EXISTS (SELECT 1 FROM st_inform_head IH WHERE IH.request_no = A.request_no)
      OR (
        CASE
          WHEN ISNULL(A.inform_qty, 0) > 0 THEN A.inform_qty
          ELSE (SELECT COUNT(*) FROM st_inform_head IH WHERE IH.request_no = A.request_no)
        END > 0
        AND CASE
          WHEN ISNULL(A.inform_qty, 0) > 0 THEN A.inform_qty
          ELSE (SELECT COUNT(*) FROM st_inform_head IH WHERE IH.request_no = A.request_no)
        END < ISNULL(NULLIF(A.request_qty, 0), 1)
      )
    )
    AND SS.department_code BETWEEN @deptFrom AND @deptTo
    AND A.site_code BETWEEN @siteFrom AND @siteTo
    AND RTRIM(A.request_code) IN ('005', '006', '013', '014')
    AND NOT EXISTS (
      SELECT 1 FROM hr_ms_job_description_1 jd
      WHERE jd.job_description_code_1 = A.job_description_code_1
        AND jd.job_description_name LIKE N'%ทดแทน%'
    )
  ORDER BY A.request_date DESC
),
base AS (
  SELECT
    A.request_no,
    A.request_date,
    A.want_date_from,
    A.site_code,
    SS.site_name,
    RTRIM(SS.department_code) AS department_code,
    A.request_qty,
    A.inform_qty,
    A.is_inform_all,
    CASE
      WHEN ISNULL(A.inform_qty, 0) > 0 THEN A.inform_qty
      ELSE (SELECT COUNT(*) FROM st_inform_head IH WHERE IH.request_no = A.request_no)
    END AS effective_inform_qty,
    (SELECT z.request_name FROM st_ms_request z WHERE z.request_code = A.request_code) AS request_name,
    (SELECT z.fname + ' ' + z.lname FROM hr_staff z WHERE z.staff_id = A.do_id) AS requester_name,
    B.work_place1 + '' + COALESCE(B.work_place2, '') + '' + COALESCE(B.work_place3, '') AS work_addr,
    ROW_NUMBER() OVER (
      PARTITION BY A.request_no
      ORDER BY CASE WHEN C.is_wage = 'Y' THEN 0 ELSE 1 END, C.payment_rate DESC
    ) AS rn
  FROM st_request_head A
  LEFT JOIN st_request_staff S ON S.request_no = A.request_no
  INNER JOIN st_request_p2 B ON A.request_no = B.request_no
  INNER JOIN st_request_p3_rate C ON B.request_no = C.request_no
  INNER JOIN ms_site SS ON A.site_code = SS.site_code
  WHERE A.request_no IN (SELECT request_no FROM recent)
)
SELECT
  request_no,
  request_date,
  want_date_from,
  site_code,
  site_name,
  department_code,
  request_qty,
  inform_qty,
  effective_inform_qty,
  (ISNULL(NULLIF(request_qty, 0), 1) - effective_inform_qty) AS remaining_qty,
  request_name,
  requester_name,
  work_addr
FROM base
WHERE rn = 1
ORDER BY request_date DESC;`;

function mssqlConfig() {
  const server = envString('MSSQL_HOST');
  if (!server) return null;
  return {
    server,
    port: envInt('MSSQL_PORT', 1433),
    user: envString('MSSQL_USER'),
    password: envString('MSSQL_PASSWORD'),
    database: envString('MSSQL_DATABASE'),
    options: {
      encrypt: envBool('MSSQL_ENCRYPT', false),
      trustServerCertificate: envBool('MSSQL_TRUST_CERT', true),
    },
    requestTimeout: envInt('MSSQL_TIMEOUT_MS', 30_000),
    pool: { max: 3, min: 0, idleTimeoutMillis: 10_000 },
  };
}

/**
 * @returns {Promise<null | Array<{request_no,request_date,want_date_from,site_code,site_name,
 *   department_code,request_qty,inform_qty,effective_inform_qty,remaining_qty,request_name,
 *   requester_name,work_addr}>>} null = ERP ปิด/ต่อไม่ได้
 */
export async function fetchOpenRequests() {
  const config = mssqlConfig();
  if (!config) return null;
  let pool = null;
  try {
    pool = new sql.ConnectionPool(config);
    await pool.connect();
    const result = await pool.request().query(OPEN_REQUESTS_SQL);
    return result.recordset ?? [];
  } catch (e) {
    console.warn(`[erp] SQL Server query failed: ${e.message}`);
    return null;
  } finally {
    if (pool) await pool.close().catch(() => {});
  }
}
