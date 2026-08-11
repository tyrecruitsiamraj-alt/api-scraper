export type QualityCheckStatus = 'pass' | 'warning' | 'fail' | 'not_applicable';
export type QualityCheck = {
  code: string;
  label: string;
  status: QualityCheckStatus;
  message: string;
  expected: string | null;
  actual: string | null;
};
export type ContentQualityResult = {
  status: 'pass' | 'warning' | 'fail';
  score: number;
  blocking: boolean;
  summary: string;
  checks: QualityCheck[];
  posterFields: Record<string, unknown> | null;
};
export function evaluateContentQuality(input?: {
  campaign?: Record<string, unknown>;
  caption?: string | null;
  posterFields?: Record<string, unknown> | null;
}): ContentQualityResult;
export function qualityFailureMessages(result: ContentQualityResult): string[];
