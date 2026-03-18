import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session extends DefaultSession {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    error?: string;
    user: {
      id: string;
      roles: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    access_token?: string;
    id_token?: string;
    refresh_token?: string;
    expires_in?: number;
    roles?: string[];
    error?: "RefreshAccessTokenError";
  }
}
