export type WorkflowCheck = {
  code: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
};
export type WorkflowReadiness = {
  status: 'ready' | 'degraded' | 'blocked';
  score: number;
  summary: string;
  checks: WorkflowCheck[];
};
export function evaluateWorkflowReadiness(input?: {
  requiredBuildSha?: string;
  workers?: Array<{ name?: string; kind?: string; online?: boolean; meta?: Record<string, unknown> | null }>;
  facebookAccounts?: Array<{ group_count?: number }>;
  queue?: { queued?: number; oldest_queued_minutes?: number | null; stale_running?: number; stalled_progress?: number; errors_24h?: number };
  postQueue?: { queued?: number; running?: number; failed_24h?: number };
  contentOutput?: { passing_with_image?: number; verified_generation?: number; failed_quality?: number };
  scrapeOutput?: { completed?: number; partial?: number; error?: number };
  recentPostRuns?: Array<{ status?: string; mode?: string }>;
  inconsistentCampaigns?: number;
  lastSelftest?: { status?: string; finished_at?: string | null; last_error?: string | null } | null;
}): WorkflowReadiness;
