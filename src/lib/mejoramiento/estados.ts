import { esExterno } from "./origenes";
import { accionObligada, llevaPlanSiempre } from "./reglas";
import { TERMINALES, type EstadoHallazgo, type HallazgoBase } from "./tipos";

const ETIQUETAS: Record<EstadoHallazgo, string> = {
  por_aceptar: "Por aceptar",
  rechazo: "Rechazado · por decidir",
  arbitraje: "En arbitraje",
  por_corregir: "Por corregir",
  por_decidir: "Por decidir",
  por_validar: "Por validar la corrección",
  por_formular: "Por formular",
  en_revision: "En revisión",
  en_aprobacion: "En aprobación",
  en_ejecucion: "En ejecución",
  por_verificar: "Por verificar",
  en_espera: "En espera de eficacia",
  por_cerrar: "Por cerrar",
  cerrado: "Cerrado · eficaz",
  rechazado: "Rechazado",
  anulado: "Anulado",
};

/** La etiqueta visible de un estado (spec §8.1). Lo que depende de la fecha lo pasa quien lee. */
export function etiquetaDeEstado(
  h: Pick<HallazgoBase, "estado" | "resultadoCierre" | "correccionRequerida">,
  x?: { yaSePuedeEvaluar?: boolean },
): string {
  if (h.estado === "cerrado") {
    return h.resultadoCierre === "con_correccion"
      ? "Cerrado con corrección"
      : h.resultadoCierre === "sin_accion"
        ? "Cerrado sin acción"
        : "Cerrado · eficaz";
  }
  if (h.estado === "por_validar" && h.correccionRequerida === false) return "Por validar el cierre sin acción";
  if (h.estado === "en_espera" && x?.yaSePuedeEvaluar) return "Por evaluar la eficacia";
  return ETIQUETAS[h.estado];
}

export type Turno =
  | "lideres"
  | "registrador"
  | "arbitro"
  | "admin"
  | "gerencia"
  | "responsables"
  | "verificadores"
  | "validadores";

const TURNOS: Partial<Record<EstadoHallazgo, Turno>> = {
  por_aceptar: "lideres",
  rechazo: "registrador",
  arbitraje: "arbitro",
  por_corregir: "lideres",
  por_decidir: "admin",
  por_validar: "validadores",
  por_formular: "lideres",
  en_revision: "admin",
  en_aprobacion: "gerencia",
  en_ejecucion: "responsables",
  por_verificar: "verificadores",
  por_cerrar: "admin",
};

/** Quién tiene el turno. En espera de eficacia nadie lo tiene; desde la fecha mínima lo decide quien lee. */
export function turnoDe(estado: EstadoHallazgo): Turno | null {
  return TURNOS[estado] ?? null;
}

type Paso = { clave: string; etiqueta: string };
const REGISTRO: Paso = { clave: "registro", etiqueta: "Registro" };
const ACEPTADO: Paso = { clave: "aceptado", etiqueta: "Aceptado" };
const CORRECCION: Paso = { clave: "correccion", etiqueta: "Corrección" };
const DECISION: Paso = { clave: "decision", etiqueta: "Decisión" };
const CAUSA: Paso = { clave: "causa_raiz", etiqueta: "Causa raíz" };
const PLAN: Paso = { clave: "plan_aprobado", etiqueta: "Plan aprobado" };
const EJECUCION: Paso = { clave: "ejecucion", etiqueta: "Ejecución" };
const VERIFICACION: Paso = { clave: "verificacion", etiqueta: "Verificación" };
const EFICACIA: Paso = { clave: "eficacia", etiqueta: "Eficacia" };
const CIERRE: Paso = { clave: "cierre", etiqueta: "Cierre" };

const ORDEN = [REGISTRO, ACEPTADO, CORRECCION, DECISION, CAUSA, PLAN, EJECUCION, VERIFICACION, EFICACIA, CIERRE].map(
  (p) => p.clave,
);

/** El paso en que está cada estado, dentro de la lista completa. */
const PASO_DE_ESTADO: Record<EstadoHallazgo, string> = {
  por_aceptar: "aceptado",
  rechazo: "aceptado",
  arbitraje: "aceptado",
  por_corregir: "correccion",
  por_decidir: "decision",
  por_validar: "cierre",
  por_formular: "causa_raiz",
  en_revision: "causa_raiz",
  en_aprobacion: "plan_aprobado",
  en_ejecucion: "ejecucion",
  por_verificar: "verificacion",
  en_espera: "eficacia",
  por_cerrar: "cierre",
  cerrado: "cierre",
  rechazado: "aceptado",
  anulado: "registro",
};

/** Los pasos del recorrido de un hallazgo, sin fechas: la página las añade. */
export function pasosDelRecorrido(
  h: HallazgoBase,
): Array<{ clave: string; etiqueta: string; estado: "hecho" | "actual" | "falta" }> {
  const esNc = h.clase === "no_conformidad";
  const corto =
    esNc &&
    !llevaPlanSiempre(h) &&
    (h.accionRequerida === false ||
      h.resultadoCierre === "con_correccion" ||
      h.resultadoCierre === "sin_accion" ||
      h.estado === "por_validar");
  const pasos: Paso[] = corto
    ? [REGISTRO, ACEPTADO, CORRECCION, DECISION, CIERRE]
    : [
        REGISTRO,
        ACEPTADO,
        ...(esNc ? [CORRECCION] : []),
        ...(esNc && !accionObligada(h) ? [DECISION] : []),
        CAUSA,
        PLAN,
        EJECUCION,
        VERIFICACION,
        EFICACIA,
        CIERRE,
      ];
  const orden = ORDEN.indexOf(PASO_DE_ESTADO[h.estado]);
  // El primer paso de la lista que no queda antes del paso del estado; si ese paso no está, el siguiente.
  let actual = pasos.findIndex((p) => ORDEN.indexOf(p.clave) >= orden);
  if (actual === -1) actual = pasos.length - 1;
  return pasos.map((p, i) => ({
    ...p,
    estado: h.estado === "cerrado" || i < actual ? "hecho" : i === actual ? "actual" : "falta",
  }));
}

/**
 * Las marcas de un hallazgo (spec §8.1 y §7.2), las mismas en la lista y en la página. La de vencido es solo de las
 * actividades; el paso en curso tiene su propio «Vencido hace N días» en la columna «Vence».
 */
export function marcasDeHallazgo(
  h: Pick<HallazgoBase, "estado" | "ronda" | "origen" | "reincidenteDe">,
  x: { cargado: boolean; algunaActividadVencida: boolean },
): string[] {
  const abierto = !TERMINALES.includes(h.estado);
  const marcas: string[] = [];
  if (abierto && esExterno(h.origen)) marcas.push("Prioridad alta");
  if (abierto && h.ronda > 1) marcas.push(`Reabierto · ronda ${h.ronda}`);
  if (h.reincidenteDe !== null) marcas.push("Reincidente");
  if (x.cargado) marcas.push("Cargado");
  if (abierto && x.algunaActividadVencida) marcas.push("Con algo vencido");
  return marcas;
}
