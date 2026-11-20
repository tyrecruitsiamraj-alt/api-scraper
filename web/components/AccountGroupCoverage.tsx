import Link from 'next/link';
import { ExternalLinkIcon } from 'lucide-react';
import { listAccountGroupCoverage, listAccountGroups } from '@/lib/repo';
import type { AccountGroupCoverage as Coverage, GroupMembershipState } from '@/lib/repo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const ACCOUNT_STATUS: Record<Coverage['status'], string | null> = {
  ok: null,
  paused: 'ถูกพัก',
  verify: 'รอยืนยันตัวตน',
  retired: 'เลิกใช้โพสต์',
};

const STATE_LABEL: Record<GroupMembershipState, string> = {
  not_member: 'ยังไม่เข้า',
  unknown: 'เปิดแล้วไม่เจอปุ่มเข้าร่วม',
  questions: 'ต้องตอบคำถามเอง',
  pending: 'รอแอดมินอนุมัติ',
  visitor: 'โพสต์ได้ ยังไม่เข้า',
  unchecked: 'ยังไม่ได้เช็ก',
  member: 'เข้าแล้ว',
};

function when(iso: string | null) {
  if (!iso) return '-';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** บัญชี Facebook แต่ละบัญชีเข้าร่วมกลุ่มในระบบแล้วกี่กลุ่ม · กดชื่อบัญชีดูว่ากลุ่มไหนยังไม่เข้า (เจ้าของ 19 พ.ย. 2569) */
export async function AccountGroupCoverage({ accountId = '' }: { accountId?: string }) {
  const rows = await listAccountGroupCoverage();
  const picked = rows.find((r) => r.user_id === accountId) ?? null;
  const groups = picked ? await listAccountGroups(picked.user_id) : [];

  return (
    <section id="account-groups" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">บัญชีเข้าร่วมกลุ่มแล้วกี่กลุ่ม</h2>
      <Card>
        <CardHeader>
          <CardDescription>
            ระบบเปิดรายชื่อกลุ่มของแต่ละบัญชีวันละครั้ง และกดเข้าร่วมกลุ่มที่ยังไม่เข้าให้วันละ 3 กลุ่ม (บัญชีที่ถูกพักไม่ทำ)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>บัญชี</TableHead>
                <TableHead className="text-right">เข้าแล้ว</TableHead>
                <TableHead className="text-right">โพสต์ได้ ยังไม่เข้า</TableHead>
                <TableHead className="text-right">รออนุมัติ</TableHead>
                <TableHead className="text-right">ต้องตอบคำถาม</TableHead>
                <TableHead className="text-right">ยังไม่เข้า</TableHead>
                <TableHead className="text-right">ยังไม่ได้เช็ก</TableHead>
                <TableHead>เช็กรายชื่อกลุ่มล่าสุด</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">ยังไม่มีบัญชี Facebook</TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.user_id} data-state={r.user_id === accountId ? 'selected' : undefined}>
                  <TableCell>
                    <Link href={`/settings/posting?account=${encodeURIComponent(r.user_id)}#account-groups`} className="underline-offset-4 hover:underline">
                      {r.label}
                    </Link>
                    {ACCOUNT_STATUS[r.status] && <Badge variant="outline" className="ml-2">{ACCOUNT_STATUS[r.status]}</Badge>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.member} / {r.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.visitor}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pending}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.questions}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.not_member + r.unknown}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.unchecked}</TableCell>
                  <TableCell className="whitespace-nowrap">{r.list_checked_at ? when(r.list_checked_at) : 'ยังไม่เคย'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {picked && (
        <Card>
          <CardHeader>
            <CardTitle>กลุ่มของ {picked.label}</CardTitle>
            <CardDescription>
              เข้าแล้ว {picked.member} จาก {picked.total} กลุ่ม
              {picked.list_checked_at ? ` · เช็กรายชื่อล่าสุด ${when(picked.list_checked_at)}` : ' · ยังไม่เคยเช็กรายชื่อ ตัวเลขมาจากกลุ่มที่เคยโพสต์ได้'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>กลุ่ม</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>เหตุ</TableHead>
                  <TableHead>เช็กเมื่อ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g) => (
                  <TableRow key={g.fb_group_id}>
                    <TableCell className="min-w-48 whitespace-normal">
                      {g.group_name}
                      <div className="font-mono text-xs text-muted-foreground">{g.fb_group_id}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {STATE_LABEL[g.state]}
                      {g.from_posts && <span className="text-muted-foreground"> (เคยโพสต์ได้)</span>}
                    </TableCell>
                    <TableCell className="min-w-40 whitespace-normal text-muted-foreground">{g.note ?? '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{when(g.checked_at)}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm">
                        <a href={`https://www.facebook.com/groups/${g.fb_group_id}`} target="_blank" rel="noreferrer">
                          เปิด
                          <ExternalLinkIcon data-icon="inline-end" />
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
