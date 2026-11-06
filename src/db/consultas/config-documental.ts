import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
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
};

export const CONFIG_DOCUMENTAL_DEFECTO: ConfigDocumental = {
  formatoCodigo: null,
  plazos: { visto_bueno: 3, aceptacion: 3, elaboracion: 15, ajustes: 5, revision: 5, aprobacion: 5, publicacion: 2 },
  escalamientoDias: 3,
  publicacionDirecta: true,
};

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
];

function dias(valor: string | undefined, defecto: number): number {
  const limpio = valor?.trim() ?? "";
  if (!/^\d{1,3}$/.test(limpio)) return defecto;
  const n = Number(limpio);
  return n <= 365 ? n : defecto;
}

export async function obtenerConfigDocumental(opciones?: { sql?: Cliente }): Promise<ConfigDocumental> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion WHERE clave = ANY(${CLAVES})`;
  const valores = new Map(filas.map((f) => [f.clave as string, f.valor as string]));
  const plazo = (nombre: keyof ConfigDocumental["plazos"]) =>
    dias(valores.get(`plazo_${nombre}_dias`), CONFIG_DOCUMENTAL_DEFECTO.plazos[nombre]);
  const directa = valores.get("publicacion_directa")?.trim();

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
  };
}

export type DatosConfigDocumental = {
  formatoCodigo: string;
  plazos: ConfigDocumental["plazos"];
  escalamientoDias: number;
  publicacionDirecta: boolean;
};

function enteroEntre(valor: unknown, minimo: number, maximo: number, que: string): number {
  if (typeof valor !== "number" || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new Error(`${que} debe ser un número entero de ${minimo} a ${maximo}`);
  }
  return valor;
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
 * Guarda las diez claves en una transacción y audita el antes y el después de las que cambiaron
 * (comparadas por su valor efectivo: una clave ausente vale lo que vale por defecto). Cerrar la
 * publicación directa no toca nada más: `descartarBorrador` sigue disponible con la carga cerrada.
 */
export async function guardarConfigDocumental(datos: DatosConfigDocumental, actorId: number): Promise<void> {
  const formato = typeof datos.formatoCodigo === "string" ? datos.formatoCodigo.trim() : "";
  const motivo = validarFormato(formato);
  if (motivo) throw new Error(motivo);
  const nuevos: Record<string, string> = { formato_codigo: formato };
  for (const nombre of Object.keys(NOMBRE_PLAZO) as (keyof ConfigDocumental["plazos"])[]) {
    nuevos[`plazo_${nombre}_dias`] = String(enteroEntre(datos.plazos?.[nombre], 0, 365, NOMBRE_PLAZO[nombre]));
  }
  nuevos.escalamiento_dias = String(enteroEntre(datos.escalamientoDias, 1, 60, "Los días para avisar al jefe"));
  nuevos.publicacion_directa = datos.publicacionDirecta === true ? "1" : "0";

  await obtenerSql().begin(async (tx) => {
    const actual = await obtenerConfigDocumental({ sql: tx });
    const antes: Record<string, string | null> = { formato_codigo: actual.formatoCodigo };
    for (const nombre of Object.keys(NOMBRE_PLAZO) as (keyof ConfigDocumental["plazos"])[]) {
      antes[`plazo_${nombre}_dias`] = String(actual.plazos[nombre]);
    }
    antes.escalamiento_dias = String(actual.escalamientoDias);
    antes.publicacion_directa = actual.publicacionDirecta ? "1" : "0";

    const cambios: Record<string, { antes: string | null; despues: string }> = {};
    for (const [clave, valor] of Object.entries(nuevos)) {
      await tx`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
        ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      if (antes[clave] !== valor) cambios[clave] = { antes: antes[clave], despues: valor };
    }
    await registrarAuditoria(tx, {
      usuarioId: actorId, accion: "editar_config_documental", entidad: "configuracion", entidadId: null, detalle: { cambios },
    });
  });
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

export async function crearItemVerificacion(datos: { texto: string; critico: boolean }, actorId: number): Promise<number> {
  const texto = textoDeItem(datos.texto);
  return obtenerSql().begin(async (tx) => {
    await tx`LOCK TABLE lista_verificacion_items IN SHARE ROW EXCLUSIVE MODE`;
    const [item] = await tx`INSERT INTO lista_verificacion_items (texto, critico, orden)
      VALUES (${texto}, ${datos.critico === true}, (SELECT coalesce(max(orden), 0) + 1 FROM lista_verificacion_items))
      RETURNING id`;
    await auditarItem(tx, actorId, "crear_item_verificacion", Number(item.id), { texto, critico: datos.critico === true });
    return Number(item.id);
  });
}

export async function editarItemVerificacion(
  id: number,
  datos: { texto: string; critico: boolean },
  actorId: number,
): Promise<void> {
  const texto = textoDeItem(datos.texto);
  await obtenerSql().begin(async (tx) => {
    const anterior = await itemBloqueado(tx, id);
    await tx`UPDATE lista_verificacion_items SET texto = ${texto}, critico = ${datos.critico === true} WHERE id = ${id}`;
    await auditarItem(tx, actorId, "editar_item_verificacion", id, {
      texto, critico: datos.critico === true, textoAnterior: anterior.texto,
    });
  });
}

/** Intercambia el orden con el ítem vecino (activo o no: la pantalla los muestra todos). */
export async function moverItemVerificacion(id: number, direccion: "arriba" | "abajo", actorId: number): Promise<void> {
  if (direccion !== "arriba" && direccion !== "abajo") throw new Error("Dirección inválida");
  await obtenerSql().begin(async (tx) => {
    await tx`LOCK TABLE lista_verificacion_items IN SHARE ROW EXCLUSIVE MODE`;
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
  });
}

export async function alternarItemVerificacion(id: number, activo: boolean, actorId: number): Promise<void> {
  await obtenerSql().begin(async (tx) => {
    const item = await itemBloqueado(tx, id);
    await tx`UPDATE lista_verificacion_items SET activo = ${activo === true} WHERE id = ${id}`;
    await auditarItem(tx, actorId, "alternar_item_verificacion", id, { texto: item.texto, activo: activo === true });
  });
}
