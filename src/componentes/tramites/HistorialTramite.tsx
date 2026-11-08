import type { EventoTramite } from "@/db/consultas/tramites";
import { ETIQUETA_PAPEL, PAPELES, type Papel } from "@/lib/tramites/separacion";
import type { TipoSolicitud } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

const QUE_PIDE: Record<TipoSolicitud, string> = {
  crear: "pidió la creación",
  modificar: "pidió la modificación",
  eliminar: "pidió la eliminación",
};

const FRASES: Record<string, string> = {
  visto_bueno_automatico: "dio el visto bueno al pedir, como líder del proceso",
  visto_bueno_omitido: "visto bueno omitido: el proceso no tiene líder",
  dar_visto_bueno: "dio el visto bueno",
  negar_visto_bueno: "negó el visto bueno",
  retirar: "retiró la solicitud",
  aceptar: "aceptó y designó responsables",
  rechazar: "rechazó la solicitud",
  enviar_a_revision: "envió a revisión, con clave",
  devolver_revision: "devolvió a elaboración",
  concepto_favorable: "dio concepto favorable, con clave",
  aprobar: "aprobó, con clave",
  devolver_aprobacion: "devolvió a elaboración",
  negar_eliminacion: "negó la eliminación",
  publicar: "publicó, con clave",
  aprobar_y_publicar: "aprobó y publicó, con clave",
  cancelar: "canceló el trámite",
  reasignar: "reasignó un responsable",
  corregir_datos: "corrigió los datos del documento",
};

const ETIQUETA_DATO: Record<string, string> = { titulo: "Título", codigo: "Código", tipo: "Tipo", proceso: "Proceso" };

/** En una eliminación, la acción `publicar` no publica nada. */
const FRASES_ELIMINACION: Record<string, string> = {
  publicar: "ejecutó la eliminación, con clave",
  aprobar_y_publicar: "aprobó y ejecutó la eliminación, con clave",
};

function frase(e: EventoTramite, tipo: TipoSolicitud): string {
  const propia = tipo === "eliminar" ? FRASES_ELIMINACION[e.tipo] : undefined;
  const soloFecha = e.tipo === "reasignar" && !e.detalle.a;
  const hecho = soloFecha
    ? "cambió la fecha límite"
    : e.tipo === "solicitar"
      ? QUE_PIDE[tipo]
      : (propia ?? FRASES[e.tipo] ?? e.tipo.replaceAll("_", " "));
  return e.persona ? `${e.persona} ${hecho}` : hecho.charAt(0).toUpperCase() + hecho.slice(1);
}

const nombreEn = (p: unknown) => (p as { nombre?: string } | null)?.nombre ?? "nadie";

/** Qué cambió en una reasignación o una corrección, con el antes y el después. */
function cambiosDe(evento: EventoTramite): string[] {
  const aceptados = Array.isArray(evento.detalle.noCumple) ? evento.detalle.noCumple.length : 0;
  const criterios =
    aceptados === 0 ? [] : [aceptados === 1 ? "con 1 criterio que no cumple, aceptado" : `con ${aceptados} criterios que no cumplen, aceptados`];
  return [...criterios, ...cambiosDeDatos(evento)];
}

function cambiosDeDatos({ tipo, detalle: d }: EventoTramite): string[] {
  const aprobador = d.aprobador as { de: unknown; a: unknown } | undefined;
  const delAprobador = aprobador ? [`${ETIQUETA_PAPEL.aprobador}: ${nombreEn(aprobador.de)} → ${nombreEn(aprobador.a)}`] : [];
  if (tipo === "corregir_datos") {
    const antes = (d.antes ?? {}) as Record<string, unknown>;
    const datos = Object.entries((d.despues ?? {}) as Record<string, unknown>).map(([dato, valor]) =>
      dato === "socializacion"
        ? `Cambió la marca de socialización a ${String(valor)}`
        : `${ETIQUETA_DATO[dato] ?? dato}: ${String(antes[dato])} → ${String(valor)}`,
    );
    const retirada = typeof d.secundariaRetirada === "string" ? [`Deja de figurar como proceso donde aplica: ${d.secundariaRetirada}`] : [];
    return [...datos, ...retirada, ...delAprobador];
  }
  if (tipo !== "reasignar") return [];
  const lineas = PAPELES.includes(d.papel as Papel) ? [`${ETIQUETA_PAPEL[d.papel as Papel]}: ${nombreEn(d.de)} → ${nombreEn(d.a)}`] : [];
  if (typeof d.venceEn === "string") lineas.push(`Nueva fecha límite: ${d.venceEn}`);
  return [...lineas, ...delAprobador];
}

export function HistorialTramite({ tipo, eventos }: { tipo: TipoSolicitud; eventos: EventoTramite[] }) {
  const cuando = new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zonaHoraria(),
  });
  return (
    <section aria-labelledby="titulo-historial" className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 id="titulo-historial" className="mb-3 text-sm font-semibold">
        Historial
      </h2>
      <ol className="flex list-none flex-col gap-2.5">
        {eventos.map((e, i) => (
          <li key={i} className="text-sm">
            <span className="block text-xs text-muted-foreground">{cuando.format(e.creadoEn)}</span>
            {frase(e, tipo)}
            {cambiosDe(e).map((linea) => (
              <span key={linea} className="block break-words text-xs text-muted-foreground">
                {linea}
              </span>
            ))}
            {typeof e.detalle.motivo === "string" ? (
              <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {`Motivo: ${e.detalle.motivo}`}
              </span>
            ) : null}
            {typeof e.detalle.concepto === "string" ? (
              <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                {`Concepto: ${e.detalle.concepto}`}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
