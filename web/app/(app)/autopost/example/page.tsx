import Link from 'next/link';
import { AutopostNav } from '@/components/AutopostNav';
import { ContentSampleEditor } from '@/components/ContentSampleEditor';
import { Button } from '@/components/ui/button';

export default function AutopostExamplePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">ข้อมูลสาธิต ไม่ระบุตัวตน และไม่โพสต์จริง</p>
          <h1 className="text-2xl font-semibold">ตัวอย่าง Content รับสมัครงาน</h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            ทำจากโครงสร้างใบขอ มีข้อความบนภาพ Caption และไฟล์ต้นฉบับที่แก้ต่อได้ ไม่มีข้อมูลงานจริง
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/workflow">ดูการไหลทั้งระบบ</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/autopost">กลับภาพรวมการโพสต์</Link>
          </Button>
        </div>
      </div>

      <AutopostNav />
      <ContentSampleEditor />
    </div>
  );
}
