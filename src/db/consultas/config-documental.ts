import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { revisarFormatoActa } from "@/db/consultas/formato-acta";
import { validarFormato } from "@/lib/tramites/codigo";

export type ConfigDocumental = {
  formatoCodigo: string | null;
  plazos: {
    visto_bueno: number;
    aceptacion: number;
    elaboracion: number;
    ajustes: number;
    revision: number;
    aprobacion: number;
    publicacion: number;
  };
  escalamientoDias: number;
  publicacionDirecta: boolean;
  formatoActa: { documentoId: number | null; margenSuperiorCm: number; margenInferiorCm: number };
  distribucion: Distribucion;
};

export type Distribucion = {
  plazoRecibidoDias: number;
  plazoRecogidaDias: number;
  plazoAcuseDias: number;
  plazoSocializacionDias: number;
  plazoCorreccionDias: number;
  verificacionCadaDias: number;
  umbralConformidadPct: number;
  selloFranjaCm: number;
  selloQrCm: number;
};

export const CONFIG_DOCUMENTAL_DEFECTO: ConfigDocumental = {
  formatoCodigo: null,
  plazos: { visto_bueno: 3, aceptacion: 3, elaboracion: 15, ajustes: 5, revision: 5, aprobacion: 5, publicacion: 2 },
  escalamientoDias: 3,
  publicacionDirecta: true,
  formatoActa: { documentoId: null, margenSuperiorCm: 5.5, margenInferiorCm: 3.5 },
  distribucion: {
    plazoRecibidoDias: 3,
    plazoRecogidaDias: 5,
    plazoAcuseDias: 15,
    plazoSocializacionDias: 30,
    plazoCorreccionDias: 5,
    verificacionCadaDias: 90,
    umbralConformidadPct: 95,
    selloFranjaCm: 1.0,
    selloQrCm: 1.5,
  },
};

/** Campo de `Distribucion`, su clave en `configuracion`, cómo se nombra en los errores y su rango. */
const CAMPOS_DISTRIBUCION: { campo: keyof Distribucion; clave: string; que: string; minimo: number; maximo: number; decimal?: true }[] = [
  { campo: "plazoRecibidoDias", clave: "plazo_recibido_dias", que: "El plazo para confirmar el recibido", minimo: 1, maximo: 365 },
  { campo: "plazoRecogidaDias", clave: "plazo_recogida_dias", que: "El plazo de recogida de copias", minimo: 1, maximo: 365 },
  { campo: "plazoAcuseDias", clave: "plazo_acuse_dias", que: "El plazo del acuse de lectura", minimo: 1, maximo: 365 },
  { campo: "plazoSocializacionDias", clave: "plazo_socializacion_dias", que: "El plazo de socialización", minimo: 1, maximo: 365 },
  { campo: "plazoCorreccionDias", clave: "plazo_correccion_dias", que: "El plazo de corrección", minimo: 1, maximo: 365 },
  { campo: "verificacionCadaDias", clave: "verificacion_cada_dias", que: "Los días entre verificaciones", minimo: 1, maximo: 365 },
  { campo: "umbralConformidadPct", clave: "umbral_conformidad_pct", que: "El umbral de conformidad", minimo: 50, maximo: 100 },
  { campo: "selloFranjaCm", clave: "sello_franja_cm", que: "El alto de la franja del sello", minimo: 0.5, maximo: 3, decimal: true },
  { campo: "selloQrCm", clave: "sello_qr_cm", que: "El tamaño del código QR", minimo: 1, maximo: 3, decimal: true },
];

const CLAVES = [
  "formato_codigo",
  "plazo_visto_bueno_dias",
  "plazo_aceptacion_dias",
  "plazo_elaboracion_dias",
  "plazo_ajustes_dias",
  "plazo_revision_dias",
  "plazo_aprobacion_dias",
  "plazo_publicacion_dias",
  "escalamiento_dias",
  "publicacion_directa",
  "formato_acta_documento_id",
  "formato_acta_margen_superior_cm",
  "formato_acta_margen_inferior_cm",
  ...CAMPOS_DISTRIBUCION.map((c) => c.clave),
];

const MARGEN_MAXIMO_CM = 12;
const SUMA_MARGENES_MAXIMA_CM = 16;

function dias(valor: string | undefined, defecto: number): number {
  const limpio = valor?.trim() ?? "";
  if (!/^\d{1,3}$/.test(limpio)) return defecto;
  const n = Number(limpio);
  return n <= 365 ? n : defecto;
}

function centimetros(valor: string | undefined, defecto: number): number {
  const limpio = valor?.trim() ?? "";
  if (!/^\d{1,2}(\.\d+)?$/.test(limpio)) return defecto;
  const n = Number(limpio);
  return n <= MARGEN_MAXIMO_CM ? n : defecto;
}

function numeroEntre(valor: string | undefined, defecto: number, minimo: number, maximo: number, decimal: boolean): number {
  const limpio = valor?.trim() ?? "";
  if (!(decimal ? /^\d{1,3}(\.\d+)?$/ : /^\d{1,3}$/).test(limpio)) return defecto;
  const n = Number(limpio);
  return n >= minimo && n <= maximo ? n : defecto;
}

function idDeDocumento(valor: string | undefined): number | null {
  const limpio = valor?.trim() ?? "";
  return /^[1-9]\d{0,14}$/.test(limpio) ? Number(limpio) : null;
}

export async function obtenerConfigDocumental(opciones?: { sql?: Cliente }): Promise<ConfigDocumental> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion WHERE clave = ANY(${CLAVES})`;
  const valores = new Map(filas.map((f) => [f.clave as string, f.valor as string]));
  const plazo = (nombre: keyof ConfigDocumental["plazos"]) =>
    dias(valores.get(`plazo_${nombre}_dias`), CONFIG_DOCUMENTAL_DEFECTO.plazos[nombre]);
  const directa = valores.get("publicacion_directa")?.trim();
  const distribucion = { ...CONFIG_DOCUMENTAL_DEFECTO.distribucion };
  for (const c of CAMPOS_DISTRIBUCION) {
    distribucion[c.campo] = numeroEntre(valores.get(c.clave), CONFIG_DOCUMENTAL_DEFECTO.distribucion[c.campo], c.minimo, c.maximo, c.decimal === true);
  }

  return {
    formatoCodigo: valores.get("formato_codigo")?.trim() || null,
    plazos: {
      visto_bueno: plazo("visto_bueno"),
      aceptacion: plazo("aceptacion"),
      elaboracion: plazo("elaboracion"),
      ajustes: plazo("ajustes"),
      revision: plazo("revision"),
      aprobacion: plazo("aprobacion"),
      publicacion: plazo("publicacion"),
    },
    escalamientoDias: dias(valores.get("escalamiento_dias"), CONFIG_DOCUMENTAL_DEFECTO.escalamientoDias),
    publicacionDirecta:
      directa === "0" ? false : directa === "1" ? true : CONFIG_DOCUMENTAL_DEFECTO.publicacionDirecta,
    formatoActa: {
      documentoId: idDeDocumento(valores.get("formato_acta_documento_id")),
      margenSuperiorCm: centimetros(valores.get("formato_acta_margen_superior_cm"), CONFIG_DOCUMENTAL_DEFECTO.formatoActa.margenSuperiorCm),
      margenInferiorCm: centimetros(valores.get("formato_acta_margen_inferior_cm"), CONFIG_DOCUMENTAL_DEFECTO.formatoActa.margenInferiorCm),
    },
    distribucion,
  };
}

export type DatosConfigDocumental = {
  formatoCodigo: string;
  plazos: ConfigDocumental["plazos"];
  escalamientoDias: number;
  publicacionDirecta: boolean;
  formatoActa: ConfigDocumental["formatoActa"];
  distribucion: Distribucion;
};

function enteroEntre(valor: unknown, minimo: number, maximo: number, que: string): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${que} debe ser un número entero de ${minimo} a ${maximo}`);
  }
  return valor;
}

function margenEntre(valor: unknown, que: string): number {
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > MARGEN_MAXIMO_CM) {
    throw new Error(`${que} debe estar entre 0 y ${MARGEN_MAXIMO_CM} cm`);
  }
  return valor;
}

function numeroDeDistribucion(valor: unknown, c: (typeof CAMPOS_DISTRIBUCION)[number]): number {
  if (c.decimal) {
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < c.minimo || valor > c.maximo) {
      throw new Error(`${c.que} debe estar entre ${String(c.minimo).replace(".", ",")} y ${String(c.maximo).replace(".", ",")} cm`);
    }
    return valor;
  }
  return enteroEntre(valor, c.minimo, c.maximo, c.que);
}

const NOMBRE_PLAZO: Record<keyof ConfigDocumental["plazos"], string> = {
  visto_bueno: "El plazo del visto bueno",
  aceptacion: "El plazo de aceptación",
  elaboracion: "El plazo de elaboración",
  ajustes: "El plazo de ajustes",
  revision: "El plazo de revisión",
  aprobacion: "El plazo de aprobación",
  publicacion: "El plazo de publicación",
};

/**
 * Guarda las veintidós claves en una transacción y audita el antes y el después de las que cambiaron
 * (comparadas por su valor efectivo: una clave ausente vale lo que vale por defecto). Cerrar la
 * publicación directa no toca nada más: `descartarBorrador` sigue disponible con la carga cerrada.
 * El formato del acta solo se revisa si cambió: uno que dejó de servir, y que la pantalla ya avisa,
 * no impide guardar un plazo.
 */
export function guardarConfigDocumental(datos: DatosConfigDocumental, actorId: number): Promise<void> {
  return obtenerSql().begin((tx) => guardarConfigDocumentalEn(tx, datos, actorId));
}

/** El cuerpo de `guardarConfigDocumental` sobre una transacción ya abierta (los tests la revierten). */
export async function guardarConfigDocumentalEn(tx: TransactionSql, datos: DatosConfigDocumental, actorId: number): Promise<void> {
  const formato = typeof datos.formatoCodigo === "string" ? datos.formatoCodigo.trim() : "";
  const motivo = validarFormato(formato);
  if (motivo) throw new Error(motivo);
  const nuevos: Record<string, string> = { formato_codigo: formato };
  for (const nombre of Object.keys(NOMBRE_PLAZO) as (keyof ConfigDocumental["plazos"])[]) {
    nuevos[`plazo_${nombre}_dias`] = String(enteroEntre(datos.plazos?.[nombre], 0, 365, NOMBRE_PLAZO[nombre]));
  }
  nuevos.escalamiento_dias = String(enteroEntre(datos.escalamientoDias, 1, 60, "Los días para avisar al jefe"));
  nuevos.publicacion_directa = datos.publicacionDirecta === true ? "1" : "0";
  const margenSuperiorCm = margenEntre(datos.formatoActa?.margenSuperiorCm, "El espacio del encabezado");
  const margenInferiorCm = margenEntre(datos.formatoActa?.margenInferiorCm, "El espacio del pie");
  if (margenSuperiorCm + margenInferiorCm > SUMA_MARGENES_MAXIMA_CM) {
    throw new Error(`Entre los dos no pueden pasar de ${SUMA_MARGENES_MAXIMA_CM} cm`);
  }
  const documentoFormato = datos.formatoActa.documentoId;
  nuevos.formato_acta_documento_id = documentoFormato === null ? "" : String(documentoFormato);
  nuevos.formato_acta_margen_superior_cm = String(margenSuperiorCm);
  nuevos.formato_acta_margen_inferior_cm = String(margenInferiorCm);
  for (const c of CAMPOS_DISTRIBUCION) nuevos[c.clave] = String(numeroDeDistribucion(datos.distribucion?.[c.campo], c));

  {
    const actual = await obtenerConfigDocumental({ sql: tx });
    if (documentoFormato !== null && documentoFormato !== actual.formatoActa.documentoId) {
      const revision = await revisarFormatoActa(documentoFormato, { sql: tx });
      if (revision.estado === "no_sirve") throw new Error(revision.motivo);
      if (revision.estado === "perdido") throw new Error("El archivo del formato no se encuentra o cambió");
    }
    const antes: Record<string, string | null> = { formato_codigo: actual.formatoCodigo };
    for (const nombre of Object.keys(NOMBRE_PLAZO) as (keyof ConfigDocumental["plazos"])[]) {
      antes[`plazo_${nombre}_dias`] = String(actual.plazos[nombre]);
    }
    antes.escalamiento_dias = String(actual.escalamientoDias);
    antes.publicacion_directa = actual.publicacionDirecta ? "1" : "0";
    antes.formato_acta_documento_id = actual.formatoActa.documentoId === null ? "" : String(actual.formatoActa.documentoId);
    antes.formato_acta_margen_superior_cm = String(actual.formatoActa.margenSuperiorCm);
    antes.formato_acta_margen_inferior_cm = String(actual.formatoActa.margenInferiorCm);
    for (const c of CAMPOS_DISTRIBUCION) antes[c.clave] = String(actual.distribucion[c.campo]);

    const cambios: Record<string, { antes: string | null; despues: string }> = {};
    for (const [clave, valor] of Object.entries(nuevos)) {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      if (antes[clave] !== valor) cambios[clave] = { antes: antes[clave], despues: valor };
    }
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: "editar_config_documental", entidad: "configuracion", entidadId: null, detalle: { cambios },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista de verificación de la revisión: un ítem nunca se borra (las rondas ya respondidas lo citan)
// ─────────────────────────────────────────────────────────────────────────────

export const LARGO_MIN_ITEM = 5;
export const LARGO_MAX_ITEM = 300;

function textoDeItem(valor: string): string {
  const limpio = typeof valor === "string" ? valor.trim() : "";
  if (limpio.length < LARGO_MIN_ITEM || limpio.length > LARGO_MAX_ITEM) {
    throw new Error(`El texto del ítem debe tener entre ${LARGO_MIN_ITEM} y ${LARGO_MAX_ITEM} caracteres`);
  }
  return limpio;
}

async function itemBloqueado(tx: TransactionSql, id: number) {
  const [item] = await tx`SELECT id, texto, orden FROM lista_verificacion_items WHERE id = ${id} FOR UPDATE`;
  if (!item) throw new Error("El ítem no existe");
  return item;
}

const auditarItem = (tx: TransactionSql, actorId: number, accion: string, id: number, detalle: Record<string, unknown>) =>
  registrarAuditoria(tx, { usuarioId: actorId, accion, entidad: "lista_verificacion_items", entidadId: id, detalle });

type DatosItem = { texto: string; critico: boolean };

/** Todas las que cambian la lista toman el mismo candado: así el orden se calcula sobre una sola vista. */
const bloquear = (tx: TransactionSql) => tx`LOCK TABLE lista_verificacion_items IN SHARE ROW EXCLUSIVE MODE`;

export const crearItemVerificacion = (datos: DatosItem, actorId: number): Promise<number> =>
  obtenerSql().begin((tx) => crearItemVerificacionEn(tx, datos, actorId));

export async function crearItemVerificacionEn(tx: TransactionSql, datos: DatosItem, actorId: number): Promise<number> {
  const texto = textoDeItem(datos.texto);
  await bloquear(tx);
  const [item] = await tx`INSERT INTO lista_verificacion_items (texto, critico, orden)
    VALUES (${texto}, ${datos.critico === true}, (SELECT coalesce(max(orden), 0) + 1 FROM lista_verificacion_items))
    RETURNING id`;
  await auditarItem(tx, actorId, "crear_item_verificacion", Number(item.id), { texto, critico: datos.critico === true });
  return Number(item.id);
}

export const editarItemVerificacion = (id: number, datos: DatosItem, actorId: number): Promise<void> =>
  obtenerSql().begin((tx) => editarItemVerificacionEn(tx, id, datos, actorId));

export async function editarItemVerificacionEn(tx: TransactionSql, id: number, datos: DatosItem, actorId: number): Promise<void> {
  const texto = textoDeItem(datos.texto);
  await bloquear(tx);
  const anterior = await itemBloqueado(tx, id);
  await tx`UPDATE lista_verificacion_items SET texto = ${texto}, critico = ${datos.critico === true} WHERE id = ${id}`;
  await auditarItem(tx, actorId, "editar_item_verificacion", id, {
    texto, critico: datos.critico === true, textoAnterior: anterior.texto,
  });
}

export const moverItemVerificacion = (id: number, direccion: "arriba" | "abajo", actorId: number): Promise<void> =>
  obtenerSql().begin((tx) => moverItemVerificacionEn(tx, id, direccion, actorId));

/** Intercambia el orden con el ítem vecino (activo o no: la pantalla los muestra todos). */
export async function moverItemVerificacionEn(tx: TransactionSql, id: number, direccion: "arriba" | "abajo", actorId: number): Promise<void> {
  if (direccion !== "arriba" && direccion !== "abajo") throw new Error("Dirección inválida");
  await bloquear(tx);
  const item = await itemBloqueado(tx, id);
  const [vecino] = direccion === "arriba"
    ? await tx`SELECT id, orden FROM lista_verificacion_items
        WHERE (orden, id) < (${item.orden}, ${id}) ORDER BY orden DESC, id DESC LIMIT 1`
    : await tx`SELECT id, orden FROM lista_verificacion_items
        WHERE (orden, id) > (${item.orden}, ${id}) ORDER BY orden, id LIMIT 1`;
  if (!vecino) return;
  await tx`UPDATE lista_verificacion_items SET orden = ${vecino.orden} WHERE id = ${id}`;
  await tx`UPDATE lista_verificacion_items SET orden = ${item.orden} WHERE id = ${vecino.id}`;
  await auditarItem(tx, actorId, "mover_item_verificacion", id, { texto: item.texto, direccion });
}

export const alternarItemVerificacion = (id: number, activo: boolean, actorId: number): Promise<void> =>
  obtenerSql().begin((tx) => alternarItemVerificacionEn(tx, id, activo, actorId));

export async function alternarItemVerificacionEn(tx: TransactionSql, id: number, activo: boolean, actorId: number): Promise<void> {
  await bloquear(tx);
  const item = await itemBloqueado(tx, id);
  await tx`UPDATE lista_verificacion_items SET activo = ${activo === true} WHERE id = ${id}`;
  await auditarItem(tx, actorId, "alternar_item_verificacion", id, { texto: item.texto, activo: activo === true });
}
