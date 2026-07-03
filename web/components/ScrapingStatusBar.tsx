'use client';

const PHASES = ['scraping', 'ocr', 'enrich'] as const;
type Phase = (typeof PHASES)[number];

const PHASE_SHORT: Record<Phase, string> = {
  scraping: 'ดึงข้อมูล',
  ocr: 'OCR',
  enrich: 'เติมข้อมูล',
};
const PHASE_LABEL: Record<Phase, string> = {
  scraping: 'กำลังดึงข้อมูลผู้สมัคร',
  ocr: 'กำลังอ่านเอกสารแนบด้วย AI (OCR)',
  enrich: 'กำลังทำความสะอาดและเติมข้อมูล Candidate',
};

type Props = {
  taskName: string;
  status: string;
  phase: string;
  got: number;
  target: number;
  updatedAt?: string | null;
};

export function ScrapingStatusBar({ taskName, status, phase, got, target, updatedAt }: Props) {
  const busy = status === 'running' || status === 'queued';
  if (!busy) return null;

  const staleSec = updatedAt ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 1000) : 0;
  const looksStuck = status === 'running' && staleSec > 180;

  const phaseIdx = PHASES.indexOf(phase as Phase);
  const withinPct = target > 0 ? Math.min(1, got / target) : status === 'queued' ? 0 : 0.35;
  const overallPct =
    status === 'queued'
      ? 2
      : Math.min(100, Math.round(((Math.max(0, phaseIdx) + withinPct) / PHASES.length) * 100));

  const stepNum = status === 'queued' ? 0 : phase === 'login' ? 0 : Math.max(1, phaseIdx + 1);

  const currentLabel =
    status === 'queued'
      ? 'รอเริ่มทำงาน…'
      : phase === 'login'
        ? 'กำลัง login เข้าแพลตฟอร์ม'
        : phaseIdx >= 0
          ? PHASE_LABEL[PHASES[phaseIdx]]
          : 'กำลังเตรียมงาน…';

  return (
    <div className="card overflow-hidden border-accent/20 shadow-md">
      <div className="border-b border-line/50 bg-accent/[0.04] px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/40" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">
                {status === 'queued' ? 'อยู่ในคิว' : 'กำลังทำงาน'} — {taskName}
              </p>
              <p className="text-xs text-subtle">
                ขั้นตอนที่ {stepNum} จาก {PHASES.length} · {currentLabel}
                {status === 'running' && target > 0 && (
                  <span className="ml-1 tabular-nums font-medium text-ink">
                    ({got}/{target})
                  </span>
                )}
                {looksStuck && (
                  <span className="ml-2 text-amber-700">
                    — ค้างนานกว่าปกติ ({Math.floor(staleSec / 60)} นาที) ระบบจะข้ามหรือเริ่มใหม่อัตโนมัติ
                  </span>
                )}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-accent">{overallPct}%</span>
        </div>
      </div>

      {/* step strip */}
      <div className="grid grid-cols-3 gap-0 border-b border-line/40 bg-white px-2 py-2 sm:px-4">
        {PHASES.map((p, idx) => {
          let state: 'done' | 'active' | 'pending';
          if (status === 'queued') state = idx === 0 ? 'active' : 'pending';
          else if (phaseIdx < 0) state = 'pending';
          else state = phaseIdx > idx ? 'done' : phaseIdx === idx ? 'active' : 'pending';

          return (
            <div key={p} className="flex flex-col items-center gap-1 px-1 text-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-colors ${
                  state === 'done'
                    ? 'bg-green-100 text-green-700'
                    : state === 'active'
                      ? 'bg-accent text-white shadow-sm'
                      : 'bg-black/5 text-subtle'
                }`}
              >
                {state === 'done' ? '✓' : idx + 1}
              </div>
              <span
                className={`text-[11px] leading-tight ${
                  state === 'active' ? 'font-semibold text-ink' : state === 'done' ? 'text-subtle' : 'text-subtle/50'
                }`}
              >
                {PHASE_SHORT[p]}
              </span>
            </div>
          );
        })}
      </div>

      {/* overall progress bar */}
      <div className="h-2 bg-black/[0.04]">
        <div
          className="h-full bg-gradient-to-r from-accent to-accent-hover transition-all duration-700 ease-out"
          style={{ width: `${overallPct}%` }}
        />
      </div>
    </div>
  );
}
