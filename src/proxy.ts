import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION } from "@/lib/sesion-constantes";

/**
 * Guard OPTIMISTA (Next 16: proxy, no middleware): solo mira si la cookie
 * existe — la validación real contra BD ocurre en el layout del panel y como
 * primera línea de cada action/handler (requerirSesion). Aquí nunca se toca
 * la BD.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/admin/ingreso") return NextResponse.next();

  const hayCookie = Boolean(request.cookies.get(COOKIE_SESION)?.value);
  if (hayCookie) return NextResponse.next();

  if (pathname.startsWith("/admin/api")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/ingreso", request.url));
}

export const config = { matcher: "/admin/:path*" };
