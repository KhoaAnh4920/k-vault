"use client";
// Clears stale session cookie when token refresh fails, preventing zombie avatar.
import { useSession, signOut } from "next-auth/react";
import { useEffect } from "react";

export default function SessionGuard() {
  const { data: session } = useSession();

  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      signOut({ callbackUrl: "/login" });
    }
  }, [session?.error]);

  return null;
}
