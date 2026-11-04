import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { EncabezadoSitio } from "@/componentes/EncabezadoSitio";
import { puede } from "@/lib/permisos";
import { ETIQUETA_ROL } from "@/lib/roles";
import { sesionActual } from "@/lib/sesion-actual";
import "./globals.css";

// next/font descarga y empaqueta las fuentes en build (CI con internet);
// en runtime se sirven desde la propia app — el NAS no tiene salida a internet.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display institucional: condensable, contundente, muy usada en diseño
// público latinoamericano — para títulos y encabezados de banda.
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "SGC Documental — ESE Hospital Nuestra Señora de Fátima",
    template: "%s · SGC Documental",
  },
  description:
    "Sistema de gestión documental de calidad de la ESE Hospital Nuestra Señora de Fátima de Suaza — NTC ISO 9001:2015",
};

// Lee la cookie de sesión en cada petición: nada del sitio se prerenderiza.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sin cookie validarSesion devuelve null antes de tocar la BD (el build no la necesita).
  const sesion = await sesionActual();
  const usuario =
    sesion && !sesion.factorPendiente
      ? {
          nombre: sesion.nombre,
          etiquetaRol: ETIQUETA_ROL[sesion.rol],
          verPanel: puede(sesion, "panel.entrar"),
        }
      : null;
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${archivo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <a href="#contenido" className="saltar-al-contenido">
          Saltar al contenido
        </a>
        <EncabezadoSitio usuario={usuario} />
        <div id="contenido" tabIndex={-1} className="flex-1 min-w-0 outline-none">
          {children}
        </div>
      </body>
    </html>
  );
}
