import type { Metadata } from "next";
import { Archivo, Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { EncabezadoSitio } from "@/componentes/EncabezadoSitio";
import { obtenerMarca } from "@/db/consultas/entidad";
import { derivarMarca, estiloMarca } from "@/lib/marca";
import { puedeEntrarAlPanel } from "@/lib/permisos";
import { ETIQUETA_ROL } from "@/lib/roles";
import { sesionActual } from "@/lib/sesion-actual";
import { COOKIE_TEMA, temaEfectivo } from "@/lib/tema";
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

export async function generateMetadata(): Promise<Metadata> {
  const m = await obtenerMarca();
  return {
    title: { default: `${m.nombre} · SGC`, template: `%s · ${m.sigla}` },
    description: `Sistema de Gestión de Calidad de ${m.nombre}`,
  };
}

// Lee la cookie de sesión en cada petición: nada del sitio se prerenderiza.
export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Sin cookie validarSesion devuelve null antes de tocar la BD (el build no la necesita).
  const sesion = await sesionActual();
  const marca = await obtenerMarca();
  const tema = temaEfectivo(sesion, (await cookies()).get(COOKIE_TEMA)?.value);
  const usuario =
    sesion && !sesion.factorPendiente
      ? {
          nombre: sesion.nombre,
          etiquetaRol: ETIQUETA_ROL[sesion.rol],
          verPanel: puedeEntrarAlPanel(sesion),
        }
      : null;
  return (
    <html
      lang="es"
      data-tema={tema}
      style={estiloMarca(derivarMarca(marca))}
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
