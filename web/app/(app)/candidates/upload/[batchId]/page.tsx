import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeftIcon, DownloadIcon, RotateCcwIcon } from 'lucide-react';
import { AutoSubmitSelect } from '@/components/AutoSubmitSelect';
import { AutoRefresh } from '@/components/AutoRefresh';
import { PdfDownloadButton } from '@/components/PdfDownloadButton';
import { listResumeTemplates } from '@/lib/resume-templates';
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

const fileUrl = (batchId: string, uploadId: string) => `/api/candidates/uploads/${batchId}/files/${uploadId}`;

/**
 * ไฟล์ที่อ่านไม่ได้: โชว์ไฟล์ต้นฉบับคู่กับตัวหนังสือที่อ่านได้ ให้เห็นว่าทำไมไม่ผ่าน
 * (เจ้าของ 19 พ.ย. 2569: อัปรูปแล้วขึ้นอ่านไม่ได้ ไม่มีตัวอย่างให้ดู)
 */
function FailedFileCard({ batchId, row }: { batchId: string; row: UploadRow }) {
  const url = fileUrl(batchId, row.id);
  const mime = String(row.mime ?? '').toLowerCase();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="truncate" title={row.file_name}>{row.file_name}</CardTitle>
        <CardDescription>{row.error}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">ไฟล์ที่อัปโหลด</span>
          <div className="overflow-hidden rounded-xl border bg-muted">
            {mime === 'application/pdf' ? (
              <iframe src={url} className="h-[60vh] w-full" title={row.file_name} />
            ) : mime.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={row.file_name} className="mx-auto max-h-[60vh]" />
            ) : (
              <p className="p-4 text-sm text-muted-foreground">
                แสดงตัวอย่างไฟล์ชนิดนี้ไม่ได้ <a href={url} className="underline underline-offset-4">ดาวน์โหลดไฟล์</a>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">ตัวหนังสือที่อ่านได้จากไฟล์</span>
          {row.read_text ? (
            <pre className="max-h-[60vh] overflow-auto rounded-xl border bg-muted p-3 font-sans text-sm whitespace-pre-wrap">{row.read_text}</pre>
          ) : (
            <p className="rounded-xl border bg-muted p-3 text-sm text-muted-foreground">
              ไม่มีตัวหนังสือที่อ่านได้ · ไฟล์ที่อ่านก่อน 19 พ.ย. 2569 ระบบยังไม่ได้เก็บไว้ กด &ldquo;อ่านใหม่&rdquo; ด้านบนเพื่อดู
            </p>
          )}
        </div>
      </CardContent>
    </Card>
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

export default async function UploadBatchPage(props: { params: Promise<{ batchId: string }>; searchParams?: Promise<{ form?: string }> }) {
  const { batchId } = await props.params;
  const formParam = String((await props.searchParams)?.form ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const [rows, allTemplates] = await Promise.all([getUploadBatch(batchId), listResumeTemplates()]);
  if (!rows.length) notFound();
  const templates = allTemplates.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault }));
  // แบบฟอร์มที่เลือกตอนอัปโหลด (?form=) · ไม่มี = แบบเริ่มต้น · เปลี่ยนได้ที่หัวหน้านี้
  const chosen = templates.find((t) => t.id === formParam) ?? templates.find((t) => t.isDefault) ?? templates[0];
  const pdfUrl = (candidateId: string) => `/api/candidates/${candidateId}/pdf${chosen ? `?template=${encodeURIComponent(chosen.id)}` : ''}`;

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
          {templates.length > 1 && (
            <form method="get" className="w-56" aria-label="แบบฟอร์ม Resume">
              <AutoSubmitSelect
                id="batch-form"
                name="form"
                defaultValue={chosen?.id ?? ''}
                options={templates.map((t) => ({ value: t.id, label: `แบบฟอร์ม: ${t.name}` }))}
              />
            </form>
          )}
          <PdfDownloadButton
            href={`/api/candidates/uploads/${batchId}/zip`}
            label={saved > 0 ? `โหลด Resume ทั้งหมด ${saved} คน (zip)` : 'โหลด Resume ทั้งหมด (zip)'}
            templates={chosen ? [chosen] : templates}
            disabled={saved === 0}
          />
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
                <TableHead>Resume / เหตุ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-64 truncate" title={r.file_name}>
                    <a href={fileUrl(batchId, r.id)} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{r.file_name}</a>
                  </TableCell>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" asChild>
                          <a href={pdfUrl(r.candidate_id)}>
                            <DownloadIcon data-icon="inline-start" />
                            ดาวน์โหลด Resume
                          </a>
                        </Button>
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/candidates/${r.candidate_id}/edit`}>แก้ข้อมูล</Link>
                        </Button>
                      </div>
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

      {rows.filter((r) => r.status === 'failed').map((r) => <FailedFileCard key={r.id} batchId={batchId} row={r} />)}
    </div>
  );
}
