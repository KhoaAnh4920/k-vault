/**
 * Thumbnail proxy — adds the bearer token server-side so the browser can load
 * thumbnails as plain <img src> tags (browsers can't set request headers for
 * img elements).
 */
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.access_token;

  const upstream = await fetch(`${API_BASE}/stream/${id}/thumbnail`, {
    headers: { Authorization: `Bearer ${token}` },
    // Avoid Next.js default caching so we respect the backend Cache-Control
    cache: "no-store",
  });

  if (!upstream.ok) {
    return new NextResponse(null, { status: upstream.status });
  }

  const blob = await upstream.arrayBuffer();
  return new NextResponse(blob, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
