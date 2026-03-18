import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PATHS = ["/upload", "/watch"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // no token or refresh failed → force re-login
    if (!token || token.error === "RefreshAccessTokenError") {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/auth).*)",
  ],
};
