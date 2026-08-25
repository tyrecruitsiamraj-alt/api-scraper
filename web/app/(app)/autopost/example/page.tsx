import Link from 'next/link';
import { AutopostNav } from '@/components/AutopostNav';
import { ContentSampleEditor } from '@/components/ContentSampleEditor';

export default function AutopostExamplePage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">ข้อมูลสาธิตที่ไม่ระบุตัวตน · ไม่โพสต์จริง</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">ตัวอย่าง Content รับสมัครงาน</h1>
          <p className="mt-1 max-w-3xl text-sm text-subtle">ตัวอย่างจากโครงสร้างใบขอ พร้อมข้อความบนภาพ Caption และไฟล์ต้นฉบับที่แก้ต่อได้ โดยไม่เปิดเผยข้อมูลงานจริง</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/workflow" className="btn-secondary btn-sm">ดูการไหลทั้งระบบ</Link>
          <Link href="/autopost" className="btn-secondary btn-sm">กลับภาพรวมการโพสต์</Link>
        </div>
      </div>

      <AutopostNav />
      <ContentSampleEditor />
    </div>
  );
}
