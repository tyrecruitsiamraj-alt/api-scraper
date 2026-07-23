'use client';

export function PrintButton({ label = 'พิมพ์ / บันทึก PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn-sm rounded-full border border-line px-4 py-1.5 text-[12px] font-medium text-ink transition hover:border-accent/40 hover:text-accent print:hidden"
    >
      {label}
    </button>
  );
}
