import { fechaDeDia, fechaLargaDeDia } from "./formato";
import type { Clase, CriterioEficacia, Criticidad, EstadoActividad, EstadoAjuste, MetodoDeVerificacion, TipoAccion } from "./tipos";

/**
 * El aviso a cada responsable cuando su actividad le llega (spec §8.6, §14.2 y §15): es la «delegación». Al aprobarse el plan y,
 * en un hallazgo cargado, al subirse su formato firmado.
 */
export const ACTIVIDAD_ASIGNADA = "Tiene una actividad a su cargo";

/** El cuerpo de ese aviso: la descripción sin su punto final y la fecha de fin, nunca el contenido del hallazgo. */
export function cuerpoDeActividadAsignada(descripcion: string, fin: string): string {
  return `${descripcion.trim().replace(/[.\s]+$/, "")}. Fecha de fin: ${fechaLargaDeDia(fin)}.`;
}

/** Va en todo formulario del módulo con texto libre (spec §6.4). */
export const AVISO_SIN_PACIENTES = "No escriba nombres ni documentos de pacientes o de quien se quejó. Use el número del caso.";

export const ETIQUETA_CLASE: Record<Clase, string> = {
  no_conformidad: "No conformidad",
  observacion: "Observación",
  oportunidad: "Oportunidad de mejora",
};

export const ETIQUETA_CRITICIDAD: Record<Criticidad, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const ETIQUETA_TIPO_ACCION: Record<TipoAccion, string> = {
  correctiva: "Correctiva",
  preventiva: "Preventiva",
  mejora: "De mejora",
};

export const ETIQUETA_CRITERIO: Record<CriterioEficacia, string> = {
  no_recurrencia: "No recurrencia",
  mejora_indicador: "Mejora del indicador asociado",
  reduccion_pqrs: "Reducción de PQRS o eventos",
  otro: "Otro",
};

/** Cómo verificó quien verifica la implementación (spec §11.4, maqueta 7). */
export const ETIQUETA_METODO_VERIFICACION: Record<MetodoDeVerificacion, string> = {
  evidencias: "Revisión de evidencias",
  observacion: "Observación en sitio",
  auditoria: "Auditoría de seguimiento",
  entrevista: "Entrevista",
};

/** Un usuario de un selector: su nombre, su cargo y, para distinguir homónimos, su usuario de ingreso. */
export type UsuarioDeSelector = { id: number; nombre: string; cargo?: string | null; usuario?: string | null };

/** «Nombre · cargo», o solo el nombre sin cargo. */
const visibleDe = (u: UsuarioDeSelector) => (u.cargo ? `${u.nombre} · ${u.cargo}` : u.nombre);

/**
 * El texto de cada usuario en un selector de responsables: «nombre · cargo»; si dos se ven igual (el mismo nombre y el mismo
 * cargo), cada uno añade su usuario de ingreso entre paréntesis. Solo los homónimos lo llevan.
 */
export function etiquetasDeUsuarios(usuarios: readonly UsuarioDeSelector[]): Map<number, string> {
  const veces = new Map<string, number>();
  for (const u of usuarios) veces.set(visibleDe(u), (veces.get(visibleDe(u)) ?? 0) + 1);
  return new Map(
    usuarios.map((u) => {
      const visible = visibleDe(u);
      return [u.id, (veces.get(visible) ?? 0) > 1 && u.usuario ? `${visible} (${u.usuario})` : visible];
    }),
  );
}

/** El texto de un usuario en un selector: el que le dio la lectura (`etiqueta`) o, sin él, «nombre · cargo». */
export const textoDeUsuario = (u: UsuarioDeSelector & { etiqueta?: string }): string => u.etiqueta ?? visibleDe(u);

export const ETIQUETA_ESTADO_ACTIVIDAD: Record<EstadoActividad, string> = {
  abierta: "Abierta",
  en_proceso: "En proceso",
  terminada: "Terminada",
  cancelada: "Cancelada",
};

/** Una sola frase por regla (la del guardado y la de las faltas del plan). */
export const inicioDespuesDelFin = (actividad: string) => `El inicio de la actividad ${actividad} no puede ser posterior a su fin`;

/** El indicador guardado en el criterio de eficacia ya no se puede elegir: lo dicen las faltas del plan y su formulario. */
export const INDICADOR_YA_NO_SE_ENLAZA = "El indicador elegido ya no se puede enlazar";

export const ETIQUETA_ESTADO_AJUSTE: Record<EstadoAjuste, string> = {
  pendiente: "Por decidir",
  aprobado: "Aprobado",
  negado: "Negado",
};

/**
 * El comienzo del título de la tarea de quien actúa por el proceso ante la actividad de un responsable inactivo (spec §14.1):
 * «Reasignar: <descripción>». «Mis tareas» agrupa las actividades y las distingue por él.
 */
export const PREFIJO_REASIGNAR = "Reasignar: ";

/** La nota con que se niegan los ajustes pendientes de un hallazgo que se anula (spec §7.6 y §10.6). */
export const AJUSTE_POR_ANULACION = "Se anuló el hallazgo";

/** La nota de los formularios que piden un ajuste (spec §10.6 y maqueta 6). */
export const MIENTRAS_SE_DECIDE = "Lo decide quien aprobó el plan. Mientras se decide, la actividad sigue contando como vencida.";

/**
 * Lo que pide un ajuste, en una frase (spec §10.6): la actividad por su etiqueta («A1.2»), la acción por la suya («A1») y las
 * fechas; nunca la causa ni el texto de la actividad nueva. La usan los avisos, «Lo que sigue» y «Ajustes del plan».
 */
export function fraseDelAjuste(x: {
  tipo: string;
  actividad?: string | null;
  finAntes?: string | null;
  finNuevo?: string | null;
  accion?: string | null;
  accionNueva?: boolean;
}): string {
  const actividad = x.actividad ? `la actividad ${x.actividad}` : "una actividad";
  if (x.tipo === "reprogramar") {
    const fechas = [x.finAntes ? `del ${fechaDeDia(x.finAntes)}` : null, x.finNuevo ? `al ${fechaDeDia(x.finNuevo)}` : null].filter(Boolean);
    return `Reprogramar ${actividad}${fechas.length > 0 ? ` ${fechas.join(" ")}` : ""}.`;
  }
  if (x.tipo === "agregar") {
    const donde = x.accionNueva ? " en una acción nueva del plan" : x.accion ? ` a la acción ${x.accion}` : "";
    return `Añadir una actividad${donde}${x.finNuevo ? `, con fin el ${fechaDeDia(x.finNuevo)}` : ""}.`;
  }
  if (x.tipo === "cancelar") return `Cancelar ${actividad}.`;
  return "Un ajuste del plan.";
}
