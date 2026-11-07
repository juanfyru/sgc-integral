import Link from "next/link";
import { FormAccion } from "@/componentes/admin/FormAccion";
import { reemplazarCopiasAccion } from "@/app/acciones-distribucion";
import { DialogoEmitir } from "@/componentes/distribucion/copias/DialogoEmitir";
import { InsigniaCopia } from "@/componentes/distribucion/copias/TablaCopias";
import {
  copiasDeDocumento,
  puntosParaEmitir,
  type Copia,
} from "@/db/consultas/distribucion/copias";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { puede } from "@/lib/permisos";

function ListaCopias({ titulo, copias, ahora }: { titulo: string; copias: Copia[]; ahora: Date }) {
  if (copias.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold text-muted-foreground">{titulo}</h3>
      <ul className="flex list-none flex-col gap-1.5">
        {copias.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Link
              href={`/distribucion/copias/${c.id}`}
              className="rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
            >
              {`${c.punto.nombre} N.º ${numeroDeCopia(c.numero)}`}
            </Link>
            <InsigniaCopia copia={c} ahora={ahora} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** «Copias controladas» de la ficha del documento: lo vigente, lo que falta recoger y desde dónde emitir o reemplazar. */
export async function BloqueDistribucion({
  documento,
  sesion,
}: {
  documento: { id: number; codigo: string; titulo: string };
  sesion: SesionFlujo;
}) {
  const puedeEmitir = puede(sesion, "copias.emitir");
  if (!puedeEmitir && !puede(sesion, "distribucion.ver")) return null;

  const [copias, puntos] = await Promise.all([
    copiasDeDocumento(documento.id, sesion),
    puedeEmitir ? puntosParaEmitir(sesion) : Promise.resolve([]),
  ]);
  const ahora = new Date();
  const versionAnterior = Math.max(0, ...copias.porRecoger.map((c) => c.version));
  const puedeEmitirAqui = puedeEmitir && copias.versionVigenteId !== null;

  return (
    <section aria-labelledby="titulo-copias" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-copias" className="mb-3 text-sm font-semibold text-foreground">
        Copias controladas
      </h2>
      <div className="flex flex-col gap-3">
        {copias.vigentes.length === 0 && copias.porRecoger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay copias controladas en circulación.</p>
        ) : null}
        <ListaCopias titulo="De la versión vigente" copias={copias.vigentes} ahora={ahora} />
        <ListaCopias titulo="Por recoger" copias={copias.porRecoger} ahora={ahora} />
        {puedeEmitirAqui || copias.puedeReemplazar ? (
          <div className="flex flex-wrap items-start gap-2">
            {puedeEmitirAqui ? <DialogoEmitir documentos={[documento]} puntos={puntos} variante="secundario" /> : null}
            {copias.puedeReemplazar && copias.versionVigenteId !== null ? (
              <FormAccion
                accion={reemplazarCopiasAccion}
                etiqueta={`Reemplazar las copias de la v${versionAnterior} (${copias.porRecoger.length})`}
                confirmacion="Emite una copia de la versión vigente por cada punto que tenía la anterior; cada responsable confirma en una sola tarea que recibió la nueva y retiró la vieja."
                campos={{ versionId: copias.versionVigenteId }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
