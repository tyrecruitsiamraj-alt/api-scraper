import type { NextAuthOptions } from 'next-auth';
import AzureADProvider from 'next-auth/providers/azure-ad';

/**
 * NextAuth (Azure AD / Entra ID) config.
 *
 * Session isolation notes (important):
 *  - strategy 'jwt' → the session lives in a signed, httpOnly cookie scoped to
 *    the browser; there is no server-side shared session store to cross-pollute.
 *  - the jwt/session callbacks only ever read/write the per-call token & session
 *    objects (never a module-level variable), so one user's identity can never
 *    leak into another's request.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID ?? '',
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET ?? '',
      tenantId: process.env.AZURE_AD_TENANT_ID,
      authorization: { params: { scope: 'openid profile email User.Read' } },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 8 * 60 * 60 }, // 8h
  pages: { signIn: '/' },
  callbacks: {
    async jwt({ token, profile, account }) {
      // Populate identity only at sign-in; afterwards just pass the token through.
      if (account && profile) {
        token.oid = (profile as Record<string, unknown>).oid as string | undefined;
        token.name = profile.name ?? token.name;
        token.email = (profile as Record<string, unknown>).email as string | undefined ?? token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.oid as string) ?? token.sub ?? '';
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
