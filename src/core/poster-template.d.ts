export const POSTER_TEMPLATE_ID: string;
export const POSTER_TEMPLATE_VERSION: number;
export const POSTER_BRAND_RULE_VERSION: number;
export const POSTER_CANVAS: number;
export const POSTER_LAYOUT_KEYS: Array<'photo' | 'logo' | 'title' | 'salary' | 'footer' | 'cta'>;
export const POSTER_LAYER_LABELS: Record<'photo' | 'logo' | 'title' | 'salary' | 'footer' | 'cta', string>;
export const POSTER_CAMPAIGN_SOURCE: '__campaign_source__';
export const POSTER_MAX_EXTRAS: number;
export const POSTER_EXTRA_ORIGINS: Record<'operator_upload' | 'campaign_source' | 'operator_text', string>;

export type PosterLayoutKey = (typeof POSTER_LAYOUT_KEYS)[number];
export type PosterLayoutOffset = { x: number; y: number };
export type PosterLayout = Record<PosterLayoutKey, PosterLayoutOffset>;
export type PosterExtraOrigin = 'operator_upload' | 'campaign_source' | 'operator_text';
export type PosterExtraProvenance = {
  origin: PosterExtraOrigin;
  addedAt: string;
  addedBy?: string;
  filename?: string;
};
export type PosterExtra = {
  id: string;
  kind: 'image' | 'text';
  x: number;
  y: number;
  w: number;
  h: number;
  src?: string;
  text?: string;
  provenance: PosterExtraProvenance;
};
export type PosterLayerBox = PosterLayoutOffset & { id: string; label: string; w: number; h: number };

export function emptyPosterLayout(): PosterLayout;
export function emptyPosterExtras(): PosterExtra[];
export function normalizePosterLayout(raw: unknown): PosterLayout;
export function normalizePosterExtras(raw: unknown): PosterExtra[];
export function applyPosterLayoutDelta(layout: unknown, key: string, dx: number, dy: number): PosterLayout;
export function applyPosterFieldsDelta<T extends Record<string, unknown>>(fields: T, key: string, dx: number, dy: number): T & {
  layout: PosterLayout;
  extras: PosterExtra[];
};
export function createPosterImageExtra(input?: {
  src?: string;
  origin?: 'operator_upload' | 'campaign_source';
  filename?: string;
  addedBy?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}): PosterExtra | null;
export function createPosterTextExtra(input?: {
  text?: string;
  addedBy?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}): PosterExtra | null;
export function posterFieldsForQuality<T extends Record<string, unknown>>(fields?: T): T & {
  extras: PosterExtra[];
};
export function getPosterLayerBoxes(fields?: Record<string, unknown>): PosterLayerBox[];
export function withPosterTemplate<T extends Record<string, unknown>>(fields: T): T & {
  templateId: string;
  templateVersion: number;
  brandRuleVersion: number;
  logoVariant: 'people-navy' | 'so-red';
  layout: PosterLayout;
  extras: PosterExtra[];
};
export type PosterStandardExtra =
  | { kind: 'text'; x: number; y: number; w: number; h: number; text: string }
  | { kind: 'source_photo_slot'; x: number; y: number; w: number; h: number }
  | { kind: 'upload_slot'; x: number; y: number; w: number; h: number };
export type PosterStandard = {
  templateId: string;
  templateVersion: number;
  layout: PosterLayout;
  imageSide: 'left' | 'right';
  logoVariant: 'people-navy' | 'so-red';
  extras: PosterStandardExtra[];
};
export function posterStandardFromFields(fields?: Record<string, unknown>): PosterStandard;
export function normalizePosterStandard(raw: unknown): PosterStandard | null;
export function applyPosterStandard<T extends Record<string, unknown>>(fields: T, standard: unknown): T & {
  templateId: string;
  templateVersion: number;
  brandRuleVersion: number;
  logoVariant: 'people-navy' | 'so-red';
  layout: PosterLayout;
  extras: PosterExtra[];
};
export function posterStandardFingerprint(standard: unknown): string;
export function buildPosterSvg(fields: Record<string, unknown>, personUri?: string | null, logoUri?: string | null): string;
export function evaluatePosterVisual(fields: Record<string, unknown>): Array<{
  code: string;
  label: string;
  status: 'pass' | 'warning' | 'fail';
  message: string;
}>;
