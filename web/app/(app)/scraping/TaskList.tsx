'use client';

import type { TaskRow } from '@/lib/repo';
import {
  approveScrapeResultAction,
  deleteTaskAction,
  expandAdjacentTaskAction,
  queueTaskAction,
  toggleTaskAction,
  updateTaskCriteriaAction,
} from '@/lib/actions';
import { CheckIcon, ChevronDownIcon, PencilIcon, PlayIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

/*
 * ปุ่มและฟอร์มของงาน Scrap หนึ่งงาน ใช้บนหน้า /scraping/[taskId]
 * ทุกฟอร์มยังเรียก server action ตัวเดิม ด้วยชื่อช่องและ hidden input เดิม
 */

/** ปุ่ม "รันตอนนี้" */
export function TaskRunForm({
  task,
  disabled,
  alreadyComplete,
}: {
  task: TaskRow;
  disabled: boolean;
  alreadyComplete: boolean;
}) {
  return (
    <form action={queueTaskAction}>
      <input type="hidden" name="id" value={task.id} />
      <Button
        variant={disabled ? 'outline' : 'default'}
        disabled={disabled}
        title={task.connector_block_reason || undefined}
      >
        {alreadyComplete ? (
          <>
            <CheckIcon data-icon="inline-start" />
            ครบเป้าแล้ว
          </>
        ) : (
          <>
            <PlayIcon data-icon="inline-start" />
            รันตอนนี้
          </>
        )}
      </Button>
    </form>
  );
}

/** ปุ่มตรวจรับผล (งานจาก Jarvis ที่เสร็จแล้ว) */
export function TaskApproveForm({ taskId }: { taskId: string }) {
  return (
    <form action={approveScrapeResultAction}>
      <input type="hidden" name="taskId" value={taskId} />
      <Button>
        <CheckIcon data-icon="inline-start" />
        ยืนยันข้อมูลผู้สมัคร
      </Button>
    </form>
  );
}

/** แก้เกณฑ์การค้น มีผลรอบถัดไปที่กดรัน (ซ่อนตอนงานกำลังวิ่ง) */
export function TaskCriteriaEditor({ task }: { task: TaskRow }) {
  return (
    <Collapsible data-pause-refresh="1">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="group/trigger self-start">
          <PencilIcon data-icon="inline-start" />
          แก้เกณฑ์การค้น
          <ChevronDownIcon data-icon="inline-end" className="transition-transform group-data-[state=open]/trigger:rotate-180" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <form action={updateTaskCriteriaAction} className="mt-3 rounded-lg border p-3">
          <input type="hidden" name="id" value={task.id} />
          <FieldGroup className="gap-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field>
                <FieldLabel htmlFor={`ed-pos-${task.id}`}>ตำแหน่ง</FieldLabel>
                <Input id={`ed-pos-${task.id}`} name="position" defaultValue={String(task.criteria?.position ?? '')} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`ed-kw-${task.id}`}>คำค้น</FieldLabel>
                <Input id={`ed-kw-${task.id}`} name="keyword" defaultValue={String(task.criteria?.keyword ?? '')} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`ed-prov-${task.id}`}>จังหวัด</FieldLabel>
                <Input id={`ed-prov-${task.id}`} name="province" defaultValue={String(task.criteria?.province ?? '')} />
              </Field>
              <Field>
                <FieldLabel htmlFor={`ed-target-${task.id}`}>เป้า (คน)</FieldLabel>
                <Input id={`ed-target-${task.id}`} name="targetCount" type="number" min={1} defaultValue={task.target_count ?? ''} />
              </Field>
            </div>
            <FieldDescription>ลบข้อความในช่องออกถ้าจะเลิกใช้เกณฑ์นั้น มีผลตอนกด “รันตอนนี้” รอบถัดไป</FieldDescription>
            <Field orientation="horizontal">
              <Button variant="secondary" size="sm">บันทึกเกณฑ์</Button>
            </Field>
          </FieldGroup>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ExpandBtn({ taskId, position }: { taskId: string; position: string }) {
  return (
    <form action={expandAdjacentTaskAction}>
      <input type="hidden" name="id" value={taskId} />
      <input type="hidden" name="position" value={position} />
      <Button variant="outline" size="xs">
        <PlusIcon data-icon="inline-start" />
        {position}
      </Button>
    </form>
  );
}

/** แผน Job Family จาก AI: ตำแหน่งที่ขยายไปแล้ว (ใกล้มาก) และที่เสนอให้กดค้นเพิ่ม (ใกล้ปานกลาง/ใกล้น้อย) */
export function AdjacentPlanPanel({ task }: { task: TaskRow }) {
  const plan = task.adjacent_plan;
  if (!plan) return null;
  const green = plan.expanded_green ?? [];
  const yellow = plan.suggested?.yellow ?? [];
  const red = plan.suggested?.red ?? [];
  return (
    <div className="flex flex-col gap-2.5 rounded-lg bg-muted/50 p-3 text-sm leading-relaxed">
      <p className="font-medium">
        {String(plan.family_label ?? plan.family ?? 'Job Family').replace(/^\p{Extended_Pictographic}️?\s*/u, '')}
        {typeof plan.filled === 'number' && plan.target ? (
          <span className="ml-1 font-normal text-muted-foreground">· เติมได้ {plan.filled}/{plan.target}</span>
        ) : null}
      </p>
      {green.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">ขยายไปแล้ว (ใกล้มาก)</span>
          {green.map((g) => (
            <Badge key={g} variant="secondary">{g}</Badge>
          ))}
        </div>
      )}
      {yellow.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">ใกล้ปานกลาง กดเพื่อค้นเพิ่ม</span>
          {yellow.map((p) => <ExpandBtn key={p} taskId={task.id} position={p} />)}
        </div>
      )}
      {red.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">ใกล้น้อย กดเพื่อค้นเพิ่ม</span>
          {red.map((p) => <ExpandBtn key={p} taskId={task.id} position={p} />)}
        </div>
      )}
      {plan.reason && <p className="text-muted-foreground">{plan.reason}</p>}
    </div>
  );
}

/** เปิด/ปิดงาน และลบงาน (ถามยืนยันก่อนลบ) */
export function TaskManageActions({ task }: { task: TaskRow }) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={toggleTaskAction}>
        <input type="hidden" name="id" value={task.id} />
        <input type="hidden" name="enabled" value={(!task.enabled).toString()} />
        <Button variant="outline">{task.enabled ? 'ปิดงานนี้' : 'เปิดงานนี้'}</Button>
      </form>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive">
            <Trash2Icon data-icon="inline-start" />
            ลบงาน
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ลบงานนี้?</AlertDialogTitle>
            <AlertDialogDescription>
              ลบแล้วกู้คืนไม่ได้ ผู้สมัครที่ดึงมาแล้วยังค้นได้ในคลังผู้สมัคร แต่จะไม่ผูกกับงานนี้อีก
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <form action={deleteTaskAction}>
              <input type="hidden" name="id" value={task.id} />
              <Button variant="destructive" className="w-full">
                <Trash2Icon data-icon="inline-start" />
                ลบงาน
              </Button>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
