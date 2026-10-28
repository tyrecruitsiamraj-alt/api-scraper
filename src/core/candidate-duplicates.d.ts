export function phoneKey(phoneNorm: string | null | undefined): string;
export function emailKey(email: string | null | undefined): string;
export function groupDuplicateCandidates(
  rows: { id: string; phone_norm?: string | null; email_norm?: string | null; last_updated_at?: string | Date | null }[],
  maxShared?: number,
): { leaderOf: Map<string, string>; membersOf: Map<string, string[]>; hiddenIds: string[] };
