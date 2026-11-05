import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { ConfirmarDesactivar } from "@/componentes/admin/mapa/ConfirmarDesactivar";
import { Icono } from "@/componentes/iconos";
import { Insignia } from "@/componentes/ui/Insignia";
import type { FilaProceso } from "@/db/consultas/mapa-admin";

export function ListaProcesos({
  procesos,
  volverA,
}: {
  procesos: FilaProceso[];
  volverA: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {procesos.map((p, i) => (
        <li
          key={p.id}
          className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${p.activo ? "" : "border-dashed"}`}
        >
          <BotonesOrden tabla="procesos" id={p.id} esPrimero={i === 0} esUltimo={i === procesos.length - 1} />
          <Icono nombre={p.icono} className="size-4 text-muted-foreground" />
          <span className="font-mono text-xs">{p.sigla}</span>
          <Link href={`/admin/mapa/procesos/${p.id}`} className="flex-1 font-medium hover:underline">
            {p.nombre}
          </Link>
          <span className="text-xs text-muted-foreground">
            {p.numSubprocesos} subprocesos · {p.numDocs} docs
          </span>
          {!p.activo && <Insignia variante="sin-dato">Inactivo</Insignia>}
          <ConfirmarDesactivar tabla="procesos" id={p.id} activo={p.activo} afectados={p.docsAfectados} />
          {p.numSubprocesos === 0 && p.numDocs === 0 && (
            <BotonBorrar tabla="procesos" id={p.id} volverA={volverA} />
          )}
        </li>
      ))}
      {procesos.length === 0 && (
        <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin procesos.</li>
      )}
    </ul>
  );
}
