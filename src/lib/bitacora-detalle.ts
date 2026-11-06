import type { Accion } from "@/lib/tramites/transiciones";

export type EventoAuditoria = {
  accion: string;
  entidad: string;
  entidadId: number | null;
  detalle: Record<string, unknown>;
  codigoDocumento?: string | null;
};

const SINGULAR: Record<string, string> = {
  macroprocesos: "macroproceso",
  procesos: "proceso",
  subprocesos: "subproceso",
  tipos_documento: "tipo de documento",
  elementos_perifericos: "elemento periférico",
  areas: "área",
  cargos: "cargo",
};

/** Nombre legible de cada clave de `configuracion` que audita `editar_configuracion`. */
const NOMBRE_CLAVE_ENTIDAD: Record<string, string> = {
  nombre_entidad: "nombre",
  sigla_entidad: "sigla",
  lema: "lema",
  aviso_datos_personales: "aviso de datos personales",
  color_primario: "color primario",
  color_secundario: "color secundario",
};
const NOMBRE_CLAVE_MAPA: Record<string, string> = {
  subtitulo_mapa: "subtítulo del mapa",
  titulo_phva: "título del ciclo PHVA",
  texto_phva: "texto del ciclo PHVA",
  patron_codigo: "patrón del código",
};

/** «Editó la entidad y la marca: nombre, sigla…» según las claves guardadas (Entidad y marca o Textos del mapa). */
function describirConfiguracion(claves: unknown): string {
  const lista = Array.isArray(claves) ? claves.filter((c): c is string => typeof c === "string" && c.length > 0) : [];
  if (lista.length === 0) return "Editó la configuración";
  // Object.hasOwn: una clave como «constructor» no debe leer el prototipo.
  const nombre = (c: string) =>
    Object.hasOwn(NOMBRE_CLAVE_ENTIDAD, c) ? NOMBRE_CLAVE_ENTIDAD[c]
    : Object.hasOwn(NOMBRE_CLAVE_MAPA, c) ? NOMBRE_CLAVE_MAPA[c]
    : c.replace(/_+/g, " ").trim();
  const nombres = lista.map(nombre).join(", ");
  if (lista.every((c) => Object.hasOwn(NOMBRE_CLAVE_ENTIDAD, c))) return `Editó la entidad y la marca: ${nombres}`;
  if (lista.every((c) => Object.hasOwn(NOMBRE_CLAVE_MAPA, c))) return `Editó los textos del mapa y el código de documentos: ${nombres}`;
  return `Editó la configuración: ${nombres}`;
}

/** Lo que se hace dentro de la revisión sin mover el trámite de etapa: no pasa por `transicionar`. */
const ACCIONES_REVISION = [
  "guardar_lista",
  "crear_observacion",
  "responder_observacion",
  "cerrar_observacion",
  "reabrir_observacion",
] as const;

const ACCIONES_TRAMITE: Record<Accion | "solicitar" | "corregir_datos" | (typeof ACCIONES_REVISION)[number], string> = {
  solicitar: "Registró la solicitud",
  guardar_lista: "Guardó la lista de verificación de la solicitud",
  crear_observacion: "Escribió una observación en la solicitud",
  responder_observacion: "Respondió una observación de la solicitud",
  cerrar_observacion: "Cerró una observación de la solicitud",
  reabrir_observacion: "Reabrió una observación de la solicitud",
  dar_visto_bueno: "Dio el visto bueno a la solicitud",
  negar_visto_bueno: "Negó el visto bueno a la solicitud",
  retirar: "Retiró la solicitud",
  aceptar: "Aceptó la solicitud",
  rechazar: "Rechazó la solicitud",
  enviar_a_revision: "Envió a revisión la solicitud",
  devolver_revision: "Devolvió a elaboración la solicitud",
  concepto_favorable: "Dio concepto favorable a la solicitud",
  aprobar: "Aprobó la solicitud",
  devolver_aprobacion: "Devolvió a elaboración la solicitud",
  negar_eliminacion: "Negó la eliminación pedida en la solicitud",
  publicar: "Publicó el resultado de la solicitud",
  aprobar_y_publicar: "Aprobó y publicó el resultado de la solicitud",
  cancelar: "Canceló la solicitud",
  reasignar: "Reasignó la solicitud",
  corregir_datos: "Corrigió los datos del documento de la solicitud",
};

/** «Aprobó la solicitud SOL-2026-014 sobre GTH-PR-02». Una creación aún sin documento no lleva código. */
function describirTramite(accion: string, numero: string, codigo: string | null, observacion?: unknown): string {
  const clave = accion.slice("tramite_".length);
  const sobre = codigo ? ` sobre ${codigo}` : "";
  const cual = (ACCIONES_REVISION as readonly string[]).includes(clave) && typeof observacion === "number" ? ` (observación ${observacion})` : "";
  return Object.hasOwn(ACCIONES_TRAMITE, clave)
    ? `${ACCIONES_TRAMITE[clave as keyof typeof ACCIONES_TRAMITE]} ${numero}${sobre}${cual}`
    : `Acción «${accion}» sobre la solicitud ${numero}${sobre}`;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

const NOMBRE_DATO_DOCUMENTO: Record<string, string> = {
  codigo: "código",
  titulo: "título",
  tipo: "tipo",
  descripcion: "descripción",
  palabrasClave: "palabras clave",
  nivelAcceso: "nivel de acceso",
  asociaciones: "procesos donde aplica",
  relacionados: "documentos relacionados",
};

/** «: título, nivel de acceso», según lo que cambió; vacío en una fila anterior a la Fase 13A. */
function datosCambiados(despues: unknown): string {
  if (typeof despues !== "object" || despues === null) return "";
  const nombres = Object.keys(despues).map((d) => (Object.hasOwn(NOMBRE_DATO_DOCUMENTO, d) ? NOMBRE_DATO_DOCUMENTO[d] : d));
  return nombres.length > 0 ? `: ${nombres.join(", ")}` : "";
}

/**
 * Traduce un evento de auditoría a una frase en español legible. Función pura;
 * nunca vuelca JSON crudo ni interpreta el detalle como HTML. Fallback seguro
 * para acciones no mapeadas: el registro sigue siendo inteligible.
 */
export function describirEvento(e: EventoAuditoria): string {
  const d = e.detalle ?? {};
  const cod = e.codigoDocumento ?? texto(d.codigo);
  const nombre = texto(d.nombre) ?? texto(d.texto);

  switch (e.accion) {
    case "ingreso":
      return "Inició sesión";
    case "salida":
      return "Cerró sesión";
    case "crear_documento":
      return `Creó el documento ${cod ?? "?"} — ${texto(d.titulo) ?? ""}`.trimEnd();
    case "editar_documento":
      return `Editó el documento ${cod ?? "?"}${datosCambiados(d.despues)}`;
    case "editar_control":
      return `Corrigió los datos de control de ${cod ?? "un documento"}${datosCambiados(d.despues)}`;
    case "deshacer_carga":
      return `Deshizo la carga de la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}: ${texto(d.motivo) ?? "sin motivo"}`;
    case "descartar_borrador":
      return `Descartó el borrador de la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "crear_version":
      return `Creó la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "publicar_version":
      return `Publicó la versión ${d.numero ?? "?"} de ${cod ?? "un documento"}`;
    case "editar_version":
      return `Editó una versión de ${cod ?? "un documento"}`;
    case "subir_archivo":
      return `Subió el archivo «${texto(d.nombre) ?? "?"}»`;
    case "eliminar_archivo":
      return `Eliminó el archivo «${texto(d.nombre) ?? "?"}»`;
    case "anular_documento":
      return `Anuló ${cod ?? "un documento"} (versión vigente ${d.versionAnulada ?? "?"})`;
    case "exporto_maestro":
      return `Emitió el Listado Maestro (${texto(d.formato) ?? "?"}, ${texto(d.incluir) ?? "?"})`;
    case "subir_logo":
      return `Cambió el logo de la entidad («${texto(d.nombre) ?? "?"}», ${d.ancho ?? "?"} × ${d.alto ?? "?"})`;
    case "quitar_logo":
      return "Quitó el logo de la entidad";
    case "cambiar_clave":
      return "Cambió su clave";
    case "aceptar_aviso_datos":
      return "Aceptó el aviso de tratamiento de datos personales";
    case "activar_segundo_factor":
      return "Activó el segundo factor";
    case "quitar_segundo_factor": {
      const afectado = texto(d.usuario);
      return afectado ? `Quitó el segundo factor de «${afectado}»` : "Desactivó el segundo factor";
    }
    case "crear_usuario":
      return `Creó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "editar_usuario":
      return `Editó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "desactivar_usuario":
      return `Desactivó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "reactivar_usuario":
      return `Reactivó el usuario «${texto(d.usuario) ?? "?"}»`;
    case "restablecer_clave":
      return `Restableció la clave de «${texto(d.usuario) ?? "?"}»`;
    case "cerrar_sesion_forzado":
      return `Cerró la sesión de «${texto(d.usuario) ?? "?"}»`;
    case "desbloquear_usuario":
      return `Desbloqueó al usuario «${texto(d.usuario) ?? "?"}»`;
    case "crear_usuarios_lote":
      return `Creó ${d.creados ?? 0} usuarios por lote (${d.fallidos ?? 0} rechazados)`;
    case "editar_configuracion":
      return describirConfiguracion(d.claves);
  }

  if (e.accion.startsWith("tramite_")) return describirTramite(e.accion, texto(d.numero) ?? "?", cod, d.observacion);

  // Acciones de mapa dinámicas: <verbo>_<singular>.
  const verbos: Record<string, string> = {
    reordenar: "Reordenó",
    activar: "Activó",
    desactivar: "Desactivó",
    borrar: "Borró",
    crear: "Creó",
    editar: "Editó",
  };
  const m = /^(reordenar|activar|desactivar|borrar|crear|editar)_(.+)$/.exec(e.accion);
  if (m) {
    const tipo = SINGULAR[e.entidad] ?? m[2].replace(/_/g, " ");
    const suf = nombre ? ` «${nombre}»` : "";
    return `${verbos[m[1]]} el ${tipo}${suf}`;
  }

  return `Acción «${e.accion}» sobre ${e.entidad}${e.entidadId ? ` #${e.entidadId}` : ""}`;
}
