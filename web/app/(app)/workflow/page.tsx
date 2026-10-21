import Link from 'next/link';
import { ArrowRightIcon, ChevronRightIcon } from 'lucide-react';
import { productScopeSummary } from '@/lib/product-scope';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import { cn } from '@/lib/utils';

type FlowStep = {
  no: number;
  title: string;
  detail: string;
  href?: string;
  action?: string;
};

function Flow({ title, route, steps }: { title: string; route: string; steps: FlowStep[] }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{route}</CardDescription>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="flex flex-col">
          {steps.map((step, index) => (
            <li key={step.no} className="relative flex gap-4 pb-6 last:pb-0">
              {index < steps.length - 1 && <span aria-hidden className="absolute left-3.5 top-8 h-[calc(100%-2rem)] w-px bg-border" />}
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">{step.no}</span>
              <div className="flex min-w-0 flex-col gap-1 pt-0.5">
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                {step.href && (
                  <Button asChild variant="link" size="sm" className="self-start px-0">
                    <Link href={step.href}>
                      {step.action ?? 'เปิดหน้านี้'}
                      <ArrowRightIcon data-icon="inline-end" />
                    </Link>
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

const ENTRY_STEPS = ['Login ด้วย Microsoft', 'ศูนย์งาน: ใบค้นหาและงานค้าง', 'ค้นหา หรือโพสต์ Facebook'];

export default function WorkflowPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">ขั้นตอนการทำงาน</p>
          <h1 className="text-2xl font-semibold">Login แล้วเจออะไร งานเดินอย่างไร</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            ขอบเขตระบบตอนนี้: {productScopeSummary()}. ไม่รับงานสร้างประกาศ (Content AI) แล้ว ศูนย์งานใช้รับงานค้นหาผู้สมัคร ส่วน Autopost ใช้หน้าโพสต์ Facebook
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/orchestrator">ไปที่ศูนย์งาน</Link>
        </Button>
      </div>

      <Card>
        <CardContent>
          <ol className="flex flex-col gap-3 md:flex-row md:items-center">
            {ENTRY_STEPS.map((label, index) => (
              <li key={label} className="flex items-center gap-3">
                <span className="flex items-center gap-2 text-sm">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums">{index + 1}</span>
                  <span className={cn(index === ENTRY_STEPS.length - 1 && 'font-medium')}>{label}</span>
                </span>
                {index < ENTRY_STEPS.length - 1 && <ChevronRightIcon aria-hidden className="hidden size-4 text-muted-foreground md:block" />}
              </li>
            ))}
          </ol>
        </CardContent>
        <CardFooter className="text-sm leading-relaxed text-muted-foreground">
          ใบงานค้นหาต้องมีเลขใบขอ ตำแหน่ง พื้นที่ จำนวน และรายละเอียดงานให้ตรวจได้ก่อนเริ่ม ถ้าเป็นคำขอสร้างประกาศให้ตีกลับ
        </CardFooter>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <Flow
          route="เส้นทาง A · หา Resume"
          title="งาน Scraping"
          steps={[
            { no: 1, title: 'ใบงานค้นหาผู้สมัครเข้ามา', detail: 'So Recruit ส่งเลขใบขอ ตำแหน่ง เนื้องาน จำนวน Resume ที่ต้องการ และข้อมูลคัดกรองมาที่ศูนย์งาน', href: '/orchestrator/imports', action: 'ดูใบงานที่เข้ามา' },
            { no: 2, title: 'ตรวจข้อมูลก่อนค้นหา', detail: 'ตรวจตำแหน่ง พื้นที่ จำนวน คุณสมบัติบังคับ และเลือกว่าใช้ JobThai หรือ JobBKK ผ่าน Connector ใด' },
            { no: 3, title: 'กดเริ่มค้นหาผู้สมัคร', detail: 'งานเข้าคิวไปที่เครื่อง Worker ที่ผูก Connector ไว้ ระบบ Login แล้วค้นแบบปกติ ถ้าได้ 0 คนจะผ่อนตัวกรอง จากนั้นใช้ AI Search เติมจำนวน เก็บ Resume ตัดคนซ้ำ และคัดตาม Hard Filter' },
            { no: 4, title: 'ดูผลระหว่างรัน', detail: 'หน้า Scraping แสดงจำนวนที่ได้จริงเทียบเป้า และบอกว่า Worker ทำถึงขั้นไหน', href: '/scraping', action: 'ดูสถานะการค้นหา' },
            { no: 5, title: 'ตรวจรับและส่งเข้าคลังผู้สมัคร', detail: 'เมื่อได้ครบ หรือค้นตาม Job Family จบแล้ว ให้คนตรวจรับผล ข้อมูลจะเข้าคลังผู้สมัครเพื่อติดต่อต่อ' },
          ]}
        />

        <Flow
          route="เส้นทาง B · โพสต์ Facebook"
          title="งาน Autopost"
          steps={[
            { no: 1, title: 'เตรียมบัญชีและกลุ่ม', detail: 'ตั้งบัญชี Facebook กลุ่ม และเครื่อง Worker ที่หน้าโพสต์ แล้วทดสอบ Session แบบไม่โพสต์จริง', href: '/autopost/accounts', action: 'ดูบัญชีโพสต์' },
            { no: 2, title: 'สร้างหรือเลือกงานโพสต์', detail: 'ใส่ภาพและ Caption ที่คนเตรียมไว้ในระบบ Autopost ระบบไม่สร้างประกาศจากใบขอให้อัตโนมัติแล้ว', href: '/autopost/jobs', action: 'ดูงานโพสต์' },
            { no: 3, title: 'ส่งเข้าคิว Autopost', detail: 'เลือกบัญชีและกลุ่ม แล้วส่งคิวให้เครื่อง Worker โพสต์จริง', href: '/autopost/posting', action: 'เปิดหน้าโพสต์' },
            { no: 4, title: 'ติดตามผลและผู้สนใจ', detail: 'ดูคิว ผลโพสต์ เบอร์ผู้สนใจ และรายงานรายสัปดาห์ที่หน้าผลลัพธ์', href: '/autopost/results', action: 'ดูผลลัพธ์' },
          ]}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>หน้าที่ใช้ประจำ</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemGroup className="grid gap-3 md:grid-cols-3">
            <Item asChild variant="outline">
              <Link href="/orchestrator">
                <ItemContent>
                  <ItemTitle>ศูนย์งาน · ค้นหา</ItemTitle>
                  <ItemDescription>ใบรอเริ่ม · กำลังค้น · รอตรวจรับ</ItemDescription>
                </ItemContent>
              </Link>
            </Item>
            <Item asChild variant="outline">
              <Link href="/scraping">
                <ItemContent>
                  <ItemTitle>รายการงานค้นหา</ItemTitle>
                  <ItemDescription>ความคืบหน้าและผล Resume</ItemDescription>
                </ItemContent>
              </Link>
            </Item>
            <Item asChild variant="outline">
              <Link href="/autopost">
                <ItemContent>
                  <ItemTitle>ห้องโพสต์ Facebook</ItemTitle>
                  <ItemDescription>caption + รูป · คิว · ผลตอบรับ</ItemDescription>
                </ItemContent>
              </Link>
            </Item>
          </ItemGroup>
        </CardContent>
      </Card>
    </div>
  );
}
