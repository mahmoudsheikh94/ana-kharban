import { adminCookieName, isValidAdminCookie } from "@/lib/auth/admin";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtectedRoute =
    pathname === "/" ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/permits") ||
    pathname.startsWith("/map") ||
    pathname.startsWith("/abuse");

  if (!isProtectedRoute) {
    return NextResponse.next();
  }

  const isAuthenticated = await isValidAdminCookie(request.cookies.get(adminCookieName)?.value);

  if (!isAuthenticated) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dashboard/:path*", "/reports/:path*", "/permits/:path*", "/map/:path*", "/abuse/:path*"]
};
