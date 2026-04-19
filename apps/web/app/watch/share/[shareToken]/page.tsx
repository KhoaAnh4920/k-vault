"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { videoApi, type Video } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Lock } from "lucide-react";

/**
 * Public share landing page for Unlisted videos (US3).
 * Accessible by anyone who has the share link — no auth required.
 * The share token is validated server-side.
 */
export default function SharePage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const router = useRouter();

  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!shareToken) return;
    videoApi
      .getByShareToken(shareToken)
      .then((v) => {
        setVideo(v);
        // Redirect to the normal watch page, passing the shareToken as a query param
        // so the stream/playlist endpoints can authenticate the UNLISTED access
        router.replace(`/watch/${v.id}?shareToken=${shareToken}`);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [shareToken, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Lock className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-bold mb-3">Link Unavailable</h1>
          <p className="text-muted-foreground mb-8">
            This share link is invalid or has been revoked by the owner.
          </p>
          <Button onClick={() => router.push("/")} variant="secondary" className="rounded-full">
            Go to Library
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="w-64 h-4 rounded" />
        <Skeleton className="w-40 h-3 rounded" />
        <p className="text-sm text-muted-foreground mt-2">
          {loading ? "Validating share link..." : "Redirecting..."}
        </p>
      </div>
    </div>
  );
}
