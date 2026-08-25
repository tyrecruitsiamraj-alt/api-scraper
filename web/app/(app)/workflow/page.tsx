import Link from 'next/link';

type FlowStep = {
  no: number;
  title: string;
  detail: string;
  href?: string;
  action?: string;
};

function Flow({ title, eyebrow, tone, steps }: { title: string; eyebrow: string; tone: 'green' | 'violet'; steps: FlowStep[] }) {
  const toneClass = tone === 'green'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
    : 'border-violet-200 bg-violet-50 text-violet-950';
  const dotClass = tone === 'green' ? 'bg-emerald-600' : 'bg-violet-700';
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
          <p className="mt-2 max-w-3xl text-sm leading-6 text-subtle">หลังเข้า Microsoft ระบบพามาที่ศูนย์งานเดียว งานจาก So Recruit จะถูกแยกเป็น “ค้นหาผู้สมัคร” หรือ “สร้าง Content” โดยไม่ต้องเดาว่าต้องไปหน้าไหนก่อน</p>
        </div>
        <Link href="/orchestrator" className="btn-primary btn-sm">ไปศูนย์งานจริง</Link>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-[auto_1fr_auto_1fr_auto] md:items-center">
          <div className="rounded-xl bg-black/[0.04] px-4 py-3 text-sm font-medium">1 · Login ด้วย Microsoft</div>
          <span className="hidden text-center text-subtle md:block">→</span>
          <div className="rounded-xl bg-black/[0.04] px-4 py-3 text-sm font-medium">2 · ศูนย์งาน: เห็นใบงานใหม่และงานค้าง</div>
          <span className="hidden text-center text-subtle md:block">→</span>
          <div className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-accent">3 · เลือกเส้นทางตามชนิดงาน</div>
        </div>
        <p className="mt-4 text-sm text-subtle">ใบงานต้องมีเลขใบขอ ตำแหน่ง พื้นที่ จำนวน และรายละเอียดงานให้ตรวจได้ก่อนเริ่ม หากข้อมูลสำคัญขาด ระบบจะแจ้งให้ยืนยัน ไม่ปล่อยให้ AI เดาแล้วทำงานต่อเอง</p>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Flow
          eyebrow="เส้นทาง A · หา Resume"
          title="งาน Scraping"
          tone="green"
          steps={[
            { no: 1, title: 'ใบงานค้นหาผู้สมัครเข้ามา', detail: 'So Recruit ส่งเลขใบขอ ตำแหน่ง เนื้องาน จำนวน Resume ที่ต้องการ และข้อมูลคัดกรองมาที่ศูนย์งาน', href: '/orchestrator/imports', action: 'ดูใบงานที่เข้ามา' },
            { no: 2, title: 'ตรวจความถูกต้องก่อนค้นหา', detail: 'ตรวจตำแหน่ง พื้นที่ จำนวน คุณสมบัติบังคับ และเลือกว่าใช้ JobThai หรือ JobBKK ผ่าน Connector ใด' },
            { no: 3, title: 'กดเริ่มค้นหาผู้สมัคร', detail: 'งานเข้าคิวไปยังเครื่อง Worker ที่ผูก Connector ไว้ ระบบ Login → ค้นหาตามตำแหน่ง/Job Family → เก็บ Resume → ตัดคนซ้ำ → คัดตาม Hard Filter' },
            { no: 4, title: 'ดูผลระหว่างรัน', detail: 'หน้า Scraping แสดงจำนวนที่ได้จริงเทียบเป้าหมาย และสถานะว่า Worker กำลังทำขั้นไหน ไม่ต้องถามในแชตเพื่อให้ Worker เริ่มงาน', href: '/scraping', action: 'ดูสถานะการค้นหา' },
            { no: 5, title: 'ตรวจรับและส่งเข้าคลังผู้สมัคร', detail: 'เมื่อได้ครบหรือค้นหาตาม Job Family จบแล้ว คนตรวจรับผล แล้วข้อมูลอยู่ในคลังผู้สมัครเพื่อใช้ติดต่อต่อ' },
          ]}
        />

        <Flow
          eyebrow="เส้นทาง B · สร้างสื่อและโพสต์"
          title="งาน Content และ Auto-post"
          tone="violet"
          steps={[
            { no: 1, title: 'ใบขอสร้างประกาศเข้ามา', detail: 'So Recruit ส่งตำแหน่ง รายได้ จำนวน สถานที่ เวลางาน คุณสมบัติ และข้อมูลติดต่อมายังศูนย์งาน', href: '/orchestrator/imports', action: 'ดูใบงานที่เข้ามา' },
            { no: 2, title: 'ตรวจข้อมูลใบขอ', detail: 'ตรวจข้อเท็จจริงก่อนเริ่มทำสื่อ ข้อมูลที่ไม่มีในใบขอจะไม่ถูก AI แต่งขึ้นเป็นเงินเดือน สวัสดิการ หรือเงื่อนไขใหม่' },
            { no: 3, title: 'AI ทำ Content', detail: 'AI วิเคราะห์ตำแหน่ง หาแนวและคำค้นที่เกี่ยวข้อง แล้วสร้างภาพตามอาชีพจริง พร้อม Caption ร่างให้แก้ได้', href: '/autopost/example', action: 'ดูตัวอย่างหน้าแก้ Content' },
            { no: 4, title: 'แก้และอนุมัติสื่อ', detail: 'แก้ข้อความบนภาพ เลือกโลโก้ใน Preview และแก้ Caption ได้ เมื่ออนุมัติแล้วงานยังไม่โพสต์จริง แต่ย้ายไปหน้าสรุป' },
            { no: 5, title: 'หน้าสรุปก่อน Auto-post', detail: 'เลือกบัญชี Facebook และเห็นจำนวนกลุ่มที่จะใช้จริง จากนั้นกด “เริ่ม Auto-post” จึงสร้างคิวโพสต์' },
            { no: 6, title: 'ติดตามจนเสร็จสิ้น', detail: 'หน้ารายละเอียดงานแสดงว่าโพสต์สำเร็จกี่จากกี่กลุ่ม เก็บผลตอบรับ แล้วปิดงานเมื่อวงจรครบ', href: '/autopost', action: 'ดูคิวและผลการโพสต์' },
          ]}
        />
      </div>

      <section className="card p-5 sm:p-6">
        <h2 className="text-lg font-semibold">เมื่อ Login แล้ว คุณใช้แค่ 3 จุดนี้</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Link href="/orchestrator" className="rounded-xl border border-hairline p-4 transition hover:border-accent/50 hover:bg-accent/[0.03]">
            <span className="block text-sm font-semibold">ศูนย์งาน</span><span className="mt-1 block text-xs leading-5 text-subtle">รับงาน ตรวจใบขอ ติดตามทุกงานที่ค้าง</span>
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
