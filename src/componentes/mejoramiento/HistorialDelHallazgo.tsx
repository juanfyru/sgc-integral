import { fechaDeDia, fechaYHora } from "@/lib/mejoramiento/formato";

type Evento = { id: number; tipo: string; ronda: number; quien: string | null; cuando: Date; detalle?: unknown };

/** Lo que un evento dice por escrito: la justificación, la réplica, la nota o el motivo que trae su detalle, con su rótulo. */
const TEXTOS_DEL_DETALLE: ReadonlyArray<readonly [clave: string, rotulo: string]> = [
  ["justificacion", "Justificación"],
  ["replica", "Réplica"],
  ["nota", "Nota"],
  ["motivo", "Motivo"],
  // Las firmas del plan: lo que dijo quien lo devolvió y la nota de la revisión que pidió recursos (spec §8.6).
  ["observaciones", "Observaciones"],
  ["notaRecursos", "Recursos o impacto institucional"],
];

const comoObjeto = (detalle: unknown): Record<string, unknown> =>
  typeof detalle === "object" && detalle !== null ? (detalle as Record<string, unknown>) : {};

function textosDe(detalle: unknown): Array<{ rotulo: string; texto: string }> {
  const d = comoObjeto(detalle);
  const textos = TEXTOS_DEL_DETALLE.flatMap(([clave, rotulo]) =>
    typeof d[clave] === "string" && d[clave].trim() !== "" ? [{ rotulo, texto: d[clave] as string }] : [],
  );
  // El acta del Comité que citó el acto (spec §8.5): número y fecha, que pone el motor.
  const acta = comoObjeto(d.acta);
  if (typeof acta.numero === "string" && typeof acta.fecha === "string") {
    textos.push({ rotulo: "Acta del Comité", texto: `${acta.numero}, del ${fechaDeDia(acta.fecha)}` });
  }
  return textos;
}

/** Lo que cada acción del hallazgo dice en el historial: en pasado, sin nombres (quién va aparte). */
const FRASE: Record<string, string> = {
  registrar: "Registró el hallazgo",
  aceptar: "Aceptó el hallazgo",
  rechazar: "Rechazó el hallazgo",
  retirar: "Retiró el hallazgo tras el rechazo",
  sostener: "Sostuvo el hallazgo ante el rechazo",
  confirmar_hallazgo: "Confirmó el hallazgo en el arbitraje",
  confirmar_rechazo: "Confirmó el rechazo en el arbitraje",
  corregir: "Registró la corrección",
  decidir_si: "Decidió que lleva acción correctiva",
  decidir_no: "Decidió que no lleva acción correctiva",
  validar_correccion: "Validó la corrección",
  devolver_correccion: "Devolvió la corrección",
  enviar_plan: "Envió el análisis y el plan",
  devolver_plan: "Devolvió el plan",
  revisar_plan: "Revisó el plan",
  aprobar_plan: "Aprobó el plan",
  completar: "Completó las actividades",
  verificar_implementacion: "Verificó la implementación",
  evaluar_eficaz: "Evaluó la eficacia: fue eficaz",
  evaluar_no_eficaz: "Evaluó la eficacia: no fue eficaz",
  cerrar: "Cerró el hallazgo",
  anular: "Anuló el hallazgo",
  cargar: "Cargó el hallazgo",
  reclasificar: "Reclasificó el hallazgo",
  ajustar: "Decidió un ajuste del plan",
  ocurrencia: "Añadió una ocurrencia",
  editado: "Editó la identificación",
  proceso_cambiado: "Cambió el proceso",
  analisis_guardado: "Guardó un análisis de causa raíz",
  analisis_quitado: "Quitó un análisis de causa raíz",
  causas_guardadas: "Guardó las causas raíz",
  preguntas_respondidas: "Respondió las preguntas de cierre del análisis",
  accion_guardada: "Guardó una acción del plan",
  accion_quitada: "Quitó una acción del plan",
  criterio_guardado: "Guardó el criterio de eficacia",
  seguimiento: "Registró un seguimiento de una actividad",
  actividad_terminada: "Terminó una actividad",
  reasignada: "Reasignó una actividad",
};

/** La etiqueta de una actividad («A1.2») tal como la trae un evento, o nada si no tiene esa forma. */
const etiquetaValida = (v: unknown): string | null => (typeof v === "string" && /^A\d+\.\d+$/.test(v) ? v : null);

/**
 * La frase del evento; algunas dependen de su detalle (el cierre sin acción, el «no» que se cambió por «sí»). Los de una
 * actividad la nombran por su etiqueta: el seguimiento y la terminada la traen; la reasignación solo trae su id, que la página
 * traduce con `etiquetas`.
 */
function fraseDe(e: Evento, etiquetas: Readonly<Record<number, string>>): string {
  const d = comoObjeto(e.detalle);
  if (e.tipo === "seguimiento" || e.tipo === "actividad_terminada" || e.tipo === "reasignada") {
    const etiqueta = etiquetaValida(d.actividad) ?? (typeof d.actividadId === "number" ? etiquetaValida(etiquetas[d.actividadId]) : null);
    if (!etiqueta) return FRASE[e.tipo];
    if (e.tipo === "actividad_terminada") return `Terminó la actividad ${etiqueta}`;
    if (e.tipo === "reasignada") return `Reasignó la actividad ${etiqueta}`;
    const avance = comoObjeto(d.avance).despues;
    return `Registró un seguimiento de la actividad ${etiqueta}${typeof avance === "number" ? ` (${avance} %)` : ""}`;
  }
  if (e.tipo === "validar_correccion" && d.resultado === "sin_accion") return "Validó el cierre sin acción";
  if (e.tipo === "corregir" && d.requerida === false) return "Registró que no requiere corrección inmediata";
  if (e.tipo === "decidir_si" && "antes" in d) return "Exigió la acción correctiva después de un «no»";
  // La etiqueta de la acción («A1») cuando la trae: el texto de la acción no va en el evento.
  if ((e.tipo === "accion_guardada" || e.tipo === "accion_quitada") && typeof d.accion === "string" && /^A\d+$/.test(d.accion)) {
    return `${e.tipo === "accion_guardada" ? "Guardó" : "Quitó"} la acción ${d.accion} del plan`;
  }
  return FRASE[e.tipo] ?? e.tipo;
}

/**
 * El historial del hallazgo, del más antiguo al más reciente (spec 15 §16.2). Solo lo ve quien ve el hallazgo completo.
 * `etiquetasDeActividad` nombra las actividades por su id («A1.2»).
 */
export function HistorialDelHallazgo({
  eventos,
  zona,
  etiquetasDeActividad = {},
}: {
  eventos: readonly Evento[];
  zona: string;
  etiquetasDeActividad?: Readonly<Record<number, string>>;
}) {
  return (
    <section aria-labelledby="historial-hallazgo" className="rounded-lg border border-border bg-card p-4">
      <h2 id="historial-hallazgo" className="font-display text-base font-semibold">
        Historial
      </h2>
      {eventos.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Aún no hay movimientos.</p>
      ) : (
        <ol className="mt-3 flex list-none flex-col gap-2">
          {eventos.map((e) => (
            <li key={e.id} className="border-l-2 border-mod-planes pl-3 text-sm">
              <span className="block font-medium">
                {fraseDe(e, etiquetasDeActividad)}
                {e.ronda > 1 ? ` (ronda ${e.ronda})` : ""}
              </span>
              {textosDe(e.detalle).map((t) => (
                <span key={t.rotulo} className="block whitespace-pre-line break-words text-sm">
                  {t.rotulo}: {t.texto}
                </span>
              ))}
              <span className="block text-xs text-muted-foreground">
                {e.quien ?? "El sistema"} · <time dateTime={e.cuando.toISOString()}>{fechaYHora(e.cuando, zona)}</time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
