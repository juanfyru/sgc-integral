/**
 * Ayudantes de todos los tests del flujo documental. Corren dentro de una transacción que
 * se revierte (`revertida`): lo que crean aquí no sobrevive al test.
 */
import type { Row, TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import { crearSolicitud, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/tramites-flujo";
import type { Rol } from "@/lib/roles";

function aSesion(u: Row): SesionFlujo {
  return {
    sesionId: `prueba-${u.id}`,
    usuarioId: Number(u.id),
    usuario: u.usuario,
    nombre: u.nombre,
    rol: u.rol,
    verHistorial: u.ver_historial,
  };
}

/** Lee a un usuario que ya existe, por ejemplo uno de la demo. */
export async function sesionDe(sql: Cliente, usuario: string): Promise<SesionFlujo> {
  const [u] = await sql`SELECT id, usuario, nombre, rol, ver_historial FROM usuarios WHERE usuario = ${usuario}`;
  if (!u) throw new Error(`No existe el usuario de prueba «${usuario}»`);
  return aSesion(u);
}

let consecutivo = 0;

/** Crea un usuario activo dentro de la transacción; `procesos` son ids de `procesos`. */
export async function usuarioDePrueba(
  tx: TransactionSql,
  datos: { rol: Rol; procesos?: number[]; jefeId?: number },
): Promise<SesionFlujo> {
  consecutivo += 1;
  const usuario = `zz_tramite_${Date.now()}_${consecutivo}`;
  const [u] = await tx`INSERT INTO usuarios (usuario, nombre, hash_clave, rol, jefe_inmediato_id)
    VALUES (${usuario}, ${`Prueba ${consecutivo}`}, 'x', ${datos.rol}, ${datos.jefeId ?? null})
    RETURNING id, usuario, nombre, rol, ver_historial`;
  for (const procesoId of datos.procesos ?? []) {
    await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${u.id}, ${procesoId})`;
  }
  return aSesion(u);
}

export function sesionAdmin(tx: TransactionSql): Promise<SesionFlujo> {
  return usuarioDePrueba(tx, { rol: "admin_sgc" });
}

/** Opciones del flujo para un test: la transacción, una hora fija y una firma que siempre pasa. */
export function opc(tx: TransactionSql, ahora = "2026-11-05T15:00:00Z"): OpcionesFlujo {
  return { sql: tx, ahora: new Date(ahora), verificar: async () => ({ ok: true, metodo: "clave" }) };
}

/** Lo que `aceptarCreacion`, que no consulta la BD, necesita de la última solicitud de creación. */
let ultimaSolicitud: { procesoId: number; tipoDocumentoId: number; titulo: string } | null = null;

/** Deja una creación en `aceptacion`: la pide el líder de CEX, así que el visto bueno queda dado. */
export async function solicitudDeCreacion(tx: TransactionSql, d: { proceso: string; tipo: string; titulo: string }) {
  const admin = await sesionAdmin(tx);
  const gerente = await sesionDe(tx, "gerente");
  const liderCex = await sesionDe(tx, "lider.cex");
  const [{ id: procesoId }] = await tx`SELECT id FROM procesos WHERE sigla = ${d.proceso}`;
  const [{ id: tipoDocumentoId }] = await tx`SELECT id FROM tipos_documento WHERE sigla = ${d.tipo}`;
  const { tramiteId } = await crearSolicitud(
    liderCex,
    { tipo: "crear", motivo: "solicitud_personal", justificacion: "Se necesita para la atención.", procesoId, tipoDocumentoId, tituloPropuesto: d.titulo },
    opc(tx),
  );
  ultimaSolicitud = { procesoId, tipoDocumentoId, titulo: d.titulo };
  return { admin, gerente, liderCex, tramiteId, procesoId, tipoDocumentoId };
}

/** Los datos de `aceptar` en la última creación, como salen de `EsquemaAceptarCreacion`. */
export function aceptarCreacion(parcial: Record<string, unknown>): Record<string, unknown> {
  if (!ultimaSolicitud) throw new Error("aceptarCreacion va después de solicitudDeCreacion");
  const { procesoId, tipoDocumentoId, titulo } = ultimaSolicitud;
  return {
    decision: "nuevo",
    tipoDocumentoId,
    asociaciones: [{ procesoId, esPrincipal: true }],
    titulo,
    relacionados: [],
    nivelAcceso: "general",
    venceElaboracion: "2026-11-20",
    ...parcial,
  };
}
