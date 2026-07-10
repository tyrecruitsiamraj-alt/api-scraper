// Auto-Post module inside the unified console. Embeds the AUTO-POST app (its own
// Express UI) in an iframe so users get ONE web where they choose Scraping or
// Auto-Post, behind the same Azure AD login. The AUTO-POST server runs on the
// worker host; set its URL via AUTOPOST_URL (defaults to localhost for dev).
export const dynamic = 'force-dynamic';

const AUTOPOST_URL = process.env.AUTOPOST_URL ?? 'http://localhost:3100';
// AUTO-POST's Express app gates access when AUTOPOST_ACCESS_TOKEN is set. Only this
// server-side page (behind Azure AD) knows the token; it hands it to the iframe once
// via ?access_token=, which the app swaps for an HttpOnly cookie. Public visitors to
// the AUTO-POST URL without the token are blocked. Keep the token server-side only.
const AUTOPOST_ACCESS_TOKEN = process.env.AUTOPOST_ACCESS_TOKEN ?? '';
const iframeSrc = AUTOPOST_ACCESS_TOKEN
  ? `${AUTOPOST_URL}?access_token=${encodeURIComponent(AUTOPOST_ACCESS_TOKEN)}`
  : AUTOPOST_URL;

export default function AutopostPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Auto-Post Facebook</h1>
          <p className="text-[13px] text-muted">โพสต์งานลงกลุ่ม Facebook + เก็บ lead — ระบบ AUTO-POST</p>
        </div>
        <a
          href={iframeSrc}
          target="_blank"
          rel="noreferrer"
          className="whitespace-nowrap rounded-full border border-line px-3.5 py-1.5 text-[13px] font-medium text-muted hover:bg-canvas hover:text-ink"
        >
          เปิดในแท็บใหม่ ↗
        </a>
      </div>
      <iframe
        src={iframeSrc}
        title="Auto-Post"
        className="w-full rounded-xl border border-line bg-white"
        style={{ height: 'calc(100vh - 12rem)' }}
      />
    </div>
  );
}
