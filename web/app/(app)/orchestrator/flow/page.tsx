import Link from 'next/link';
import { OrchestratorFlowBoard } from '@/components/OrchestratorFlowBoard';

export const dynamic = 'force-dynamic';

export default function OrchestratorFlowMockPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">การไหลของใบงาน</h1>
            <span className="pill bg-amber-50 text-amber-800">MOCK DATA</span>
          </div>
          <p className="text-sm text-subtle">กดกล่องในลูปการทำงานเพื่อดูเฉพาะใบงานในขั้นนั้น</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/orchestrator" className="btn-ghost btn-sm">
            ← ภาพรวมจริง
          </Link>
          <Link href="/orchestrator/imports" className="btn-secondary btn-sm">
            ใบขอ ERP
          </Link>
        </div>
      </div>

      <OrchestratorFlowBoard />

      <p className="text-center text-xs text-subtle">
        mockup — ต่อไปจะดึงจาก <code className="text-[11px]">recruit_campaigns</code> จริง
      </p>
    </div>
  );
}
