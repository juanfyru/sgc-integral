import { NextResponse, type NextRequest } from "next/server";
import { CABECERA_RUTA, COOKIE_SESION } from "@/lib/sesion-constantes";

/** Rutas alcanzables sin cookie de sesión. /api/salud lo usa el healthcheck del compose. */
export const RUTAS_PUBLICAS = ["/ingreso", "/api/salud", "/marca/logo"] as const;

function esPublica(pathname: string): boolean {
  return RUTAS_PUBLICAS.some((r) => pathname === r || pathname.startsWith(`${r}/`));
}

/**
 * Guard OPTIMISTA global (Next 16: proxy, no middleware): solo mira si la
 * cookie existe — la validación real contra BD ocurre en los layouts de grupo
 * y como primera línea de cada action/handler (requerirSesion). Aquí nunca se
 * toca la BD. Importa solo sesion-constantes para no arrastrar la BD al proxy.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/admin/ingreso") {
    return NextResponse.redirect(new URL("/ingreso", request.url));
  }
  if (esPublica(pathname)) return NextResponse.next();
  if (request.cookies.get(COOKIE_SESION)?.value) {
    // Reenvía la ruta pedida a los layouts (que no la conocen) para conservar
    // `volver` en los pasos obligatorios de la cuenta. Siempre se sobrescribe.
    const cabeceras = new Headers(request.headers);
    cabeceras.set(CABECERA_RUTA, pathname + search);
    return NextResponse.next({ request: { headers: cabeceras } });
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/admin/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const destino = new URL("/ingreso", request.url);
  if (pathname !== "/") destino.searchParams.set("volver", pathname + search);
  return NextResponse.redirect(destino);
}

// El matcher debe ser una constante literal (Next lo analiza estáticamente).
// El punto va como [.]: Next deja el `.` sin escapar y `\.` haría coincidir
// cualquier carácter (p. ej. /procesos/apoyo-diagnostico quedaba fuera del proxy).
// Una URL de archivo del portal con nombre cosmético .png/.svg queda fuera del
// proxy: la protege el 401 del handler.
// Las rutas que reciben el cuerpo de una subida también van fuera: con proxy, Next copia el
// cuerpo en memoria y pasados 10 MB entrega solo esa parte, sin error. Sus handlers responden 401.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon[.]ico|admin/api/archivos$|api/tramites/[0-9]+/archivos$|api/socializaciones/[0-9]+/archivos$|api/verificaciones/[0-9]+/items/[0-9]+/archivos$|api/externos/[0-9]+/archivos$|api/normas/[0-9]+/archivos$|api/hallazgos/[0-9]+/archivos$|api/mediciones/[0-9]+/archivos$|api/importaciones-indicadores/[0-9]+/archivo$|.*[.](?:png|jpg|jpeg|webp|svg|ico|woff2?)$).*)",
  ],
};
