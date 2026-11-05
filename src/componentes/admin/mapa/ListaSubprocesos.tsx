import Link from "next/link";
import { BotonBorrar } from "@/componentes/admin/mapa/BotonBorrar";
import { BotonesOrden } from "@/componentes/admin/mapa/BotonesOrden";
import { ConfirmarDesactivar } from "@/componentes/admin/mapa/ConfirmarDesactivar";
import { Insignia } from "@/componentes/ui/Insignia";
import type { FilaSubproceso } from "@/db/consultas/mapa-admin";

export function ListaSubprocesos({
  subprocesos,
  volverA,
}: {
  subprocesos: FilaSubproceso[];
  volverA: string;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {subprocesos.map((s, i) => (
        <li
          key={s.id}
          className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 ${s.activo ? "" : "border-dashed"}`}
        >
          <BotonesOrden tabla="subprocesos" id={s.id} esPrimero={i === 0} esUltimo={i === subprocesos.length - 1} />
          <Link href={`/admin/mapa/subprocesos/${s.id}`} className="flex-1 font-medium hover:underline">
            {s.nombre}
          </Link>
          <span className="text-xs text-muted-foreground">
            {s.numDocs} docs
          </span>
          {!s.activo && <Insignia variante="sin-dato">Inactivo</Insignia>}
          <ConfirmarDesactivar tabla="subprocesos" id={s.id} activo={s.activo} afectados={s.docsAfectados} />
          {s.numDocs === 0 && <BotonBorrar tabla="subprocesos" id={s.id} volverA={volverA} />}
        </li>
      ))}
      {subprocesos.length === 0 && (
        <li className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">Sin subprocesos.</li>
      )}
    </ul>
  );
}
