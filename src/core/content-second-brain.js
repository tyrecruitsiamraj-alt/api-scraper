const DAY_PARTS = [
  [5, 10, 'เช้า 05:00-09:59'],
  [10, 14, 'สาย-เที่ยง 10:00-13:59'],
  [14, 18, 'บ่าย 14:00-17:59'],
  [18, 22, 'เย็น 18:00-21:59'],
];

export function postingSlot(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok', weekday: 'short', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === 'weekday')?.value || '';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const part = DAY_PARTS.find(([from, to]) => hour >= from && hour < to)?.[2] || 'กลางคืน 22:00-04:59';
  return `${weekday} ${part}`;
}

export function learningFeatures({ generationNotes, postedAt }) {
  const notes = generationNotes && typeof generationNotes === 'object' ? generationNotes : {};
  return {
    captionStyle: String(notes.style || '').trim() || null,
    imageStyle: String(notes.imageStyle || '').trim() || null,
    postingSlot: postingSlot(postedAt),
  };
}

export function patternDecision(stat, { highScore = 5, minCampaigns = 3 } = {}) {
  const campaigns = Number(stat?.campaign_count || stat?.campaignCount || 0);
  const score = Number(stat?.avg_engagement_score || stat?.avgScore || 0);
  if (campaigns < minCampaigns) return 'collecting';
  return score >= highScore ? 'preferred' : 'avoid';
}

const TYPE_LABEL = {
  caption_style: 'แนวข้อความ',
  image_style: 'สไตล์ภาพ',
  posting_slot: 'ช่วงเวลาโพสต์',
  facebook_group: 'กลุ่ม Facebook',
  facebook_account: 'บัญชี Facebook',
};

export function formatPerformanceInsight(stat, decision) {
  const label = TYPE_LABEL[stat.pattern_type] || stat.pattern_type;
  const score = Number(stat.avg_engagement_score || 0).toFixed(2);
  const evidence = `${stat.campaign_count} แคมเปญ / ${stat.post_count} โพสต์`;
  const direction = decision === 'preferred' ? 'ใช้เป็นแนวทาง' : 'ควรหลีกเลี่ยง';
  return `${direction}: ${label} “${stat.pattern_value}” (คะแนนเฉลี่ย ${score}, หลักฐาน ${evidence})`;
}
