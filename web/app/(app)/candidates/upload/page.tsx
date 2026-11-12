import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { ResumeUploadForm } from '@/components/ResumeUploadForm';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listRecentBatches, listUploadTaskOptions, resumeReaderStatus } from '@/lib/resume-uploads';

export const dynamic = 'force-dynamic';

function when(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
}

/** อัปโหลดเรซูเม่เข้าคลังผู้สมัคร (เจ้าของ 12 พ.ย. 2569) */
export default async function ResumeUploadPage() {
  const [tasks, batches, reader] = await Promise.all([listUploadTaskOptions(), listRecentBatches(10), resumeReaderStatus()]);
  const problem = !reader.online
    ? 'ตอนนี้เครื่องอ่านไฟล์ (RM009) ไม่ได้เปิดอยู่ อัปโหลดได้ แต่ไฟล์จะรออ่านจนกว่าเครื่องจะเปิด'
    : !reader.textModel
      ? 'เซิร์ฟเวอร์ AI ของบริษัทยังไม่มีโมเดลอ่านเรซูเม่ อัปโหลดได้ แต่ไฟล์จะขึ้นว่าอ่านไม่ได้ พอ IT ลงโมเดลแล้วกด "อ่านใหม่" ในหน้าผลได้'
      : !reader.ocrModel
        ? 'ตอนนี้อ่านได้เฉพาะ PDF ที่มีตัวหนังสือและไฟล์ Word ส่วนรูปกับ PDF สแกนยังอ่านไม่ได้ เพราะเซิร์ฟเวอร์ AI ของบริษัทไม่มีโมเดลอ่านรูป'
        : '';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/candidates">
            <ArrowLeftIcon data-icon="inline-start" />
            กลับไปคลังผู้สมัคร
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold">อัปโหลดเรซูเม่</h1>

      {problem && (
        <Alert>
          <AlertTitle>AI ยังอ่านไฟล์ได้ไม่ครบ</AlertTitle>
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <ResumeUploadForm tasks={tasks} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>อัปโหลดล่าสุด</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>เวลา</TableHead>
                <TableHead>คนอัปโหลด</TableHead>
                <TableHead className="text-right">ไฟล์</TableHead>
                <TableHead className="text-right">บันทึกแล้ว</TableHead>
                <TableHead className="text-right">รอเลือกข้อมูล</TableHead>
                <TableHead className="text-right">อ่านไม่ได้</TableHead>
                <TableHead className="text-right">รออ่าน</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-muted-foreground">ยังไม่มีการอัปโหลด</TableCell>
                </TableRow>
              )}
              {batches.map((b) => (
                <TableRow key={b.batch_id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/candidates/upload/${b.batch_id}`} className="underline-offset-4 hover:underline">{when(b.created_at)}</Link>
                  </TableCell>
                  <TableCell>{b.uploaded_by_name ?? '-'}</TableCell>
                  <TableCell className="text-right">{b.files}</TableCell>
                  <TableCell className="text-right">{b.saved}</TableCell>
                  <TableCell className="text-right">{b.review}</TableCell>
                  <TableCell className="text-right">{b.failed}</TableCell>
                  <TableCell className="text-right">{b.waiting}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
