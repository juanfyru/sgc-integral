/**
 * Ayudantes de los tests de vigencia (Fase 13C). Corren dentro de una transacción que se revierte; los
 * archivos que escriben en el almacén se borran con `limpiar` (o con la carpeta temporal del test).
 */
import type { TransactionSql } from "postgres";
import type { Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { adoptarEdicion, registrarExterno, type DatosExterno } from "@/db/consultas/vigencia/externos";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { abrirRevision, revisionAbiertaBloqueada, sacarDeLaFoto } from "@/db/consultas/vigencia/revision-anual";
import type { Verificador } from "@/lib/firma";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { fechaEnZona } from "@/lib/tramites/plazos";
import type { Autoridad } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { archivoPrincipal, documentoLibre, type DocumentoLibre } from "./tramites";

export type DocumentoVigente = DocumentoLibre & {
  versionId: number;
  procesoId: number;
  /** Ruta relativa del principal en el almacén: un PDF real, con su huella registrada. */
  ruta: string;
  hash: string;
  limpiar: () => Promise<void>;
};

/** El tipo de documento de cada autoridad: Procedimiento (operativo) o Manual (estratégico). */
const TIPO_DE_AUTORIDAD: Record<Autoridad, string> = { operativo: "PR", estrategico: "MN" };

/**
 * Un documento vigente aprobado fuera de la plataforma con esa fecha de aprobación, cargado ayer
 * (`publicado_en`), en `proceso` (GTH si no se dice), con un PDF real como principal. El test llama
 * `limpiar` si el almacén no es una carpeta temporal.
 */
export async function vigenteFuera(
  tx: TransactionSql,
  d: { fechaAprobacion: string; proceso?: string; autoridad?: Autoridad },
): Promise<DocumentoVigente> {
  const proceso = d.proceso ?? "GTH";
  const documento = await documentoLibre(tx, { proceso, tipo: TIPO_DE_AUTORIDAD[d.autoridad ?? "operativo"] });
  const [v] = await tx`UPDATE documento_versiones
    SET fecha_aprobacion = ${d.fechaAprobacion}, origen_aprobacion = 'fuera', publicado_en = now() - interval '1 day'
    WHERE documento_id = ${documento.id} AND estado = 'vigente'
    RETURNING id`;
  const versionId = Number(v.id);
  await tx`DELETE FROM archivos WHERE version_id = ${versionId} AND rol = 'principal'`;
  const { archivoId, hash, limpiar } = await archivoPrincipal(tx, versionId);
  const [a] = await tx`SELECT ruta FROM archivos WHERE id = ${archivoId}`;
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = ${proceso}`;
  return { ...documento, versionId, procesoId: Number(p.id), ruta: a.ruta, hash, limpiar };
}

/** La ruta absoluta del principal de un `vigenteFuera`: para cambiar sus bytes en disco. */
export function rutaAbsolutaDelPrincipal(d: Pick<DocumentoVigente, "ruta">): string {
  const ruta = resolverRutaAlmacen(d.ruta);
  if (!ruta) throw new Error(`Ruta inválida en el almacén: ${d.ruta}`);
  return ruta;
}

/** Acepta la clave «ok» con método «clave» y rechaza cualquier otra, sin tocar `accesos`. */
export const firmaDePrueba: Verificador = async (_sesion, credenciales) =>
  credenciales.clave === "ok"
    ? { ok: true, metodo: "clave" }
    : { ok: false, mensaje: "Clave o código incorrectos", sesionCerrada: false };

/**
 * Cierra, dentro de la transacción revertida, la revisión anual que esté abierta en la base: el test no
 * depende de que la demo traiga o no una campaña.
 */
export async function sinRevisionAbierta(tx: TransactionSql): Promise<void> {
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  await tx`UPDATE revisiones_anuales
    SET estado = 'cerrada', cerrada_en = now(), cerrada_por = ${u.id}, metodo_cierre = 'clave'
    WHERE estado = 'abierta'`;
}

/**
 * Abre, dentro de la transacción revertida, una revisión anual que incluye al documento (con su decisión «sin
 * revisar» sobre la vigente). Antes cierra la que estuviera abierta: solo puede haber una.
 */
export async function enRevisionAbierta(tx: TransactionSql, d: { id: number; versionId: number }, anio = 2095): Promise<number> {
  await sinRevisionAbierta(tx);
  const [u] = await tx`SELECT id FROM usuarios ORDER BY id LIMIT 1`;
  const [r] = await tx`INSERT INTO revisiones_anuales (anio, plazo_dias, ventana_meses, abierta_por, abierta_en, vence_en)
    VALUES (${anio}, 60, 6, ${u.id}, now(), now() + interval '60 days') RETURNING id`;
  await tx`INSERT INTO revision_anual_decisiones (revision_id, documento_id, version_id, decision)
    VALUES (${r.id}, ${d.id}, ${d.versionId}, 'sin_revisar')`;
  return Number(r.id);
}

/**
 * Abre con `abrirRevision`, dentro de la transacción revertida, la revisión anual del año de `ahora` (plazo 60 días y
 * ventana de 6 meses si no se dice). Antes cierra la que estuviera abierta: solo puede haber una. El año es el de
 * `ahora`: los tests usan uno lejano (2090) para no chocar con el de una revisión de la demo, único por año.
 */
export async function revisionDePrueba(
  tx: TransactionSql,
  admin: SesionFlujo,
  d: { ahora: Date; plazoDias?: number; ventanaMeses?: number },
): Promise<{ revisionId: number; anio: number }> {
  await sinRevisionAbierta(tx);
  const anio = Number(fechaEnZona(d.ahora, zonaHoraria()).slice(0, 4));
  const { revisionId } = await abrirRevision(
    admin,
    { anio, plazoDias: d.plazoDias ?? 60, ventanaMeses: d.ventanaMeses ?? 6 },
    { sql: tx, ahora: d.ahora },
  );
  return { revisionId, anio };
}

/**
 * Para los tests que confirman cargas reales (fuera de una transacción revertida) y después borran sus documentos: con
 * una revisión anual abierta en la base, publicar los hizo entrar a su foto, y esa fila impediría borrarlos (FK). Quita
 * de la revisión abierta los documentos cuyo código empieza por `prefijo` con la función de producción (`sacarDeLaFoto`:
 * descuenta su proceso y borra la fila del proceso que se quede vacío y sin normograma); la fila de la bitácora queda. Va
 * antes de borrar sus trámites y sus versiones. Una revisión cerrada no se toca (sus filas son inmutables).
 */
export async function sacarDeLaRevisionAbierta(sql: Cliente, prefijo: string): Promise<void> {
  await enTransaccion(sql, async (tx) => {
    const abierta = await revisionAbiertaBloqueada(tx);
    if (!abierta) return;
    const filas = await tx`SELECT rad.documento_id FROM revision_anual_decisiones rad JOIN documentos d ON d.id = rad.documento_id
      WHERE rad.revision_id = ${abierta.id} AND d.codigo LIKE ${`${prefijo}%`}`;
    for (const f of filas) {
      await sacarDeLaFoto(tx, { documentoId: Number(f.documento_id), usuarioId: null, motivo: "Limpieza de un test que confirma cargas" }, abierta);
    }
  });
}

/**
 * Marca como avisados y escalados los procesos de la revisión anual abierta que ya hay en la base: la pasada de
 * vencimientos los recorre y el test cuenta solo lo suyo. Se llama antes de abrir la revisión del test.
 */
export async function silenciarRevisionAnual(tx: TransactionSql): Promise<void> {
  await tx`UPDATE revision_anual_procesos SET aviso_vencido_en = now(), escalado_en = now()
    WHERE (aviso_vencido_en IS NULL OR escalado_en IS NULL)
      AND revision_id IN (SELECT id FROM revisiones_anuales WHERE estado = 'abierta')`;
}

/** El primer proceso activo sin líder activo: sus tareas y avisos de vigencia van a los Admin SGC. */
export async function procesoSinLider(tx: TransactionSql): Promise<{ id: number; sigla: string; nombre: string }> {
  const [p] = await tx`SELECT p.id, p.sigla, p.nombre FROM procesos p
    WHERE p.activo AND NOT EXISTS (
      SELECT 1 FROM usuario_procesos up JOIN usuarios u ON u.id = up.usuario_id AND u.activo AND u.rol = 'lider_proceso'
      WHERE up.proceso_id = p.id)
    ORDER BY p.id LIMIT 1`;
  if (!p) throw new Error("La base no tiene un proceso activo sin líder");
  return { id: Number(p.id), sigla: p.sigla, nombre: p.nombre };
}

/**
 * Marca como avisados y escalados los documentos y los externos que ya hay en la base: la pasada de vencimientos
 * los recorre todos y el test cuenta solo los suyos. Se llama antes de crear los documentos del test.
 */
export async function silenciarVigencia(tx: TransactionSql): Promise<void> {
  await tx`UPDATE documentos SET revision_aviso_en = now(), revision_escalado_en = now()
    WHERE revision_aviso_en IS NULL OR revision_escalado_en IS NULL`;
  await tx`UPDATE externos SET aviso_vencido_en = now(), escalado_en = now()
    WHERE aviso_vencido_en IS NULL OR escalado_en IS NULL`;
}

/**
 * Deja a un interno vigente sin desde cuándo contar su plazo: aprobado en la plataforma y sin fecha de publicación
 * (una vigente siempre tiene fecha de aprobación, y lo aprobado fuera cuenta desde ella).
 */
export async function sinFechaDeRevision(tx: TransactionSql, d: { versionId: number }): Promise<void> {
  await tx`UPDATE documento_versiones SET origen_aprobacion = 'plataforma', publicado_en = NULL WHERE id = ${d.versionId}`;
}

let consecutivoExterno = 0;

/** Los datos de un externo con valores verosímiles; el proceso y el responsable técnico los da el test. */
export function datosExterno(d: Partial<DatosExterno> & Pick<DatosExterno, "procesoId" | "responsableId">): DatosExterno {
  consecutivoExterno += 1;
  return {
    titulo: `Guía de práctica clínica de prueba ${Date.now()}-${consecutivoExterno}`,
    subprocesoId: null,
    otrosProcesos: [],
    nivelAcceso: "general",
    descripcion: null,
    palabrasClave: null,
    entidadEmisora: "Ministerio de Salud y Protección Social",
    tituloOriginal: null,
    fuenteOficial: "https://www.minsalud.gov.co/guias",
    verificacionMeses: 12,
    normaId: null,
    edicion: "2017",
    fechaEdicion: null,
    ...d,
  };
}

export type ExternoDePrueba = {
  documentoId: number;
  /** La edición adoptada: la versión 1, vigente. */
  versionId: number;
  codigo: string;
  titulo: string;
  procesoId: number;
  /** La huella registrada del principal: un PDF real en el almacén. */
  hash: string;
  limpiar: () => Promise<void>;
};

/**
 * Un externo registrado con las funciones reales en `proceso`, con un PDF real como principal de su primera edición
 * y adoptado con `firmaDePrueba` (sin acuses). El responsable técnico es quien registra si no se dice. El test llama
 * `limpiar` si el almacén no es una carpeta temporal.
 */
export async function externoDePrueba(
  tx: TransactionSql,
  gestor: SesionFlujo,
  d: { proceso: string; edicion: string; responsableId?: number; nivelAcceso?: "general" | "restringido"; ahora?: Date },
): Promise<ExternoDePrueba> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = ${d.proceso}`;
  const datos = datosExterno({
    procesoId: Number(p.id),
    responsableId: d.responsableId ?? gestor.usuarioId,
    edicion: d.edicion,
    nivelAcceso: d.nivelAcceso ?? "general",
  });
  const r = await registrarExterno(gestor, datos, { sql: tx, ahora: d.ahora });
  const { hash, limpiar } = await archivoPrincipal(tx, r.versionId);
  try {
    await adoptarEdicion(
      gestor,
      { versionId: r.versionId, pedirAcuses: false, requiereSocializacion: false, credenciales: { clave: "ok" } },
      { sql: tx, ahora: d.ahora, verificar: firmaDePrueba },
    );
  } catch (err) {
    await limpiar();
    throw err;
  }
  return { documentoId: r.documentoId, versionId: r.versionId, codigo: r.codigo, titulo: datos.titulo, procesoId: Number(p.id), hash, limpiar };
}
