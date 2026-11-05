import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";

// Atrapa los notFound() de las páginas de (app): se pinta dentro del cascarón, que ya pone la región principal.
// Las URL sin ruta siguen yendo a src/app/not-found.tsx.
export default function NoEncontradaEnApp() {
  return (
    <div className="max-w-md">
      <EncabezadoPagina
        titulo="Página no encontrada"
        descripcion="El proceso, documento o registro que busca no existe o ya no está disponible."
      />
      <Link href="/" className={claseBoton("primario")}>
        Volver al inicio
      </Link>
    </div>
  );
}
