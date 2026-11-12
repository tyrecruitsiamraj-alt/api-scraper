export const TEXT_FIELDS: { key: string; label: string }[];
export const LIST_FIELDS: { key: string; label: string }[];
export function listLines(key: string, value: unknown): string[];
export type CandidateDiffRow = { key: string; label: string; kind: 'text' | 'list'; current: string[]; incoming: string[] };
export function diffCandidate(current: Record<string, unknown> | null | undefined, incoming: Record<string, unknown> | null | undefined): CandidateDiffRow[];
