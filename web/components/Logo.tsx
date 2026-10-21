import Image from 'next/image';
import { cn } from '@/lib/utils';

/** SIAMRAJATHANEE (SO) brand lockup — shared with the CEO Dashboard. */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <Image src="/logo-SO.webp" alt="SO SIAMRAJATHANEE" width={40} height={40} className="h-9 w-auto" priority />
      <span className="font-semibold text-foreground">
        So<span className="text-primary"> Scraping</span>
      </span>
    </span>
  );
}
