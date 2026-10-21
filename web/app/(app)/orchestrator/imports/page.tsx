import Link from 'next/link';
import { ArrowLeftIcon } from 'lucide-react';
import { listConnectorOptions, listSoRecruitPostingRequests } from '@/lib/repo';
import { rejectRequestAction, startCampaignAction, startSoRecruitScrapeAction } from '@/lib/actions';
import { CONTENT_DISABLED_OPERATOR_MESSAGE, isContentGenerationEnabled, productScopeSummary } from '@/lib/product-scope';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const dynamic = 'force-dynamic';

function fmtDate(v: string | null): string {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', year: '2-digit' });
  } catch {
    return String(v);
  }
}

export default async function ImportsPage() {
  const [reqs, connectors] = await Promise.all([listSoRecruitPostingRequests(), listConnectorOptions()]);
  const contentEnabled = isContentGenerationEnabled();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2.5">
          <Link href="/orchestrator">
            <ArrowLeftIcon data-icon="inline-start" />
            ศูนย์งาน
          </Link>
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">คำขอจาก So Recruit</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          ขอบเขตระบบ: {productScopeSummary()}. คำขอค้นหาผู้สมัคร เลือกบัญชีแล้วกดเริ่มได้ · คำขอสร้างประกาศ{contentEnabled ? 'ให้ AI ช่วยร่าง' : 'ไม่รับแล้ว ให้ตีกลับ'}
        </p>
      </div>

      {!contentEnabled && (
        <Alert role="status">
          <AlertDescription>{CONTENT_DISABLED_OPERATOR_MESSAGE}</AlertDescription>
        </Alert>
      )}

      {reqs.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>ยังไม่มีคำขอใหม่จาก So Recruit</EmptyTitle>
            <EmptyDescription>ทีม matching จะส่งคำขอมาเมื่อหาคนใน pool ไม่พอ</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">เลขใบขอ</TableHead>
                <TableHead>ประเภท</TableHead>
                <TableHead>ตำแหน่ง/เหตุผล</TableHead>
                <TableHead>ไซต์/จังหวัด</TableHead>
                <TableHead>ผู้ขอ</TableHead>
                <TableHead>วันที่ขอ</TableHead>
                <TableHead className="pr-4 text-right">จัดการ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reqs.map((r) => (
                <TableRow key={r.request_no}>
                  <TableCell className="pl-4 font-medium">{r.request_no}</TableCell>
                  <TableCell>
                    <Badge variant={r.request_type === 'scraping' ? 'secondary' : 'outline'}>
                      {r.request_type === 'scraping' ? 'ค้นหาผู้สมัคร' : 'สร้างประกาศ'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.erp_title ? (
                      <span>{r.erp_title}</span>
                    ) : (
                      <span className="text-muted-foreground">{r.reason || '—'}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.erp_province || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{r.requested_by_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.created_at)}</TableCell>
                  <TableCell className="pr-4 text-right">
                    {r.request_type === 'scraping' ? (
                      <form action={startSoRecruitScrapeAction} className="ml-auto flex max-w-72 items-center justify-end gap-2">
                        <input type="hidden" name="requestNo" value={r.request_no} />
                        <NativeSelect name="connectorId" required defaultValue="" size="sm" className="min-w-36" aria-label="บัญชีที่ใช้ค้นหา">
                          <NativeSelectOption value="" disabled>เลือกบัญชีที่ใช้ค้นหา</NativeSelectOption>
                          {connectors.map((connector) => (
                            <NativeSelectOption key={connector.id} value={connector.id} disabled={!connector.available}>
                              {connector.platform} · {connector.label}
                              {connector.available ? '' : ` (ยังใช้ไม่ได้: ${connector.block_reason})`}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                        <Button size="sm" className="shrink-0" disabled={!connectors.some((connector) => connector.available)}>
                          เริ่มค้นหาผู้สมัคร
                        </Button>
                      </form>
                    ) : contentEnabled ? (
                      <form action={startCampaignAction} className="inline">
                        <input type="hidden" name="requestNo" value={r.request_no} />
                        <Button size="sm">เริ่มสร้างประกาศ</Button>
                      </form>
                    ) : (
                      <form action={rejectRequestAction} className="inline-flex items-center gap-2">
                        <input type="hidden" name="requestNo" value={r.request_no} />
                        <input type="hidden" name="requestType" value={r.request_type} />
                        <input type="hidden" name="reason" value={CONTENT_DISABLED_OPERATOR_MESSAGE} />
                        <Button variant="secondary" size="sm">ตีกลับ (ไม่รับสร้างประกาศ)</Button>
                      </form>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
