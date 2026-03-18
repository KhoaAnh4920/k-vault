import axios, { type AxiosError } from "axios";
import { jwtDecode } from "jwt-decode";

// 4xx errors with user-facing messages
export class Auth0UserError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "Auth0UserError";
  }
}

// strips "ErrorClass: " prefix from Auth0 error messages
function extractAuth0Message(err: AxiosError): string {
  const data = err.response?.data as Record<string, unknown> | undefined;
  const raw = typeof data?.message === "string" ? data.message : null;
  if (raw) {
    const colonIdx = raw.indexOf(": ");
    return colonIdx !== -1 ? raw.slice(colonIdx + 2) : raw;
  }
  return "An unexpected error occurred. Please try again.";
}

function logAuth0Error(context: string, err: unknown): void {
  if (axios.isAxiosError(err)) {
    const e = err as AxiosError;
    console.error(
      `[Auth0Service] ${context} — HTTP ${e.response?.status ?? "no-response"}:`,
      JSON.stringify(e.response?.data ?? e.message),
    );
  } else {
    console.error(`[Auth0Service] ${context}:`, err);
  }
}

const DOMAIN = process.env.AUTH0_DOMAIN!;
const CLIENT_ID = process.env.AUTH0_CLIENT_ID!;
const CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET!;
const AUDIENCE = process.env.AUTH0_AUDIENCE;
const MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID!;
const MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET!;

export interface LoginTokens {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

export interface Auth0UserClaims {
  sub: string;
  email: string;
  name: string;
  nickname: string;
  picture: string;
  email_verified: boolean;
  updated_at: string;
  [key: string]: unknown;
}

export type LoginResult = LoginTokens & Auth0UserClaims;

class Auth0Service {
  private mgmtToken: string | null = null;
  private mgmtTokenExpiry = 0;

  private get baseUrl(): string {
    return `https://${DOMAIN}`;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    try {
      const { data } = await axios.post<LoginTokens>(
        `${this.baseUrl}/oauth/token`,
        {
          grant_type: "password",
          username: email,
          password,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          scope: "openid profile email offline_access",
          ...(AUDIENCE ? { audience: AUDIENCE } : {}),
        },
        { headers: { "Content-Type": "application/json" } },
      );

      const decoded = jwtDecode<Auth0UserClaims>(data.id_token);
      return { ...data, ...decoded };
    } catch (err) {
      logAuth0Error("login", err);
      if (
        axios.isAxiosError(err) &&
        err.response?.status &&
        err.response.status < 500
      ) {
        throw new Auth0UserError(
          "Invalid email or password. Please try again.",
          err.response.status,
        );
      }
      throw err;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<{
    access_token: string;
    id_token: string;
    refresh_token: string;
    expires_in: number;
  }> {
    try {
      const { data } = await axios.post(
        `${this.baseUrl}/oauth/token`,
        {
          grant_type: "refresh_token",
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          refresh_token: refreshToken,
        },
        { headers: { "Content-Type": "application/json" } },
      );

      return {
        access_token: data.access_token,
        id_token: data.id_token,
        refresh_token: data.refresh_token ?? refreshToken,
        expires_in: data.expires_in,
      };
    } catch (err) {
      logAuth0Error("refreshAccessToken", err);
      throw err;
    }
  }

  async createUser(
    email: string,
    password: string,
    name: string,
  ): Promise<void> {
    try {
      const token = await this.getMgmtToken();
      await axios.post(
        `${this.baseUrl}/api/v2/users`,
        {
          email,
          password,
          name,
          connection: "Username-Password-Authentication",
          email_verified: false,
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
    } catch (err) {
      logAuth0Error("createUser", err);
      if (
        axios.isAxiosError(err) &&
        err.response?.status &&
        err.response.status < 500
      ) {
        throw new Auth0UserError(extractAuth0Message(err), err.response.status);
      }
      throw err;
    }
  }

  async checkEmailExists(email: string): Promise<boolean> {
    try {
      const token = await this.getMgmtToken();
      const { data } = await axios.get<unknown[]>(
        `${this.baseUrl}/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      return Array.isArray(data) && data.length > 0;
    } catch (err) {
      logAuth0Error("checkEmailExists", err);
      throw err;
    }
  }

  // cached M2M token for Management API calls
  private async getMgmtToken(): Promise<string> {
    if (this.mgmtToken && Date.now() < this.mgmtTokenExpiry) {
      return this.mgmtToken;
    }

    const mgmtAudience = `${this.baseUrl}/api/v2/`;

    try {
      const { data } = await axios.post(
        `${this.baseUrl}/oauth/token`,
        {
          grant_type: "client_credentials",
          client_id: MGMT_CLIENT_ID,
          client_secret: MGMT_CLIENT_SECRET,
          audience: mgmtAudience,
        },
        { headers: { "Content-Type": "application/json" } },
      );

      this.mgmtToken = data.access_token as string;
      this.mgmtTokenExpiry = Date.now() + data.expires_in * 1000 - 60_000;
      return this.mgmtToken;
    } catch (err) {
      logAuth0Error("getMgmtToken", err);
      throw err;
    }
  }
}

export const auth0Service = new Auth0Service();
