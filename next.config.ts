import type { NextConfig } from "next";

// CSP restrictiva: la intranet no carga NADA externo (el NAS no tiene internet).
// 'unsafe-inline' en style-src es requerido por los estilos inline de Next/Tailwind.
const esDesarrollo = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  // unsafe-eval SOLO en desarrollo: el overlay de errores de Next lo necesita.
  // En producción React nunca usa eval y la política queda estricta.
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'self'", // vista previa de PDF embebida
  "frame-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Otros equipos de la red (un celular) que pueden abrir `next dev`: solo nombres de host o IP, sin esquema ni
// puerto, separados por coma (`DEV_ORIGENES=192.168.20.104`). Sin la variable, el cliente de desarrollo no logra
// conectar su WebSocket desde otro origen, recarga la página sin parar y nada interactivo funciona. No afecta a
// producción: la opción solo existe en desarrollo.
const origenesDev = (process.env.DEV_ORIGENES ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  output: "standalone",
  ...(origenesDev.length > 0 ? { allowedDevOrigins: origenesDev } : {}),
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
