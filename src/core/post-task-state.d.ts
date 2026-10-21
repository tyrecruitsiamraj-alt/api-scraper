export type PostGroupStatus = 'posted' | 'failed' | 'not_member' | 'posting' | 'waiting' | 'skipped';

export type PostTaskGroup = {
  group_id: string;
  name: string;
  order: number;
  status: PostGroupStatus;
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
  post_link: string | null;
  approval: string | null;
  comments: number | null;
  reactions: number | null;
  shares: number | null;
  collected_at: string | null;
};

export type PostTaskCounts = {
  planned: number;
  posted: number;
  failed: number;
  posting: number;
  not_member: number;
  waiting: number;
  skipped: number;
};

export type PostTaskCurrent = { order: number; group_id: string; name: string } | null;

export function buildPostTaskGroups(input: {
  plan?: Array<{ group_id: string }>;
  attempts?: Array<{ group_id: string | null; level: string; kind?: string | null; message?: string | null; at: string }>;
  postLogs?: Array<Record<string, unknown>>;
  runStatus?: string;
  groupName?: (fbGroupId: string) => string;
}): { groups: PostTaskGroup[]; counts: PostTaskCounts; current: PostTaskCurrent };

export const POST_TASK_STEPS: string[];

export function postTaskStage(
  runStatus: string,
  counts?: Pick<PostTaskCounts, 'planned' | 'posted' | 'failed'>,
  current?: PostTaskCurrent,
): { step: number; state: 'active' | 'done' | 'failed'; label: string };
