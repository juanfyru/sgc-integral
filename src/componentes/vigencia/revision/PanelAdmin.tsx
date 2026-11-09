import Link from "next/link";
import { claseBoton } from "@/componentes/ui/Boton";
import { Insignia } from "@/componentes/ui/Insignia";
import { TablaDatos, celda, celdaNumerica, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { DetalleRevision, ProcesoDeRevision } from "@/db/consultas/vigencia/revision-anual";
import { cuenta } from "@/lib/plural";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { DialogoCerrar } from "./DialogoCerrar";
import { DialogoProrrogar } from "./DialogoProrrogar";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

const COLUMNAS: readonly ColumnaTabla[] = [
  { clave: "proceso", etiqueta: "Proceso" },
  { clave: "lider", etiqueta: "Líder" },
  { clave: "avance", etiqueta: "Avance", numerica: true },
  { clave: "ratificados", etiqueta: "Ratificados", numerica: true },
  { clave: "actualizar", etiqueta: "Actualizar", numerica: true },
  { clave: "eliminar", etiqueta: "Eliminar", numerica: true },
  { clave: "normograma", etiqueta: "Normograma" },
  { clave: "estado", etiqueta: "Estado" },
];

/** «quedan 53 días», «vence hoy», «venció hace 3 días». */
export function textoDelPlazo(venceEn: Date, ahora: Date, zona: string): string {
  const p = estadoPlazo(venceEn, ahora, zona);
  if (p.estado === "vence_hoy") return "vence hoy";
  if (p.estado === "vencido") return `venció hace ${cuenta(p.dias, "día", "días")}`;
  return `quedan ${cuenta(p.dias, "día", "días")}`;
}

/** El avance de la revisión, en una línea: cuándo se abrió y por quién, cuándo vence y cuántos documentos tiene. */
export function lineaDeRevision(r: Pick<DetalleRevision, "abiertaEn" | "abiertaPor" | "venceEn" | "prorrogas" | "totales">, ahora: Date, zona: string): string {
  const prorrogas = r.prorrogas.length === 0 ? "" : ` · ${cuenta(r.prorrogas.length, "prórroga", "prórrogas")}`;
  return `Abierta el ${textoFecha(r.abiertaEn, zona)} por ${r.abiertaPor} · cierra el ${textoFecha(r.venceEn, zona)} (${textoDelPlazo(r.venceEn, ahora, zona)})${prorrogas} · ${cuenta(r.totales.documentos, "documento", "documentos")}`;
}

function Normograma({ proceso: p }: { proceso: ProcesoDeRevision }) {
  if (!p.normograma) return <Insignia variante="sin-dato">Pendiente</Insignia>;
  return p.normograma.resultado === "cambios" ? (
    <Insignia variante="atencion">Cambios marcados</Insignia>
  ) : (
    <Insignia variante="bien">Sin novedad</Insignia>
  );
}

/** Completo cuando todos sus documentos tienen decisión y el normograma está confirmado (spec 13C §9.4). */
function Estado({ proceso: p }: { proceso: ProcesoDeRevision }) {
  if (p.decididos === p.documentos && p.normograma) return <Insignia variante="bien">Completo</Insignia>;
  if (!p.lider) return <Insignia variante="atencion">Sin líder · la tarea es del Administrador del SGC</Insignia>;
  return <Insignia variante="neutra">En curso</Insignia>;
}

function NombreProceso({ proceso: p, href, activo }: { proceso: ProcesoDeRevision; href: string; activo: boolean }) {
  return (
    <Link href={href} aria-current={activo ? "page" : undefined} className={`rounded font-medium hover:underline ${activo ? "underline" : ""} ${FOCO}`}>
      {p.nombre}
    </Link>
  );
}

/**
 * Lo que ve de la campaña abierta quien la ve entera (maqueta 4): el Admin SGC, Gerencia y Control Interno. Las cifras
 * de la entidad y el avance por proceso; cada proceso lleva a sus documentos (`?proceso=`). Quien la gestiona la
 * prorroga y la cierra con su firma; Gerencia y Control Interno la ven sin botones. Mientras está abierta, lo que falta
 * decidir se llama «pendiente» (resolución 1). Tabla desde 1024 px; por debajo, una tarjeta por proceso.
 */
export function PanelAdmin({
  revision,
  ahora,
  gestiona,
  pideCodigo,
  procesoActivo,
  rutaDeProceso,
}: {
  revision: DetalleRevision;
  ahora: Date;
  /** `revision_anual.gestionar`: «Prorrogar…» y «Cerrar y generar informe». */
  gestiona: boolean;
  pideCodigo: boolean;
  procesoActivo?: number;
  rutaDeProceso: (procesoId: number) => string;
}) {
  const zona = zonaHoraria();
  const t = revision.totales;
  const decididos = revision.procesos.reduce((s, p) => s + p.decididos, 0);
  const pendientes = t.documentos - decididos;
  return (
    <section aria-labelledby="revision-avance" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="revision-avance" className="font-display text-lg font-semibold">
            {`Revisión anual ${revision.anio}`}
          </h2>
          <p className="text-sm text-muted-foreground">{lineaDeRevision(revision, ahora, zona)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/vigencia/revision-anual/${revision.id}`} className={`${claseBoton("secundario")} ${FOCO}`}>
            Ver el informe parcial
          </Link>
          {gestiona ? (
            <>
              <DialogoProrrogar revisionId={revision.id} anio={revision.anio} venceTexto={textoFecha(revision.venceEn, zona)} />
              <DialogoCerrar revisionId={revision.id} anio={revision.anio} documentos={t.documentos} pendientes={t.sin_revisar} pideCodigo={pideCodigo} />
            </>
          ) : null}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaCifra
          etiqueta="Documentos con decisión"
          valor={`${decididos} / ${t.documentos}`}
          detalle={pendientes === 0 ? "Ninguno pendiente" : `${cuenta(pendientes, "pendiente", "pendientes")}`}
          estado={pendientes === 0 ? "bien" : "atencion"}
        />
        <TarjetaCifra etiqueta="Ratificados" valor={t.ratificar} />
        <TarjetaCifra etiqueta="Por actualizar" valor={t.actualizar} />
        <TarjetaCifra etiqueta="Por eliminar" valor={t.eliminar} />
        <TarjetaCifra etiqueta="Revisados recientemente" valor={t.reciente} />
        <TarjetaCifra etiqueta="En trámite al abrir" valor={t.en_tramite} />
      </div>

      <div className="hidden lg:block">
        <TablaDatos titulo="Avance por proceso" columnas={COLUMNAS} filas={revision.procesos.length} vacio="La revisión no tiene procesos">
          {revision.procesos.map((p) => (
            <tr key={p.id}>
              <td className={celda}>
                <NombreProceso proceso={p} href={rutaDeProceso(p.id)} activo={p.id === procesoActivo} />
              </td>
              <td className={celda}>{p.lider ?? <span className="text-muted-foreground">Sin líder asignado</span>}</td>
              <td className={`${celdaNumerica} whitespace-nowrap`}>{`${p.decididos} / ${p.documentos}`}</td>
              <td className={celdaNumerica}>{p.porDecision.ratificar}</td>
              <td className={celdaNumerica}>{p.porDecision.actualizar}</td>
              <td className={celdaNumerica}>{p.porDecision.eliminar}</td>
              <td className={celda}><Normograma proceso={p} /></td>
              <td className={celda}><Estado proceso={p} /></td>
            </tr>
          ))}
        </TablaDatos>
      </div>
      <ul className="flex list-none flex-col gap-3 lg:hidden" aria-label="Avance por proceso">
        {revision.procesos.map((p) => (
          <li key={p.id} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <NombreProceso proceso={p} href={rutaDeProceso(p.id)} activo={p.id === procesoActivo} />
              <Estado proceso={p} />
            </div>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Líder</dt>
              <dd>{p.lider ?? "Sin líder asignado"}</dd>
              <dt className="text-muted-foreground">Avance</dt>
              <dd>{`${p.decididos} de ${p.documentos} con decisión`}</dd>
              <dt className="text-muted-foreground">Decisiones</dt>
              <dd>{`${p.porDecision.ratificar} ratificados · ${p.porDecision.actualizar} por actualizar · ${p.porDecision.eliminar} por eliminar`}</dd>
              <dt className="text-muted-foreground">Normograma</dt>
              <dd><Normograma proceso={p} /></dd>
            </dl>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Cada líder tiene la tarea «Revisar los documentos de &lt;proceso&gt; (N pendientes)», que vence con la campaña, avisa y
        escala como las demás; la de un proceso sin líder es del Administrador del SGC. Al cerrar, lo que siga pendiente
        queda «sin revisar» en el informe.
      </p>
    </section>
  );
}
