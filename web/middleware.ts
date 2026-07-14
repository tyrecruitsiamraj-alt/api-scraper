export { default } from 'next-auth/middleware';

// Protect the app areas; the login page "/" and /api/auth stay public.
// Unauthenticated requests are redirected to the signIn page ("/").
export const config = {
  matcher: ['/candidates/:path*', '/scraping/:path*', '/connectors/:path*', '/dashboard/:path*', '/orchestrator/:path*'],
};
