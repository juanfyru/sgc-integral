import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { PestanasVigencia, pestanasVisibles } from "@/componentes/vigencia/PestanasVigencia";
import { DialogoAbrir } from "@/componentes/vigencia/revision/DialogoAbrir";
import { PanelAdmin } from "@/componentes/vigencia/revision/PanelAdmin";
import { SeccionProceso } from "@/componentes/vigencia/revision/SeccionProceso";
import { claseBoton } from "@/componentes/ui/Boton";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { EstadoVacio } from "@/componentes/ui/EstadoVacio";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { indiceDeRevisiones, obtenerRevision, type RevisionEnIndice } from "@/db/consultas/vigencia/revision-anual";
import { alcanceProcesos, puedeVerInformeAnual, puedeVerRevisionAnual } from "@/lib/alcance";
import { exigirSesion } from "@/lib/paginas";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { exigirVigencia } from "../_comun";
import { seccionesDeProcesos } from "./_datos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Revisión anual" };

const RUTA = "/vigencia/revision-anual";
const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca";

/** Las revisiones cerradas, con su página y, para quien ve el informe institucional, su PDF (spec 13C §9.7). */
function Cerradas({ revisiones, verInforme, zona }: { revisiones: RevisionEnIndice[]; verInforme: boolean; zona: string }) {
  if (revisiones.length === 0) return null;
  return (
    <section aria-labelledby="revisiones-cerradas" className="flex min-w-0 flex-col gap-2">
      <h2 id="revisiones-cerradas" className="text-sm font-semibold">
        Revisiones cerradas
      </h2>
      <ul className="flex list-none flex-col gap-2">
        {revisiones.map((r) => (
          <li key={r.id} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm">
            <span className="min-w-0">
              <Link href={`${RUTA}/${r.id}`} className={`rounded font-medium hover:underline ${FOCO}`}>
                {`Revisión anual ${r.anio}`}
              </Link>
              {r.cerradaEn ? <span className="text-muted-foreground">{` · cerrada el ${textoFecha(r.cerradaEn, zona)}`}</span> : null}
            </span>
            {verInforme ? (
              <a href={`${RUTA}/${r.id}/informe`} className={`${claseBoton("secundario", "sm")} ${FOCO}`}>
                {`Informe ${r.anio} en PDF`}
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * La pestaña «Revisión anual» (spec 13C §9, maquetas 4 y 5). Con una revisión abierta, quien la ve entera (Admin SGC,
 * Gerencia y Control Interno) tiene el avance por proceso y, con `?proceso=`, los documentos de ese proceso; cada líder,
 * las tablas de sus procesos para decidir. Sin revisión abierta, la última cerrada y, para quien la gestiona, abrir la
 * del año. Lo que se muestra sale de `obtenerRevision`, recortado a la persona; el índice de revisiones solo da los años.
 */
export default async function PaginaRevisionAnual({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sesion = await exigirSesion();
  const { responsableTecnico } = await exigirVigencia(sesion);
  // La pestaña es de `vigencia.ver`; quien entra a Vigencia por otra regla (responsable técnico) no la tiene.
  if (!puedeVerRevisionAnual(sesion)) notFound();

  const consulta = await searchParams;
  const pedido = typeof consulta.proceso === "string" && /^\d{1,15}$/.test(consulta.proceso) ? Number(consulta.proceso) : undefined;
  const ahora = new Date();
  const zona = zonaHoraria();
  const gestiona = puede(sesion, "revision_anual.gestionar");
  const verInforme = puedeVerInformeAnual(sesion);
  const indice = await indiceDeRevisiones();
  const abierta = indice.find((r) => r.estado === "abierta");
  const cerradas = indice.filter((r) => r.estado === "cerrada");

  const encabezado = (
    <>
      <EncabezadoPagina titulo="Vigencia" descripcion="Plazo de revisión, revisión anual, documentos externos e indicadores del proceso documental" />
      <PestanasVigencia activa="revision-anual" visibles={pestanasVisibles(sesion, responsableTecnico)} />
    </>
  );

  if (!abierta) {
    const ultima = cerradas[0];
    const actual = Number(fechaEnZona(ahora, zona).slice(0, 4));
    const usados = new Set(indice.map((r) => r.anio));
    const propuesto = [actual, actual + 1].find((a) => !usados.has(a));
    const config = gestiona && propuesto !== undefined ? (await obtenerConfigDocumental()).vigencia : null;
    return (
      <div className="flex flex-col gap-6">
        {encabezado}
        {ultima ? (
          <section aria-labelledby="ultima-revision" className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <h2 id="ultima-revision" className="font-display text-lg font-semibold">
              {`Revisión anual ${ultima.anio}`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {ultima.cerradaEn ? `Cerrada el ${textoFecha(ultima.cerradaEn, zona)}. No hay una revisión abierta.` : "No hay una revisión abierta."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href={`${RUTA}/${ultima.id}`} className={`${claseBoton("secundario")} ${FOCO}`}>
                Ver la revisión
              </Link>
              {verInforme ? (
                <a href={`${RUTA}/${ultima.id}/informe`} className={`${claseBoton("secundario")} ${FOCO}`}>
                  Informe en PDF
                </a>
              ) : null}
            </div>
          </section>
        ) : (
          <EstadoVacio
            icono={ClipboardCheck}
            titulo="Aún no hay revisiones anuales"
            texto={
              gestiona
                ? "Abra la revisión anual: cada líder decidirá si sus documentos siguen siendo adecuados, se actualizan o se eliminan."
                : "Cuando el Administrador del SGC abra la revisión anual, aquí verá los documentos por decidir y su avance."
            }
          />
        )}
        {config && propuesto !== undefined ? (
          <div>
            <DialogoAbrir
              anio={propuesto}
              anioMinimo={actual - 1}
              anioMaximo={actual + 1}
              plazoDias={config.revisionAnualPlazoDias}
              ventanaMeses={config.revisionAnualVentanaMeses}
            />
          </div>
        ) : null}
        <Cerradas revisiones={cerradas.slice(1)} verInforme={verInforme} zona={zona} />
      </div>
    );
  }

  const revision = await obtenerRevision(abierta.id, sesion, { ahora });
  if (!revision) notFound();
  const alcance = await alcanceProcesos(sesion);
  const procesoActivo = pedido !== undefined && revision.procesos.some((p) => p.id === pedido) ? pedido : undefined;
  // Con `?proceso=`, los documentos de ese proceso; sin él, el líder ve los de todos sus procesos y los demás, el avance.
  const conTabla =
    procesoActivo !== undefined ? revision.procesos.filter((p) => p.id === procesoActivo) : alcance.todos ? [] : revision.procesos;
  const secciones = await seccionesDeProcesos(sesion, revision, conTabla, { decidir: true });
  const volver = procesoActivo === undefined ? RUTA : `${RUTA}?proceso=${procesoActivo}`;
  const rutaDeProceso = (id: number) => `${RUTA}?proceso=${id}#proceso-${id}`;
  const decididos = revision.procesos.reduce((s, p) => s + p.decididos, 0);

  return (
    <div className="flex flex-col gap-6">
      {encabezado}
      {alcance.todos ? (
        <PanelAdmin
          revision={revision}
          ahora={ahora}
          gestiona={gestiona}
          pideCodigo={sesion.totpActivo}
          procesoActivo={procesoActivo}
          rutaDeProceso={rutaDeProceso}
        />
      ) : (
        <section aria-labelledby="revision-del-lider" className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="revision-del-lider" className="font-display text-lg font-semibold">
                {`Revisión anual ${revision.anio}`}
              </h2>
              <p className="text-sm text-muted-foreground">
                {`${decididos} de ${cuenta(revision.totales.documentos, "documento", "documentos")} de sus procesos con decisión · vence el ${textoFecha(revision.venceEn, zona)}`}
              </p>
            </div>
            <Link href={`${RUTA}/${revision.id}`} className={`${claseBoton("secundario")} ${FOCO}`}>
              Ver el informe parcial
            </Link>
          </div>
          {revision.procesos.length > 1 ? (
            <nav aria-label="Sus procesos en la revisión">
              <ul className="flex list-none flex-wrap gap-2">
                <li>
                  <Link
                    href={RUTA}
                    aria-current={procesoActivo === undefined ? "page" : undefined}
                    className={`inline-block rounded-full border px-3 py-1 text-sm ${FOCO} ${procesoActivo === undefined ? "border-marca bg-muted font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >
                    Todos
                  </Link>
                </li>
                {revision.procesos.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`${RUTA}?proceso=${p.id}`}
                      aria-current={p.id === procesoActivo ? "page" : undefined}
                      className={`inline-block rounded-full border px-3 py-1 text-sm ${FOCO} ${p.id === procesoActivo ? "border-marca bg-muted font-semibold" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >
                      {`${p.nombre} (${p.decididos} de ${p.documentos})`}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {revision.procesos.length === 0 ? (
            <EstadoVacio
              icono={ClipboardCheck}
              titulo="Ninguno de sus procesos está en la revisión"
              texto="La revisión anual incluye los procesos activos con documentos vigentes al abrirla."
            />
          ) : null}
        </section>
      )}
      {secciones.map((s) => (
        <SeccionProceso
          key={s.proceso.id}
          revision={{ id: revision.id, anio: revision.anio, abierta: true }}
          proceso={s.proceso}
          filas={s.filas}
          normas={s.normas}
          ahora={ahora}
          pideCodigo={sesion.totpActivo}
          volver={volver}
        />
      ))}
      <Cerradas revisiones={cerradas} verInforme={verInforme} zona={zona} />
    </div>
  );
}
