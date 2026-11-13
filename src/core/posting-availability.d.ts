export type PostingAvailability = {
  can_order: boolean;
  orderable_accounts: number;
  room_today: number;
  counts: Record<string, number>;
  next_available_at: string | null;
  message: string | null;
};
export function postingAvailability(
  accounts: { status: string; remaining_today: number; paused_until: string | null; pause_reason?: string | null }[],
  now?: number,
): PostingAvailability;
