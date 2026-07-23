'use client';

import { useState } from 'react';
import type { LeadPostRow } from '@/lib/repo';

/** แยกสตริง customer_phone (คั่น ', ') เป็นเบอร์ที่ไม่ซ้ำ */
function splitPhones(raw: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const p = part.trim();
    if (!p) continue;
    const key = p.replace(/\D/g, '');
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    out.push(p);
  }
  return out;
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days} วันก่อน`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours >= 1) return `${hours} ชม.ก่อน`;
  const mins = Math.floor(diff / 60_000);
  return mins >= 1 ? `${mins} นาทีก่อน` : 'เมื่อครู่';
}

// --- Lead Responder: ร่างข้อความทักกลับตามตำแหน่ง (แก้ได้ก่อนส่ง) ---
type Tone = 'formal' | 'casual' | 'screen';
const TONES: { key: Tone; label: string }[] = [
  { key: 'formal', label: 'สุภาพทางการ' },
  { key: 'casual', label: 'เป็นกันเอง' },
  { key: 'screen', label: 'คัดกรอง' },
];

function draftMessage(tone: Tone, position: string | null): string {
  const pos = (position && position.trim()) || 'ตำแหน่งที่ประกาศ';
  switch (tone) {
    case 'formal':
      return `สวัสดีค่ะ ทาง SO Recruitment ติดต่อกลับจากที่คุณสนใจตำแหน่ง "${pos}" ที่เราประกาศรับสมัครไว้ค่ะ ไม่ทราบว่ายังสนใจอยู่ไหมคะ? หากสนใจ รบกวนส่งประวัติ/เรซูเม่ หรือแจ้งชื่อ-นามสกุล อายุ และวุฒิการศึกษา เพื่อนัดสัมภาษณ์ในขั้นต่อไปค่ะ ขอบคุณค่ะ 🙏`;
    case 'casual':
      return `สวัสดีครับ 😊 เห็นว่าสนใจงาน "${pos}" ที่โพสต์ไว้ ยังหางานอยู่ไหมครับ? ถ้าสนใจทักกลับมาได้เลยครับ เดี๋ยวแอดมินส่งรายละเอียดงานให้ + นัดวันคุยกันครับ`;
    case 'screen':
      return `สนใจตำแหน่ง "${pos}" ใช่ไหมคะ? 😊 รบกวนแจ้งข้อมูลสั้น ๆ เพื่อนัดสัมภาษณ์นะคะ\n1) ชื่อ-นามสกุล\n2) อายุ\n3) ประสบการณ์ / วุฒิการศึกษา\n4) สะดวกเริ่มงานได้เมื่อไหร่\n5) พื้นที่ที่สะดวกทำงาน`;
  }
}

export function LeadPostCard({ post }: { post: LeadPostRow }) {
  const phones = splitPhones(post.phones);
  const [copied, setCopied] = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [tone, setTone] = useState<Tone>('formal');
  const [message, setMessage] = useState(() => draftMessage('formal', post.job_title));

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* clipboard ไม่รองรับ — เงียบ */
    }
  }

  function pickTone(next: Tone) {
    setTone(next);
    setMessage(draftMessage(next, post.job_title)); // เปลี่ยนโทน = ร่างใหม่ตามโทนนั้น
  }

  return (
    <div className="card card-hover p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-accent/10 text-accent">{post.lead_count} เบอร์</span>
            <h3 className="truncate text-sm font-semibold text-ink">{post.job_title || 'ไม่ระบุตำแหน่ง'}</h3>
          </div>
          <p className="mt-1 text-xs text-subtle">
            {post.group_name || 'ไม่ระบุกลุ่ม'}
            {post.account ? ` · ${post.account}` : ''} · {timeAgo(post.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-subtle">
            💬 {post.comment_count} · 👍 {post.reactions} · ↗ {post.shares}
          </span>
          {post.post_link && (
            <a
              href={post.post_link}
              target="_blank"
              rel="noreferrer"
              className="btn-sm rounded-full border border-line px-3 py-1 text-[12px] font-medium text-ink transition hover:border-accent/40 hover:text-accent"
            >
              ดูโพสต์
            </a>
          )}
        </div>
      </div>

      {phones.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {phones.map((phone, i) => {
            const key = `${post.id}-${i}`;
            return (
              <div key={key} className="inline-flex items-center overflow-hidden rounded-full border border-line bg-white text-[12px]">
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="px-2.5 py-1 font-medium tabular-nums text-ink hover:text-accent">
                  {phone}
                </a>
                <button
                  type="button"
                  onClick={() => copy(phone, key)}
                  className="border-l border-line px-2 py-1 text-subtle transition hover:bg-black/[0.03] hover:text-ink"
                  title="คัดลอกเบอร์"
                >
                  {copied === key ? '✓' : '⧉'}
                </button>
              </div>
            );
          })}
          {phones.length > 1 && (
            <button
              type="button"
              onClick={() => copy(phones.join('\n'), `${post.id}-all`)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium text-accent transition hover:bg-accent/5"
            >
              {copied === `${post.id}-all` ? 'คัดลอกแล้ว ✓' : 'คัดลอกทุกเบอร์'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowComposer((s) => !s)}
            className="rounded-full px-2.5 py-1 text-[11px] font-medium text-subtle transition hover:bg-black/[0.04] hover:text-ink"
          >
            {showComposer ? 'ซ่อนข้อความ' : '✍ ร่างข้อความทักกลับ'}
          </button>
        </div>
      )}

      {showComposer && (
        <div className="mt-3 rounded-2xl border border-line bg-black/[0.015] p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {TONES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => pickTone(t.key)}
                className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                  tone === t.key ? 'bg-accent text-white' : 'bg-white text-subtle hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="mt-2 w-full resize-y rounded-xl border border-line bg-white px-3 py-2 text-[13px] leading-relaxed text-ink focus:border-accent/50 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[11px] text-subtle">แก้ข้อความได้ก่อนคัดลอกไปส่งทาง SMS / LINE</span>
            <button
              type="button"
              onClick={() => copy(message, `${post.id}-msg`)}
              className="btn-primary btn-sm rounded-full px-4 py-1.5 text-[12px]"
            >
              {copied === `${post.id}-msg` ? 'คัดลอกแล้ว ✓' : 'คัดลอกข้อความ'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
