import { ExternalLinkIcon } from 'lucide-react';
import { dismissCommentLeadAction, replyCommentLeadAction } from '@/lib/actions';
import { jarvisLeadsConfigured, listCommentLeads } from '@/lib/comment-leads';
import type { CommentLead } from '@/lib/comment-leads';
import { AutopostNav } from '@/components/AutopostNav';
import { LeadCallTable } from '@/components/post/LeadCallTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<string, string> = { phone: 'ฝากเบอร์', interest: 'สนใจ', question: 'คำถาม', other: 'อื่น ๆ' };

function thaiTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function ReplyStatus({ lead }: { lead: CommentLead }) {
  if (lead.replied_at) return <Badge variant="outline" className="border-success/30 bg-success/10 text-success">ตอบแล้ว</Badge>;
  if (lead.reply_error) return <Badge variant="destructive" title={lead.reply_error}>ตอบไม่สำเร็จ</Badge>;
  if (lead.reply_text) return <Badge variant="outline">รอโพสต์คำตอบ</Badge>;
  if (lead.needs_human) return <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">ต้องตอบเอง</Badge>;
  return <span className="text-muted-foreground">-</span>;
}

function NeedsReplyCard({ lead }: { lead: CommentLead }) {
  const id = `reply-${lead.id}`;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{lead.commenter_name}</CardTitle>
        <CardDescription>
          {[lead.request_no, lead.group_name, thaiTime(lead.first_seen_at)].filter(Boolean).join(' · ')}
        </CardDescription>
        <CardAction>
          <Badge variant="outline">{KIND_LABEL[lead.kind ?? ''] ?? '-'}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">{lead.comment_text || '(ไม่มีข้อความ)'}</p>
        {lead.comment_url && (
          <Button asChild variant="link" size="sm" className="self-start px-0">
            <a href={lead.comment_url} target="_blank" rel="noreferrer">
              เปิดคอมเมนต์บน Facebook
              <ExternalLinkIcon data-icon="inline-end" />
            </a>
          </Button>
        )}
        <form action={replyCommentLeadAction} className="flex flex-col gap-2">
          <input type="hidden" name="id" value={lead.id} />
          <Field>
            <FieldLabel htmlFor={id}>คำตอบ (ระบบโพสต์ใต้คอมเมนต์ให้ในรอบเก็บคอมเมนต์ถัดไป)</FieldLabel>
            <Textarea id={id} name="reply" rows={3} maxLength={1000} required />
          </Field>
          <Button size="sm" className="self-start">บันทึกคำตอบ</Button>
        </form>
      </CardContent>
      <CardFooter>
        <form action={dismissCommentLeadAction}>
          <input type="hidden" name="id" value={lead.id} />
          <Button variant="ghost" size="sm">ไม่ต้องตอบคอมเมนต์นี้</Button>
        </form>
      </CardFooter>
    </Card>
  );
}

// คนที่คอมเมนต์ใต้โพสต์รับสมัคร: ตอบเองไม่ได้ให้คนตอบ, ฝากเบอร์แล้วเลือกส่ง AI โทร
export default async function CommentLeadsPage(props: { searchParams?: Promise<{ notice?: string; request?: string }> }) {
  const searchParams = await props.searchParams;
  const notice = typeof searchParams?.notice === 'string' ? searchParams.notice : null;
  const requestNo = typeof searchParams?.request === 'string' && searchParams.request ? searchParams.request : null;
  const all = await listCommentLeads({ requestNo, limit: 500 });
  const requestNos = [...new Set((requestNo ? all : await listCommentLeads({ limit: 1000 })).map((l) => l.request_no).filter(Boolean))] as string[];
  const needsReply = all.filter((l) => l.needs_human && !l.reply_text && !l.replied_at);
  const withPhone = all.filter((l) => l.phone);
  const replied = all.filter((l) => l.replied_at).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">คนคอมเมนต์</h1>
        <p className="text-sm text-muted-foreground">
          ระบบเก็บคอมเมนต์ใต้โพสต์ทุก 2 ชั่วโมง ตอบให้เองเมื่อคนฝากเบอร์หรือบอกว่าสนใจ ส่วนคำถามรอให้คนตอบที่นี่
        </p>
      </div>

      <AutopostNav />

      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {!jarvisLeadsConfigured() && (
        <Alert>
          <AlertDescription>
            ยังไม่ได้เชื่อม API ของ Jarvis: กดส่ง AI โทรได้ ระบบจะเก็บรายชื่อไว้ "รอส่ง Jarvis" และส่งให้เมื่อเชื่อมแล้ว
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ['คอมเมนต์ทั้งหมด', all.length],
          ['ฝากเบอร์', withPhone.length],
          ['ต้องตอบเอง', needsReply.length],
          ['ตอบแล้ว', replied],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {requestNos.length > 1 && (
        <form className="flex flex-wrap items-end gap-2">
          <Field className="w-auto">
            <FieldLabel htmlFor="request">ใบงาน</FieldLabel>
            <NativeSelect id="request" name="request" defaultValue={requestNo ?? ''}>
              <NativeSelectOption value="">ทุกใบงาน</NativeSelectOption>
              {requestNos.map((no) => (
                <NativeSelectOption key={no} value={no}>{no}</NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Button variant="outline" size="sm">กรอง</Button>
        </form>
      )}

      {all.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>ยังไม่มีคอมเมนต์ที่เก็บได้</EmptyTitle>
            <EmptyDescription>ตัวเก็บคอมเมนต์รันบนเครื่อง RM009 พร้อมสวิตช์ Autopost ทุก 2 ชั่วโมง</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Tabs defaultValue={needsReply.length ? 'needs' : withPhone.length ? 'phone' : 'all'}>
          <TabsList>
            <TabsTrigger value="needs">ต้องตอบเอง {needsReply.length}</TabsTrigger>
            <TabsTrigger value="phone">ฝากเบอร์ {withPhone.length}</TabsTrigger>
            <TabsTrigger value="all">ทั้งหมด {all.length}</TabsTrigger>
          </TabsList>
          <TabsContent value="needs" className="mt-3 flex flex-col gap-3">
            {needsReply.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>ไม่มีคอมเมนต์ที่ต้องตอบเอง</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              needsReply.map((l) => <NeedsReplyCard key={l.id} lead={l} />)
            )}
          </TabsContent>
          <TabsContent value="phone" className="mt-3">
            {withPhone.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>ยังไม่มีคนฝากเบอร์</EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <LeadCallTable leads={withPhone} />
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>คอมเมนต์</TableHead>
                  <TableHead>ชนิด</TableHead>
                  <TableHead>การตอบ</TableHead>
                  <TableHead className="hidden lg:table-cell">ใบงาน · กลุ่ม</TableHead>
                  <TableHead className="hidden md:table-cell">เวลา</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {all.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.commenter_name}</TableCell>
                    <TableCell className="max-w-72 truncate text-muted-foreground" title={l.comment_text ?? ''}>
                      {l.comment_url ? (
                        <a href={l.comment_url} target="_blank" rel="noreferrer" className="hover:underline">{l.comment_text || '-'}</a>
                      ) : (
                        l.comment_text || '-'
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{KIND_LABEL[l.kind ?? ''] ?? '-'}</Badge></TableCell>
                    <TableCell><ReplyStatus lead={l} /></TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {[l.request_no, l.group_name].filter(Boolean).join(' · ') || '-'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">{thaiTime(l.first_seen_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
