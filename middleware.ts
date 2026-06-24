import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getAuthAdapter } from "@/lib/auth/types.js";

/** API 路由前缀——需要注入用户上下文 */
const PROTECTED_PREFIXES = ["/api/analyze", "/api/session"];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // 非 API 路由或不需要保护的 API 直接放行
  if (!PROTECTED_PREFIXES.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  const auth = getAuthAdapter();
  const session = await auth.getSession(request);

  // 开源版 NoopAuthAdapter 始终返回匿名用户，这里永远放行
  // 商业版 RealAuthAdapter 认证失败时返回 null，触发 401
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  // 将用户身份注入 request header，下游 API route 通过 headers 读取
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
