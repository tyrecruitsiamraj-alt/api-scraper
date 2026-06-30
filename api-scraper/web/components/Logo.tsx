import Image from 'next/image';

/** SIAMRAJATHANEE (SO) brand lockup — shared with the CEO Dashboard. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <Image src="/logo-SO.webp" alt="SO — SIAMRAJATHANEE" width={40} height={40} className="h-9 w-auto" priority />
      <span className="font-semibold tracking-tight text-ink">
        So<span className="text-accent"> Recruit</span>
      </span>
    </span>
  );
}
