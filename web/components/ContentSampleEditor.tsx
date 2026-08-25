'use client';

import Image from 'next/image';
import { ChangeEvent, useMemo, useState } from 'react';

type SampleFields = {
  position: string;
  income: string;
  quantity: string;
  location: string;
  gender: string;
  age: string;
  schedule: string;
  cta: string;
};

const LOGOS = [
  { id: 'so', label: 'SO Recruitment', src: '/logo-SO.webp' },
] as const;

const INITIAL: SampleFields = {
  position: 'พนักงานขับรถ',
  income: '12,000 บาท',
  quantity: '1 อัตรา',
  location: 'ตัวอย่าง: โรงพยาบาลเอกชน\nเขตห้วยขวาง กรุงเทพฯ',
  gender: 'ชาย',
  age: '25–45 ปี',
  schedule: 'ทำงานตามตารางกะ วันละ 10 ชม.\n(รวมพักและ OT เหมา 1 ชม.)',
  cta: 'สนใจสมัคร ส่งข้อความหาเราได้เลย',
};

const FIELD_LABELS: { key: keyof SampleFields; label: string; multiline?: boolean }[] = [
  { key: 'position', label: 'ตำแหน่ง' },
  { key: 'income', label: 'รายได้' },
  { key: 'quantity', label: 'จำนวนรับ' },
  { key: 'location', label: 'สถานที่ทำงาน', multiline: true },
  { key: 'gender', label: 'เพศ' },
  { key: 'age', label: 'อายุ' },
  { key: 'schedule', label: 'เวลาทำงาน', multiline: true },
  { key: 'cta', label: 'ข้อความชวนสมัคร', multiline: true },
];

function Poster({ fields, logoSrc, logoLabel }: { fields: SampleFields; logoSrc: string; logoLabel: string }) {
  return (
    <div
      className="relative aspect-square w-full overflow-hidden rounded-[28px] bg-[#e9f3fb] shadow-[0_24px_70px_rgba(11,42,85,0.2)]"
      style={{ containerType: 'inline-size' }}
      aria-label={`โปสเตอร์ตัวอย่างรับสมัคร${fields.position}`}
    >
      <Image
        src="/content-samples/driver-recruitment-background-v1.png"
        alt="พนักงานขับรถยืนข้างรถหน้าโรงพยาบาล"
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 52vw"
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-white/45 via-white/5 to-transparent" />

      <div className="absolute left-[5.8cqw] top-[5.5cqw] w-[52cqw]">
        <div className="inline-flex rounded-full bg-[#e41c24] px-[2.7cqw] py-[0.8cqw] text-[2.25cqw] font-semibold tracking-wide text-white shadow-md">
          เปิดรับสมัครด่วน
        </div>
        <p className="mt-[2.4cqw] text-[2.2cqw] font-medium text-[#e41c24]">ร่วมงานกับทีม SO PEOPLE</p>
        <h2 className="mt-[0.5cqw] whitespace-pre-line text-[6.6cqw] font-bold leading-[0.98] tracking-[-0.05em] text-[#082b62]">
          {fields.position}
        </h2>

        <div className="mt-[2.8cqw] inline-flex items-baseline gap-[1.2cqw] rounded-[2.4cqw] bg-white/90 px-[2.5cqw] py-[1.3cqw] shadow-sm backdrop-blur">
          <span className="text-[2.25cqw] font-medium text-[#36526f]">รายได้</span>
          <span className="text-[4.35cqw] font-bold leading-none text-[#e41c24]">{fields.income}</span>
        </div>

        <div className="mt-[2.4cqw] space-y-[1.3cqw] text-[2.15cqw] font-medium leading-[1.28] text-[#163652]">
          <p className="flex gap-[1.2cqw]"><span>📍</span><span className="whitespace-pre-line">{fields.location}</span></p>
          <p className="flex gap-[1.2cqw]"><span>👤</span><span>{fields.gender} อายุ {fields.age} · รับ {fields.quantity}</span></p>
          <p className="flex gap-[1.2cqw]"><span>🕐</span><span className="whitespace-pre-line">{fields.schedule}</span></p>
        </div>

        <div className="mt-[2.6cqw] inline-flex rounded-[1.6cqw] bg-[#082b62] px-[2.6cqw] py-[1.5cqw] text-[2.15cqw] font-semibold text-white shadow-lg">
          {fields.cta}
        </div>
      </div>

      <div className="absolute bottom-[4.8cqw] left-[5.8cqw] flex items-center gap-[1.8cqw]">
        <span className="relative h-[5.4cqw] w-[10.8cqw] overflow-hidden rounded-[0.8cqw] bg-white/90 px-[1cqw] shadow-sm">
          {/* ใช้ img เพื่อรองรับโลโก้ที่ผู้ใช้เลือกจากไฟล์บนเครื่องในหน้า Preview */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt={logoLabel} className="h-full w-full object-contain p-[0.8cqw]" />
        </span>
        <span className="text-[1.65cqw] font-medium leading-tight text-[#2f4961]">ร่างแก้ไขได้ · DEMO-001<br />ยังไม่โพสต์จริง</span>
      </div>
    </div>
  );
}

export function ContentSampleEditor() {
  const [fields, setFields] = useState<SampleFields>(INITIAL);
  const [logoId, setLogoId] = useState<string>('so');
  const [customLogoSrc, setCustomLogoSrc] = useState<string | null>(null);
  const [customLogoName, setCustomLogoName] = useState<string>('');
  const [captionOverride, setCaptionOverride] = useState<string | null>(null);

  const generatedCaption = useMemo(() => [
    `🚗 เปิดรับสมัคร ${fields.position}`,
    '',
    `💰 รายได้ ${fields.income} | รับ ${fields.quantity}`,
    `📍 ${fields.location.replace(/\n/g, ' ')}`,
    `👤 ${fields.gender} อายุ ${fields.age}`,
    `🕐 ${fields.schedule.replace(/\n/g, ' ')}`,
    '',
    fields.cta,
    '#งานขับรถ #หางานกรุงเทพ #สมัครงาน #SOPEOPLE',
  ].join('\n'), [fields]);
  const caption = captionOverride ?? generatedCaption;
  const selectedLogo = LOGOS.find((logo) => logo.id === logoId) ?? LOGOS[0];
  const logoSrc = customLogoSrc ?? selectedLogo.src;
  const logoLabel = customLogoSrc ? customLogoName || 'โลโก้ที่เลือก' : selectedLogo.label;

  const update = (key: keyof SampleFields, value: string) => {
    setFields((current) => ({ ...current, [key]: value }));
  };

  const chooseLogoFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setCustomLogoSrc(reader.result);
        setCustomLogoName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.12fr)_minmax(360px,0.88fr)]">
      <div className="space-y-4">
        <Poster fields={fields} logoSrc={logoSrc} logoLabel={logoLabel} />
        <div className="flex flex-wrap gap-2">
          <a className="btn-secondary btn-sm" href="/content-samples/driver-recruitment-poster-v1.svg" download>
            ดาวน์โหลดไฟล์แก้ไข SVG
          </a>
          <a className="btn-secondary btn-sm" href="/content-samples/driver-recruitment-poster-v1.json" download>
            ดาวน์โหลดข้อมูลต้นทาง
          </a>
        </div>
      </div>

      <div className="space-y-4">
        <section className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">แก้ตัวอย่างบนหน้า Web</p>
              <h2 className="mt-1 text-lg font-semibold">ข้อความบนภาพ</h2>
            </div>
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setFields(INITIAL)}>
              คืนค่าเดิม
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-subtle">ลองแก้ข้อความได้ทันที ภาพด้านซ้ายจะเปลี่ยนตาม แต่ข้อมูลนี้ยังไม่ถูกบันทึกและไม่ส่งโพสต์จริง</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {FIELD_LABELS.map((field) => (
              <label key={field.key} className={field.multiline ? 'sm:col-span-2 lg:col-span-1 xl:col-span-2' : ''}>
                <span className="label">{field.label}</span>
                {field.multiline ? (
                  <textarea
                    className="field min-h-20 resize-y"
                    value={fields[field.key]}
                    onChange={(event) => update(field.key, event.target.value)}
                  />
                ) : (
                  <input className="field" value={fields[field.key]} onChange={(event) => update(field.key, event.target.value)} />
                )}
              </label>
            ))}
          </div>

          <div className="mt-5 border-t border-hairline pt-4">
            <span className="label">โลโก้บนภาพ</span>
            <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <label>
                <span className="sr-only">เลือกโลโก้ที่ตั้งค่าแล้ว</span>
                <select
                  className="field w-full"
                  value={customLogoSrc ? 'custom' : logoId}
                  onChange={(event) => {
                    if (event.target.value !== 'custom') {
                      setLogoId(event.target.value);
                      setCustomLogoSrc(null);
                      setCustomLogoName('');
                    }
                  }}
                >
                  {LOGOS.map((logo) => <option key={logo.id} value={logo.id}>{logo.label}</option>)}
                  {customLogoSrc && <option value="custom">{customLogoName || 'โลโก้ที่เลือกจากไฟล์'}</option>}
                </select>
              </label>
              <label className="btn-secondary btn-sm inline-flex cursor-pointer items-center justify-center">
                เลือกไฟล์โลโก้…
                <input type="file" accept="image/png,image/webp,image/svg+xml" className="sr-only" onChange={chooseLogoFile} />
              </label>
            </div>
            <p className="mt-2 text-xs leading-5 text-subtle">รองรับ SVG, PNG และ WebP · เลือกแล้วเห็นตำแหน่งโลโก้บนภาพทันที ไฟล์นี้ใช้ดูตัวอย่างเท่านั้น ยังไม่อัปโหลดเข้าคลัง Material</p>
          </div>
        </section>

        <section className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="eyebrow">Caption ตัวอย่าง</p>
              <h2 className="mt-1 text-lg font-semibold">แก้ข้อความใต้โพสต์</h2>
            </div>
            <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => setCaptionOverride(null)}>คืนค่า AI</button>
          </div>
          <p className="mt-2 text-xs leading-5 text-subtle">เพิ่ม ลบ หรือปรับคำชวนสมัครได้เอง ข้อความบนภาพยังแก้จากฟอร์มด้านบน</p>
          <textarea
            className="field mt-4 min-h-64 w-full resize-y whitespace-pre-wrap leading-6"
            value={caption}
            onChange={(event) => setCaptionOverride(event.target.value)}
          />
        </section>

        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">จุดที่ต้องยืนยันก่อนอนุมัติ</p>
          <p className="mt-1 leading-6">ตัวอย่างนี้จำลองกรณีที่ใบขอระบุตำแหน่งกว้างเพียง “พนักงาน” แล้วระบบตีความเป็น “พนักงานขับรถ” จาก Job Family จึงทำร่างให้ดูก่อนได้ แต่จะไม่โพสต์จริงจนกว่าคนยืนยันชื่อตำแหน่ง</p>
        </section>
      </div>
    </div>
  );
}
