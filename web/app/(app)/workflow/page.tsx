import Link from 'next/link';
import { productScopeSummary } from '@/lib/product-scope';

type FlowStep = {
  no: number;
  title: string;
  detail: string;
  href?: string;
  action?: string;
};

function Flow({ title, eyebrow, tone, steps }: { title: string; eyebrow: string; tone: 'green' | 'blue'; steps: FlowStep[] }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : 'border-sky-200 bg-sky-50 text-sky-950';
  const dotClass = tone === 'green' ? 'bg-emerald-600' : 'bg-sky-700';
  return (
    <section className={`rounded-2xl border p-5 sm:p-6 ${toneClass}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold">{title}</h2>
      <ol className="mt-5 space-y-0">
        {steps.map((step, index) => (
          <li key={step.no} className="relative flex gap-4 pb-5 last:pb-0">
            {index < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-20px)] w-px bg-current opacity-20" />}
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${dotClass}`}>{step.no}</span>
            <div className="min-w-0 pt-0.5">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm leading-6 opacity-80">{step.detail}</p>
              {step.href && (
                <Link href={step.href} className="mt-2 inline-flex text-sm font-medium underline underline-offset-4">
                  {step.action ?? 'เปิดหน้านี้'} →
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function WorkflowPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">คู่มือการไหลของงาน</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Login แล้วเจออะไร งานไหลอย่างไร</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">
            ขอบเขตระบบตอนนี้: {productScopeSummary()}. ไม่รับงานสร้างประกาศ (Content AI) อีก — ศูนย์งานรับค้นหาผู้สมัคร และใช้หน้าโพสต์ Facebook สำหรับ Autopost
          </p>
        </div>
        <Link href="/orchestrator" className="btn-primary btn-sm">ไปศูนย์งานจริง</Link>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-[auto_1fr_auto_1fr_auto] md:items-center">
          <div className="rounded-xl bg-black/[0.04] px-4 py-3 text-sm font-medium">1 · Login ด้วย Microsoft</div>
          <span className="hidden text-center text-subtle md:block">→</span>
          <div className="rounded-xl bg-black/[0.04] px-4 py-3 text-sm font-medium">2 · ศูนย์งาน: ใบค้นหาและงานค้าง</div>
          <span className="hidden text-center text-subtle md:block">→</span>
          <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent">3 · ค้นหา หรือโพสต์ Facebook</div>
        </div>
        <p className="mt-4 text-sm text-subtle">ใบงานค้นหาต้องมีเลขใบขอ ตำแหน่ง พื้นที่ จำนวน และรายละเอียดงานให้ตรวจได้ก่อนเริ่ม คำขอสร้างประกาศให้ตีกลับ</p>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Flow
          eyebrow="เส้นทาง A · หา Resume"
          title="งาน Scraping"
          tone="green"
          steps={[
            { no: 1, title: 'ใบงานค้นหาผู้สมัครเข้ามา', detail: 'So Recruit ส่งเลขใบขอ ตำแหน่ง เนื้องาน จำนวน Resume ที่ต้องการ และข้อมูลคัดกรองมาที่ศูนย์งาน', href: '/orchestrator/imports', action: 'ดูใบงานที่เข้ามา' },
            { no: 2, title: 'ตรวจความถูกต้องก่อนค้นหา', detail: 'ตรวจตำแหน่ง พื้นที่ จำนวน คุณสมบัติบังคับ และเลือกว่าใช้ JobThai หรือ JobBKK ผ่าน Connector ใด' },
            { no: 3, title: 'กดเริ่มค้นหาผู้สมัคร', detail: 'งานเข้าคิวไปยังเครื่อง Worker ที่ผูก Connector ไว้ ระบบ Login → Normal Search → ผ่อนตัวกรองถ้าผลเป็น 0 → AI Search เติมจำนวน → เก็บ Resume → ตัดคนซ้ำ → คัดตาม Hard Filter' },
            { no: 4, title: 'ดูผลระหว่างรัน', detail: 'หน้า Scraping แสดงจำนวนที่ได้จริงเทียบเป้าหมาย และสถานะว่า Worker กำลังทำขั้นไหน', href: '/scraping', action: 'ดูสถานะการค้นหา' },
            { no: 5, title: 'ตรวจรับและส่งเข้าคลังผู้สมัคร', detail: 'เมื่อได้ครบหรือค้นหาตาม Job Family จบแล้ว คนตรวจรับผล แล้วข้อมูลอยู่ในคลังผู้สมัครเพื่อใช้ติดต่อต่อ' },
          ]}
        />

        <Flow
          eyebrow="เส้นทาง B · โพสต์ Facebook"
          title="งาน Autopost"
          tone="blue"
          steps={[
            { no: 1, title: 'เตรียมบัญชีและกลุ่ม', detail: 'ตั้งบัญชี Facebook กลุ่ม และเครื่อง Worker ที่หน้าโพสต์ แล้วทดสอบ Session แบบไม่โพสต์จริง', href: '/autopost/accounts', action: 'ดูบัญชีโพสต์' },
            { no: 2, title: 'สร้างหรือเลือกงานโพสต์', detail: 'ใส่ภาพและ Caption ที่คนเตรียมไว้ในระบบ Autopost — ระบบนี้ไม่สร้างประกาศจากใบขออัตโนมัติแล้ว', href: '/autopost/jobs', action: 'ดูงานโพสต์' },
            { no: 3, title: 'ส่งเข้าคิว Auto-post', detail: 'เลือกบัญชีและกลุ่ม แล้วส่งคิวให้เครื่อง Worker โพสต์จริง', href: '/autopost/posting', action: 'เปิดหน้าโพสต์' },
            { no: 4, title: 'ติดตามผลและผู้สนใจ', detail: 'ดูคิว ผลโพสต์ เบอร์ผู้สนใจ และรายงานสัปดาห์จากหน้าผลลัพธ์', href: '/autopost/results', action: 'ดูผลลัพธ์' },
          ]}
        />
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">เมื่อ Login แล้ว คุณใช้แค่ 3 จุดนี้</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Link href="/orchestrator" className="rounded-xl border border-hairline p-4 transition hover:border-accent/50 hover:bg-accent/[0.03]">
            <span className="block text-sm font-semibold">ศูนย์งาน</span><span className="mt-1 block text-xs leading-5 text-subtle">รับงานค้นหา ตรวจใบขอ ติดตามงานค้าง</span>
          </Link>
          <Link href="/scraping" className="rounded-xl border border-hairline p-4 transition hover:border-accent/50 hover:bg-accent/[0.03]">
            <span className="block text-sm font-semibold">ค้นหาผู้สมัคร</span><span className="mt-1 block text-xs leading-5 text-subtle">ดูความคืบหน้าและผล Resume ที่ได้</span>
          </Link>
          <Link href="/autopost" className="rounded-xl border border-hairline p-4 transition hover:border-accent/50 hover:bg-accent/[0.03]">
            <span className="block text-sm font-semibold">โพสต์และติดตามผล</span><span className="mt-1 block text-xs leading-5 text-subtle">ดูคิวโพสต์ จำนวนกลุ่ม และผลตอบรับ</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
