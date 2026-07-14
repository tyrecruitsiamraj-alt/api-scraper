'use client';

import { useEffect } from 'react';

// Opens the browser's print dialog once the page (and its images) have loaded,
// so the user lands directly on "Save as PDF". Also powers the manual button.
export function AutoPrint({ auto = true }: { auto?: boolean }) {
  useEffect(() => {
    if (!auto) return;
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      window.print();
    };
    // Wait for images (profile photo) so they appear in the PDF.
    const imgs = Array.from(document.images);
    const pending = imgs.filter((img) => !img.complete);
    if (pending.length === 0) {
      const t = setTimeout(fire, 300);
      return () => clearTimeout(t);
    }
    let left = pending.length;
    const onDone = () => { if (--left <= 0) setTimeout(fire, 150); };
    pending.forEach((img) => {
      img.addEventListener('load', onDone);
      img.addEventListener('error', onDone);
    });
    const safety = setTimeout(fire, 2500); // never hang if an image stalls
    return () => {
      clearTimeout(safety);
      pending.forEach((img) => {
        img.removeEventListener('load', onDone);
        img.removeEventListener('error', onDone);
      });
    };
  }, [auto]);

  return (
    <button
      onClick={() => window.print()}
      className="no-print fixed right-5 top-5 z-10 inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white shadow-lg hover:opacity-90"
    >
      ⬇ บันทึกเป็น PDF
    </button>
  );
}
