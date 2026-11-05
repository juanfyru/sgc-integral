import type { Metadata } from "next";
import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonToggle } from "@/componentes/admin/mapa/BotonToggle";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { Icono } from "@/componentes/iconos";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Insignia } from "@/componentes/ui/Insignia";
import { listarPerifericos } from "@/db/consultas/mapa-admin";
import { exigirPermiso } from "@/lib/paginas";

export const metadata: Metadata = { title: "Periféricos — Administración SGC" };

const TITULOS = {
  entrada: "Entradas del Sistema",
  salida: "Salidas del Sistema",
  convencion: "Convenciones",
} as const;

export default async function PaginaPerifericos() {
  await exigirPermiso("mapa.administrar");
  const grupos = await listarPerifericos();
  return (
    <div className="flex flex-col gap-8">
      <EncabezadoPagina
        titulo="Elementos periféricos"
        acciones={
          <Link href="/admin/mapa/perifericos/nuevo" className={claseBoton("primario")}>
            Nuevo elemento
          </Link>
        }
      />
      {(["entrada", "salida", "convencion"] as const).map((tipo) => (
        <section key={tipo}>
          <h2 className="mb-2 font-display text-lg font-semibold">{TITULOS[tipo]}</h2>
          <ul className="flex flex-col gap-2">
            {grupos[tipo].map((e, i) => (
              <li
                key={e.id}
                className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${e.activo ? "" : "border-dashed"}`}
              >
                <BotonesOrden
                  tabla="elementos_perifericos"
                  id={e.id}
                  esPrimero={i === 0}
                  esUltimo={i === grupos[tipo].length - 1}
                />
                <Icono nombre={e.icono} className="size-4 text-muted-foreground" />
                <Link href={`/admin/mapa/perifericos/${e.id}`} className="flex-1 hover:underline">
                  {e.texto}
                </Link>
                {!e.activo && <Insignia variante="sin-dato">Inactivo</Insignia>}
                <BotonToggle tabla="elementos_perifericos" id={e.id} activo={e.activo} />
                <BotonBorrar tabla="elementos_perifericos" id={e.id} volverA="/admin/mapa/perifericos" />
              </li>
            ))}
            {grupos[tipo].length === 0 && (
              <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Sin elementos.
              </li>
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
