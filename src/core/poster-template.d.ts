export const POSTER_TEMPLATE_ID: string;
export const POSTER_TEMPLATE_VERSION: number;
export const POSTER_BRAND_RULE_VERSION: number;
export const POSTER_CANVAS: number;
export const POSTER_LAYOUT_KEYS: Array<'photo' | 'logo' | 'title' | 'salary' | 'footer' | 'cta'>;
export const POSTER_LAYER_LABELS: Record<'photo' | 'logo' | 'title' | 'salary' | 'footer' | 'cta', string>;

export type PosterLayoutKey = (typeof POSTER_LAYOUT_KEYS)[number];
export type PosterLayoutOffset = { x: number; y: number };
export type PosterLayout = Record<PosterLayoutKey, PosterLayoutOffset>;
export type PosterLayerBox = PosterLayoutOffset & { id: PosterLayoutKey; label: string; w: number; h: number };

export function emptyPosterLayout(): PosterLayout;
export function normalizePosterLayout(raw: unknown): PosterLayout;
export function applyPosterLayoutDelta(layout: unknown, key: string, dx: number, dy: number): PosterLayout;
export function getPosterLayerBoxes(fields?: Record<string, unknown>): PosterLayerBox[];
export function withPosterTemplate<T extends Record<string, unknown>>(fields: T): T & {
  templateId: string;
  templateVersion: number;
  brandRuleVersion: number;
  logoVariant: 'people-navy' | 'so-red';
  layout: PosterLayout;
};
export function buildPosterSvg(fields: Record<string, unknown>, personUri?: string | null, logoUri?: string | null): string;
export function evaluatePosterVisual(fields: Record<string, unknown>): Array<{
  code: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}>;
