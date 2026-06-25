import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthAdapter } from "@/lib/auth/types.js";

/** API 路由前缀——需要注入用户上下文 */
const PROTECTED_PREFIXES = ["/api/analyze", "/api/session"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 非 API 路由直接放行
  if (!PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  // 如果上游（SaaS 代理）已经注入了 x-user-id，直接信任放行
  const proxiedUserId = request.headers.get("x-user-id");
  if (proxiedUserId) {
    const headers = new Headers(request.headers);
    // 确保 x-user-role 也有默认值
    if (!headers.get("x-user-role")) {
      headers.set("x-user-role", "user");
    }
    return NextResponse.next({ request: { headers } });
  }

  // 独立运行时：NoopAuthAdapter 返回匿名用户，始终放行
  const auth = getAuthAdapter();
  const session = await auth.getSession(request);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-user-id", session.user.id);
  requestHeaders.set("x-user-role", session.user.role);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/api/:path*"],
};
