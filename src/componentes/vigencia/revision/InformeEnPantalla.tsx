import { TablaDatos, celda, type ColumnaTabla } from "@/componentes/ui/TablaDatos";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import type { DatosInforme } from "@/lib/informe-anual";
import { cuenta } from "@/lib/plural";
import { textoFecha } from "@/lib/vigencia/plazo";
import { ETIQUETA_DECISION, type Decision } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

const ORDEN: Decision[] = ["ratificar", "reciente", "actualizar", "eliminar", "en_tramite", "sin_revisar"];

/** Las cifras en plural; con la revisión abierta, lo que no tiene decisión es «pendiente» (resolución 1). */
function etiquetaCifra(decision: Decision, parcial: boolean): string {
  const plural: Record<Decision, string> = {
    ratificar: "Ratificados",
    reciente: "Revisados recientemente",
    actualizar: "Por actualizar",
    eliminar: "Por eliminar",
    en_tramite: "En trámite al abrir",
    sin_revisar: parcial ? "Pendientes" : "Sin revisar",
  };
  return plural[decision];
}

const etiquetaDecision = (decision: Decision, parcial: boolean) => (parcial && decision === "sin_revisar" ? "Pendiente" : ETIQUETA_DECISION[decision]);

function Seccion({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

type FilaInforme = DatosInforme["decisiones"][number];

function textoResponsable(d: FilaInforme, zona: string): string {
  const quien = d.responsable ?? (d.fecha ? "Automática" : "—");
  return d.fecha ? `${quien} · ${textoFecha(d.fecha, zona)}` : quien;
}

function textoSolicitud(d: FilaInforme, zona: string): string {
  if (!d.solicitud) return "—";
  return d.solicitud.venceEn ? `${d.solicitud.numero} · vence ${textoFecha(d.solicitud.venceEn, zona)}` : d.solicitud.numero;
}

const textoEstado = (d: FilaInforme) => d.solicitud?.estadoAlCierre ?? d.estadoExterno ?? "—";

/**
 * El informe de la revisión anual en pantalla (spec 13C §9.5, maqueta 6), con los mismos datos que el PDF: de una
 * cerrada, los congelados; de la abierta, el parcial de hoy, sin firma ni huella. Nombra documentos restringidos: solo
 * lo recibe quien cumple `puedeVerInformeAnual`.
 */
export function InformeEnPantalla({ informe: d, parcial }: { informe: DatosInforme; parcial: boolean }) {
  const zona = zonaHoraria();
  const estado = parcial ? "Estado hoy" : "Estado al cierre";
  const columnas: readonly ColumnaTabla[] = [
    { clave: "documento", etiqueta: "Documento" },
    { clave: "proceso", etiqueta: "Proceso" },
    { clave: "decision", etiqueta: "Decisión" },
    { clave: "responsable", etiqueta: "Responsable" },
    { clave: "solicitud", etiqueta: "Solicitud y plazo" },
    { clave: "estado", etiqueta: estado },
  ];
  const { documentos, internos, externos, procesos } = d.alcance;
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {parcial ? (
        <p role="note" className="rounded-md border border-estado-atencion bg-estado-atencion-fondo px-4 py-3 text-sm text-estado-atencion-texto">
          Informe parcial: los datos de hoy, sin firma ni huella. Al cerrar la revisión se congela el informe definitivo.
        </p>
      ) : null}
      <p className="text-sm">
        {`${cuenta(documentos, "documento vigente", "documentos vigentes")} (${cuenta(internos, "interno", "internos")}, ${cuenta(externos, "externo", "externos")}) de ${cuenta(procesos, "proceso", "procesos")}.`}
      </p>
      {d.prorrogas.length > 0 ? (
        <ul className="flex list-none flex-col gap-1 text-sm text-muted-foreground">
          {d.prorrogas.map((p, i) => (
            <li key={i} className="break-words">{`Prorrogada ${cuenta(p.dias, "día", "días")} el ${textoFecha(p.fecha, zona)} por ${p.por}: ${p.motivo}`}</li>
          ))}
        </ul>
      ) : null}

      <Seccion id="informe-resultado" titulo="Resultado">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {ORDEN.map((x) => (
            <TarjetaCifra
              key={x}
              etiqueta={etiquetaCifra(x, parcial)}
              valor={d.totales[x]}
              estado={x === "sin_revisar" ? (d.totales[x] === 0 ? "bien" : "atencion") : undefined}
            />
          ))}
        </div>
      </Seccion>

      <Seccion id="informe-decisiones" titulo="Decisiones con responsable y fecha">
        <div className="hidden lg:block">
          <TablaDatos titulo="Decisiones de la revisión" columnas={columnas} filas={d.decisiones.length} vacio="La revisión no tiene documentos">
            {d.decisiones.map((x) => (
              <tr key={x.codigo}>
                <td className={celda}>
                  <div className="font-mono text-xs font-medium">{`${x.codigo} v${x.version}`}</div>
                  <div>{x.titulo}</div>
                </td>
                <td className={celda}>{x.proceso}</td>
                <td className={celda}>{etiquetaDecision(x.decision, parcial)}</td>
                <td className={celda}>{textoResponsable(x, zona)}</td>
                <td className={celda}>{textoSolicitud(x, zona)}</td>
                <td className={celda}>{textoEstado(x)}</td>
              </tr>
            ))}
          </TablaDatos>
        </div>
        <ul className="flex list-none flex-col gap-3 lg:hidden" aria-label="Decisiones de la revisión">
          {d.decisiones.map((x) => (
            <li key={x.codigo} className="min-w-0 rounded-lg border border-border bg-card p-3 text-sm">
              <div className="font-mono text-xs font-medium">{`${x.codigo} v${x.version}`}</div>
              <div className="break-words">{x.titulo}</div>
              <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Proceso</dt>
                <dd>{x.proceso}</dd>
                <dt className="text-muted-foreground">Decisión</dt>
                <dd>{etiquetaDecision(x.decision, parcial)}</dd>
                <dt className="text-muted-foreground">Responsable</dt>
                <dd>{textoResponsable(x, zona)}</dd>
                <dt className="text-muted-foreground">Solicitud</dt>
                <dd>{textoSolicitud(x, zona)}</dd>
                <dt className="text-muted-foreground">{estado}</dt>
                <dd>{textoEstado(x)}</dd>
              </dl>
            </li>
          ))}
        </ul>
      </Seccion>

      <Seccion id="informe-cambios" titulo={`Cambios normativos de ${d.anio}`}>
        {d.normograma.cambios.length === 0 ? (
          <p className="text-sm text-muted-foreground">{`No se registraron cambios normativos en ${d.anio}.`}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 text-sm">
            {d.normograma.cambios.map((c, i) => (
              <li key={i} className="min-w-0 break-words">
                <span className="font-medium">{c.norma}</span>
                {` · ${c.estado} el ${textoFecha(c.fecha, zona)} · ${cuenta(c.documentos, "documento afectado", "documentos afectados")}, ${cuenta(c.resueltos, "resuelto", "resueltos")}, ${c.noAfecta} «no afecta»`}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion id="informe-normograma" titulo="Normograma por proceso">
        {d.normograma.porProceso.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ningún proceso de la revisión tiene documentos ni normograma por confirmar.</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 text-sm">
            {d.normograma.porProceso.map((p) => (
              <li key={p.proceso} className="min-w-0 break-words">
                <span className="font-medium">{p.proceso}</span>
                {` · ${p.resultado ?? "Sin confirmar"}`}
                {p.nota ? <span className="block whitespace-pre-wrap text-muted-foreground">{p.nota}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion id="informe-otros" titulo="Otros insumos">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Acuses de lectura</dt>
          <dd>{d.otros.acusesPct === null ? `Las versiones publicadas en ${d.anio} no pidieron acuses` : `${d.otros.acusesPct} % de las versiones publicadas en ${d.anio}`}</dd>
          <dt className="text-muted-foreground">Puntos de uso</dt>
          <dd>{d.otros.conformidadPct === null ? `Sin verificaciones cerradas en ${d.anio}` : `${d.otros.conformidadPct} % de conformidad`}</dd>
          <dt className="text-muted-foreground">Externos al día</dt>
          <dd>{`${d.otros.externosAlDia.alDia} de ${d.otros.externosAlDia.total}`}</dd>
        </dl>
      </Seccion>

      {parcial ? null : (
        <Seccion id="informe-cierre" titulo="Cierre">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Cerró y firmó</dt>
            <dd>{`${d.cerradaPor.nombre}${d.cerradaPor.cargo ? ` · ${d.cerradaPor.cargo}` : ""} · ${textoFecha(d.cerradaEn, zona)}`}</dd>
            <dt className="text-muted-foreground">Método</dt>
            <dd>{d.metodo === "clave_totp" ? "Con su clave y el segundo factor" : "Con su clave"}</dd>
          </dl>
        </Seccion>
      )}
    </div>
  );
}
