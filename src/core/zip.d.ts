export function crc32(buf: Uint8Array): number;
export function readZipEntry(zip: Uint8Array, name: string): Buffer | null;
export function makeZip(files: { name: string; data: Uint8Array }[]): Buffer;
