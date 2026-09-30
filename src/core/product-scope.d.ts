export const PRODUCT_MODULES: Readonly<{
  scraping: boolean;
  autopost: boolean;
  contentGeneration: boolean;
}>;
export const CONTENT_DISABLED_OPERATOR_MESSAGE: string;
export function isContentGenerationEnabled(): boolean;
export function isScrapingEnabled(): boolean;
export function isAutopostEnabled(): boolean;
export function productScopeSummary(): string;
