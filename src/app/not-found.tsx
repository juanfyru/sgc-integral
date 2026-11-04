import type { Metadata } from "next";
import Link from "next/link";
import { PantallaCentrada } from "@/componentes/cascaron/PantallaCentrada";
import { claseBoton } from "@/componentes/ui/Boton";

export const metadata: Metadata = { title: "Página no encontrada" };

// Raíz de los 404 (rutas sin coincidencia y notFound() de cualquier segmento): PantallaCentrada
// pone el <main id="contenido"> que «Saltar al contenido» necesita y la marca de la entidad.
export default function NoEncontrada() {
  return (
    <PantallaCentrada>
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="font-display text-2xl font-semibold">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          La dirección no existe o el contenido ya no está disponible.
        </p>
        <Link href="/" className={claseBoton("primario")}>
          Volver al inicio
        </Link>
      </div>
    </PantallaCentrada>
  );
}
