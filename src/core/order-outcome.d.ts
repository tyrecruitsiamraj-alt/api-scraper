export type OrderOutcomeKey = 'waiting' | 'working' | 'done' | 'partial' | 'failed';
export const OUTCOMES: { key: OrderOutcomeKey; label: string }[];
export function orderOutcome(o: {
  type: 'content' | 'scraping';
  jarvis_status: string;
  run_status?: string | null;
  posted_groups?: number;
  task_status?: string | null;
  got?: number | null;
}): { outcome: OrderOutcomeKey; stage: string };
