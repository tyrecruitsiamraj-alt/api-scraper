/**
 * บันทึก Post Log ลง Database (รูปแบบ Log File)
 * วันที่-เวลา | ผู้โพสต์ | เจ้าของงาน | ชื่องาน | หน่วยงาน | ชื่อกลุ่ม | จำนวนสมาชิก | ลิงก์โพสต์ | สถานะ | จำนวน Comment | เบอร์โทรลูกค้า
 */

export interface PostLogData {
  poster_name: string;
  owner: string;
  job_title: string;
  company: string;
  group_name: string;
  member_count: string;
  post_link: string;
  post_status: string;
  comment_count?: number;
  customer_phone?: string;
  assignment_id?: string;
  user_id?: string;
  job_id?: string;
  group_id?: string;
}

/**
 * เขียนตรงลง Postgres (มี DATABASE_URL) ก่อน แล้วค่อย fallback ไป /api/post-logs พร้อม worker token
 * logic อยู่ที่ server/post-log-writer.js (CJS) เพื่อให้เทสต์ด้วย node --test ได้
 */
export async function postLog(data: PostLogData): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writePostLog } = require('../../server/post-log-writer');
    await writePostLog(data);
  } catch (e) {
    console.warn('[postLog] บันทึก post_logs ไม่สำเร็จ:', (e as Error).message || String(e));
  }
}
