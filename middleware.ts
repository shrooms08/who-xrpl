import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  // Live, per-request screens must never be served stale from an HTTP/disk
  // cache. (bfcache is handled separately by a pageshow handler on the client.)
  const path = request.nextUrl.pathname;
  if (path.startsWith("/game/") || path.startsWith("/lobby/")) {
    response.headers.set(
      "Cache-Control",
      "no-store, no-cache, max-age=0, must-revalidate",
    );
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
