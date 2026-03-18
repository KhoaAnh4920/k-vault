import { jwtDecode } from "jwt-decode";
import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { auth0Service, Auth0UserError } from "./auth0Service";

const ROLES_CLAIM = "https://k-vault/roles";

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;
        try {
          const tokens = await auth0Service.login(
            credentials.email,
            credentials.password,
          );
          return {
            id: tokens.sub,
            email: tokens.email,
            name: tokens.name,
            image: tokens.picture,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            access_token: tokens.access_token,
            id_token: tokens.id_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
          } as never;
        } catch (err) {
          if (err instanceof Auth0UserError) {
            throw new Error(err.message);
          }
          throw new Error("Invalid email or password. Please try again.");
        }
      },
    }),
  ],

  session: { strategy: "jwt", maxAge: 24 * 60 * 60 },

  secret: process.env.NEXTAUTH_SECRET,

  pages: {
    signIn: "/login",
    error: "/login",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const u = user as any;
        token.access_token = u.access_token;
        token.id_token = u.id_token;
        token.refresh_token = u.refresh_token;
        token.expires_in = u.expires_in;

        if (u.id_token) {
          try {
            const decoded = jwtDecode<Record<string, unknown>>(u.id_token);
            const raw = (decoded[ROLES_CLAIM] as string[] | undefined) ?? [];
            token.roles = raw.map((r) => r.toLowerCase());
          } catch {
            token.roles = [];
          }
        }
        return token;
      }

      // skip refresh if token valid for >5min
      if (token.access_token) {
        try {
          const { exp } = jwtDecode<{ exp: number }>(token.access_token);
          if (exp && exp > Math.floor(Date.now() / 1000) + 300) {
            return token;
          }
        } catch {
          // fall through to refresh
        }
      }

      if (token.refresh_token) {
        try {
          const refreshed = await auth0Service.refreshAccessToken(
            String(token.refresh_token),
          );
          token.access_token = refreshed.access_token;
          token.id_token = refreshed.id_token;
          token.refresh_token = refreshed.refresh_token;
          token.expires_in = refreshed.expires_in;

          if (refreshed.id_token) {
            try {
              const decoded = jwtDecode<Record<string, unknown>>(
                refreshed.id_token,
              );
              const raw = (decoded[ROLES_CLAIM] as string[] | undefined) ?? [];
              token.roles = raw.map((r) => r.toLowerCase());
            } catch {
              /* keep previous roles */
            }
          }
          return token;
        } catch {
          return { ...token, error: "RefreshAccessTokenError" as const };
        }
      }

      return token;
    },

    async session({ session, token }) {
      session.access_token = token.access_token;
      session.id_token = token.id_token;
      session.refresh_token = token.refresh_token;
      if (token.sub) session.user.id = token.sub;
      session.user.roles = token.roles ?? [];
      if (token.error) session.error = token.error;
      return session;
    },
  },
};
