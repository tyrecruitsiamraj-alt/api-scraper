export { default } from 'next-auth/middleware';

// Protect the app areas; the login page "/" and /api/auth stay public.
// Unauthenticated requests are redirected to the signIn page ("/").
// Include /autopost: without the matcher, Next still runs the page's DB
// queries while layout redirects, so the browser looks hung for 30–60s.
export const config = {
  matcher: [
    '/candidates/:path*',
    '/scraping/:path*',
    '/connectors/:path*',
    '/dashboard/:path*',
    '/orchestrator/:path*',
    '/settings/:path*',
    '/orders/:path*',
    '/autopost/:path*',
    '/workflow/:path*',
  ],
};
