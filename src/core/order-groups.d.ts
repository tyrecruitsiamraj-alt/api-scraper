export type GroupStatusKey = 'posted' | 'pending_approval' | 'declined' | 'removed' | 'failed' | 'not_tried_machine' | 'not_tried_account' | 'not_tried_unknown' | 'waiting';
export const GROUP_STATUSES: { key: GroupStatusKey; label: string }[];
export type OrderGroupResult = {
  fb_group_id: string;
  name: string;
  status: GroupStatusKey;
  at: string | null;
  account: string | null;
  error: string | null;
  post_link: string | null;
};
export function orderGroupResults(input: {
  planned?: string[];
  attempts?: { group_id: string | null; level: string; message: string | null; at: string; account?: string | null }[];
  postLogs?: { group_id: string | null; post_link: string | null; post_status: string | null; at: string; account?: string | null }[];
  active?: boolean;
  stop?: { code: string | null; reason: string | null } | null;
  groupName?: (fb: string) => string;
}): OrderGroupResult[];
export function countGroupStatuses(groups: OrderGroupResult[]): { total: number } & Record<GroupStatusKey, number>;
export function linkedCount(groups: OrderGroupResult[]): number;
export function notTriedStatus(stopCode: string | null | undefined): GroupStatusKey;
export function shortFailReason(message: string | null | undefined): string;
