import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { claseBoton } from "./Boton";

export function EstadoVacio({
  icono: Icono,
  titulo,
  texto,
  accion,
}: {
  icono: LucideIcon;
  titulo: string;
  texto: string;
  accion?: { href: string; etiqueta: string };
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <Icono aria-hidden="true" className="size-8 text-texto-terciario" />
      <h2 className="mt-3 font-display text-lg font-semibold">{titulo}</h2>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">{texto}</p>
      {accion ? (
        <Link href={accion.href} className={`mt-4 ${claseBoton("primario")}`}>
          {accion.etiqueta}
        </Link>
      ) : null}
    </div>
  );
}
