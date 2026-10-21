'use client';

import { useState } from 'react';
import { CheckIcon, CopyIcon, ExternalLinkIcon, PencilLineIcon } from 'lucide-react';
import type { LeadPostRow } from '@/lib/repo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

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

  const messageId = `lead-msg-${post.id}`;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate">{post.job_title || 'ไม่ระบุตำแหน่ง'}</span>
          <Badge variant="secondary" className="tabular-nums">{post.lead_count} เบอร์</Badge>
        </CardTitle>
        <CardDescription className="leading-relaxed">
          {post.group_name || 'ไม่ระบุกลุ่ม'}
          {post.account ? ` · ${post.account}` : ''} · {timeAgo(post.created_at)}
          <span className="block text-xs tabular-nums">
            คอมเมนต์ {post.comment_count} · ถูกใจ {post.reactions} · แชร์ {post.shares}
          </span>
        </CardDescription>
        {post.post_link && (
          <CardAction>
            <Button asChild variant="outline" size="sm">
              <a href={post.post_link} target="_blank" rel="noreferrer">
                ดูโพสต์
                <ExternalLinkIcon data-icon="inline-end" />
              </a>
            </Button>
          </CardAction>
        )}
      </CardHeader>

      {phones.length > 0 && (
        <CardContent>
          <Collapsible open={showComposer} onOpenChange={setShowComposer} className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {phones.map((phone, i) => {
                const key = `${post.id}-${i}`;
                return (
                  <ButtonGroup key={key}>
                    <Button asChild variant="outline" size="sm" className="tabular-nums">
                      <a href={`tel:${phone.replace(/\s/g, '')}`}>{phone}</a>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() => copy(phone, key)}
                      title="คัดลอกเบอร์"
                      aria-label={`คัดลอกเบอร์ ${phone}`}
                    >
                      {copied === key ? <CheckIcon /> : <CopyIcon />}
                    </Button>
                  </ButtonGroup>
                );
              })}
              {phones.length > 1 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => copy(phones.join('\n'), `${post.id}-all`)}>
                  {copied === `${post.id}-all` ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                  {copied === `${post.id}-all` ? 'คัดลอกแล้ว' : 'คัดลอกทุกเบอร์'}
                </Button>
              )}
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                  <PencilLineIcon data-icon="inline-start" />
                  {showComposer ? 'ซ่อนข้อความ' : 'ร่างข้อความทักกลับ'}
                </Button>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/50 p-3">
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={tone}
                  onValueChange={(v) => {
                    if (v) pickTone(v as Tone);
                  }}
                  aria-label="โทนข้อความ"
                >
                  {TONES.map((t) => (
                    <ToggleGroupItem key={t.key} value={t.key}>
                      {t.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <Field>
                  <FieldLabel htmlFor={messageId} className="sr-only">
                    ข้อความทักกลับ
                  </FieldLabel>
                  <Textarea
                    id={messageId}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={5}
                    className="resize-y leading-relaxed"
                  />
                  <FieldDescription className="text-xs">แก้ข้อความได้ก่อนคัดลอกไปส่งทาง SMS หรือ LINE</FieldDescription>
                </Field>
                <div className="flex justify-end">
                  <Button type="button" size="sm" onClick={() => copy(message, `${post.id}-msg`)}>
                    {copied === `${post.id}-msg` ? <CheckIcon data-icon="inline-start" /> : <CopyIcon data-icon="inline-start" />}
                    {copied === `${post.id}-msg` ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      )}
    </Card>
  );
}
