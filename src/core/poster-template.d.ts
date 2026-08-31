export const POSTER_TEMPLATE_ID: string;
export const POSTER_TEMPLATE_VERSION: number;
export const POSTER_BRAND_RULE_VERSION: number;
export function withPosterTemplate<T extends Record<string, unknown>>(fields: T): T & {
  templateId: string;
  templateVersion: number;
  brandRuleVersion: number;
  logoVariant: 'people-navy' | 'so-red';
};
export function buildPosterSvg(fields: Record<string, unknown>, personUri?: string | null, logoUri?: string | null): string;
export function evaluatePosterVisual(fields: Record<string, unknown>): Array<{
  code: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}>;
