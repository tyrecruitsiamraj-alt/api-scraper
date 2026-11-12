import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, DownloadIcon, RotateCcwIcon } from 'lucide-react';
import { AutoRefresh } from '@/components/AutoRefresh';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { mergeUploadAction, retryUploadsAction, skipUploadAction } from '@/lib/actions';
import { UPLOAD_STATUS_LABEL, getUploadBatch } from '@/lib/resume-uploads';
import type { UploadRow, UploadStatus } from '@/lib/resume-uploads';

export const dynamic = 'force-dynamic';

function when(iso: string) {
  return new Date(iso).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: UploadStatus }) {
  return (
    <Badge
      variant={status === 'failed' ? 'destructive' : status === 'saved' || status === 'merged' ? 'secondary' : 'outline'}
      className={status === 'review' ? 'border-warning/30 bg-warning/10 text-warning' : undefined}
    >
      {UPLOAD_STATUS_LABEL[status] ?? status}
    </Badge>
  );
}

/** คนที่มีในระบบแล้ว: ตารางเทียบเฉพาะช่องที่ต่าง ติ๊กช่องที่จะเอาจากไฟล์ใหม่ */
function ReviewCard({ row }: { row: UploadRow }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Link href={`/candidates/${row.candidate_id}`} className="hover:text-primary">{row.candidate_name || row.parsed_name || 'ผู้สมัคร'}</Link>
        </CardTitle>
        <CardDescription>
          {row.file_name} · มีคนนี้ในระบบแล้ว ติ๊กช่องที่จะเอาจากไฟล์ใหม่
        </CardDescription>
      </CardHeader>
      <form action={mergeUploadAction}>
        <input type="hidden" name="uploadId" value={row.id} />
        <CardContent>
          {row.diff.length === 0 ? (
            <p className="text-sm text-muted-foreground">ข้อมูลในไฟล์ตรงกับในระบบทุกช่อง กดบันทึกเพื่อแนบไฟล์ให้คนนี้</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><span className="sr-only">เลือก</span></TableHead>
                  <TableHead>ช่อง</TableHead>
                  <TableHead>ในระบบตอนนี้</TableHead>
                  <TableHead>จากไฟล์ใหม่</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {row.diff.map((d) => (
                  <TableRow key={d.key}>
                    <TableCell>
                      <Checkbox id={`${row.id}-${d.key}`} name="fields" value={d.key} aria-label={`ใช้${d.label}จากไฟล์ใหม่`} />
                    </TableCell>
                    <TableCell>
                      <label htmlFor={`${row.id}-${d.key}`} className="font-medium">{d.label}</label>
                    </TableCell>
                    <TableCell className="min-w-48 whitespace-normal text-muted-foreground">
                      {d.current.length ? d.current.map((v, i) => <div key={i}>{v}</div>) : 'ว่าง'}
                    </TableCell>
                    <TableCell className="min-w-48 whitespace-normal">
                      {d.incoming.map((v, i) => <div key={i}>{v}</div>)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
        <CardFooter className="mt-4 flex flex-wrap gap-2">
          <Button type="submit">บันทึก</Button>
          <Button type="submit" variant="outline" formAction={skipUploadAction}>ไม่ใช้ไฟล์นี้</Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default async function UploadBatchPage(props: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const rows = await getUploadBatch(batchId);
  if (!rows.length) notFound();

  const count = (...s: UploadStatus[]) => rows.filter((r) => s.includes(r.status)).length;
  const waiting = count('queued', 'reading');
  const saved = count('saved', 'merged');
  const failed = count('failed');
  const reviews = rows.filter((r) => r.status === 'review');
  const first = rows[0];

  return (
    <div className="flex flex-col gap-6">
      {waiting > 0 && <AutoRefresh seconds={5} />}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/candidates/upload">
            <ArrowLeftIcon data-icon="inline-start" />
            อัปโหลดเรซูเม่
          </Link>
        </Button>
      </div>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">ผลอัปโหลด {rows.length} ไฟล์</h1>
          <p className="text-sm text-muted-foreground">
            {first.uploaded_by_name ?? '-'} · {when(first.created_at)}
            {first.task_label ? ` · ผูกกับ ${first.task_label}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {failed > 0 && (
            <form action={retryUploadsAction}>
              <input type="hidden" name="batchId" value={batchId} />
              <Button type="submit" variant="outline">
                <RotateCcwIcon data-icon="inline-start" />
                อ่านใหม่ {failed} ไฟล์ที่อ่านไม่ได้
              </Button>
            </form>
          )}
          <Button asChild={saved > 0} disabled={saved === 0}>
            {saved > 0 ? (
              <a href={`/api/candidates/uploads/${batchId}/zip`}>
                <DownloadIcon data-icon="inline-start" />
                โหลด PDF ทั้งหมด {saved} คน (zip)
              </a>
            ) : (
              <span>
                <DownloadIcon data-icon="inline-start" />
                โหลด PDF ทั้งหมด (zip)
              </span>
            )}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'บันทึกแล้ว', n: saved },
          { label: 'รอเลือกข้อมูล', n: reviews.length },
          { label: 'อ่านไม่ได้', n: failed },
          { label: 'รออ่าน', n: waiting },
        ].map((s) => (
          <Card key={s.label} size="sm">
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl">{s.n}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      {waiting > 0 && <p className="text-sm text-muted-foreground">AI กำลังอ่าน ไฟล์ละราว 1–3 นาที หน้านี้อัปเดตเองทุก 5 วินาที</p>}

      {reviews.map((r) => <ReviewCard key={r.id} row={r} />)}

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ไฟล์</TableHead>
                <TableHead>สถานะ</TableHead>
                <TableHead>ผู้สมัคร</TableHead>
                <TableHead>เหตุ / ไฟล์ PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-64 truncate" title={r.file_name}>{r.file_name}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell>
                    {r.candidate_id ? (
                      <Link href={`/candidates/${r.candidate_id}`} className="underline-offset-4 hover:underline">
                        {r.candidate_name || r.parsed_name || 'เปิดดู'}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="min-w-56 whitespace-normal">
                    {r.status === 'failed' ? (
                      <span className="text-sm text-muted-foreground">{r.error}</span>
                    ) : (r.status === 'saved' || r.status === 'merged') && r.candidate_id ? (
                      <a href={`/api/candidates/${r.candidate_id}/pdf`} className="text-sm underline-offset-4 hover:underline">ดาวน์โหลด PDF</a>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
