/**
 * สร้าง Caption + รูปจากงาน ERP หนึ่งงานเพื่อ Preview เท่านั้น
 * ไม่อนุมัติ ไม่สร้าง campaign_posts และไม่ส่งคิวเผยแพร่ Facebook
 *
 * Usage: node scripts/run-content-preview.mjs LMM6705007
 */
import { closePool, query } from '../src/db/pool.js';
import { generateDraftForCampaign } from '../src/core/orchestrator-draft.js';

const requestNo = String(process.argv[2] || '').trim();
if (!requestNo) throw new Error('กรุณาระบุเลขใบขอ เช่น LMM6705007');

try {
  const { rows } = await query(
    `SELECT * FROM recruit_campaigns WHERE request_no=$1 ORDER BY updated_at DESC LIMIT 1`,
    [requestNo],
  );
  const campaign = rows[0];
  if (!campaign) throw new Error(`ไม่พบงาน ${requestNo}`);

  const active = await query(
    `SELECT id, status FROM work_queue
      WHERE ref_id=$1 AND type='draft' AND status IN ('queued','running')
      ORDER BY created_at DESC LIMIT 1`,
    [campaign.id],
  ).then((result) => result.rows[0]).catch(() => null);
  if (active) throw new Error(`งานนี้มีคิวสร้างร่างที่กำลังทำอยู่ (${active.status}) จึงไม่รันซ้ำ`);

  console.log(`▶ Preview ${requestNo}: ${campaign.title || 'ไม่ระบุตำแหน่ง'}`);
  const result = await generateDraftForCampaign(campaign.id, { researchMode: 'preview' });
  const contents = await query(
    `SELECT id, version, caption, quality_status, quality_score,
            OCTET_LENGTH(image_bytes) AS image_bytes,
            gen_notes->>'generation_mode' AS generation_mode
       FROM campaign_contents
      WHERE campaign_id=$1
      ORDER BY version DESC LIMIT 2`,
    [campaign.id],
  );
  console.log(JSON.stringify({ result, contents: contents.rows }, null, 2));
} finally {
  await closePool();
}
