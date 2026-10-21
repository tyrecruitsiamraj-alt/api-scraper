import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai } from 'next/font/google';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { Providers } from '@/components/Providers';
import './globals.css';

const thai = IBM_Plex_Sans_Thai({
  subsets: ['latin', 'thai'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'So Scraping',
  description: 'ระบบดึงข้อมูลผู้สมัครจากแพลตฟอร์มสรรหา',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolve the session per request and hand it to the client provider.
  const session = await getServerSession(authOptions);
  return (
    <html lang="th" className={thai.variable}>
      <body className="font-sans antialiased">
        <Providers session={session}>{children}</Providers>
      </body>
    </html>
  );
}
