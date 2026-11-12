export class ResumeReadError extends Error {}
export const MAX_FILE_BYTES: number;
export const MAX_FILES: number;
export const MIN_TEXT_CHARS: number;
export function fileKind(name: string | null | undefined, mime?: string | null): 'pdf' | 'docx' | 'doc' | 'image' | null;
export function docxText(buffer: Uint8Array): string;
