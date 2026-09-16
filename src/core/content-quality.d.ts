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
  imageReady?: boolean | null;
  researchGate?: {
    ready?: boolean;
    issues?: string[];
    googleEvidence?: number;
    facebookEvidence?: number;
  } | null;
}): ContentQualityResult;
export function qualityFailureMessages(result: ContentQualityResult): string[];
export const SELF_HEALING_QUALITY_CODES: Set<string>;
export function operatorBlockingFailures(result?: ContentQualityResult | null): QualityCheck[];
export function operatorFacingQuality<T extends ContentQualityResult | null | undefined>(result: T): T;
export function operatorCanApprove(result?: {
  blocking?: boolean;
  checks?: Array<{ code: string; status: string }>;
} | null, options?: {
  isPreview?: boolean;
  hasSourceImage?: boolean;
}): boolean;
