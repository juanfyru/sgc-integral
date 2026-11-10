/**
 * El PDF del informe de una revisión anual cerrada (spec 13C §9.5), con el patrón del acta (`asegurarActa`,
 * F13A-R17): se genera al primer pedido desde el informe congelado al cerrar, se escribe por archivo temporal y
 * `rename`, y se registra en `archivos` con contexto `revision_anual` y su huella. Una fila cuyo archivo se perdió se
 * regenera solo si sale idéntica; si no, o si falta el archivo del formato congelado, no hay informe y queda
 * `informe_no_regenerable` en la bitácora. La revisión no guarda columnas del archivo: el enlace es `archivos`.
 */
import { createHash } from "node:crypto";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { escribirAtomico, existeEnDisco } from "@/db/consultas/actas";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { leerFormatoCongelado } from "@/db/consultas/formato-acta";
import { informeCongelado } from "@/db/consultas/vigencia/revision-anual";
import { resolverRutaAlmacen } from "@/lib/almacen";
import { generarInformeAnual, type DatosInforme } from "@/lib/informe-anual";

type Opciones = { sql?: Cliente };

export type ArchivoDeInforme = { archivoId: number; ruta: string };

/** El año de la revisión si está cerrada (la única que tiene informe en PDF); `null` si no existe o sigue abierta. */
export async function anioDeRevisionCerrada(revisionId: number, opciones?: Opciones): Promise<number | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [r] = await sql`SELECT anio FROM revisiones_anuales WHERE id = ${revisionId} AND estado = 'cerrada'`;
  return r ? Number(r.anio) : null;
}

/** El nombre con que se descarga y se registra el informe. */
export const nombreDeInforme = (anio: number) => `Informe revisión anual ${anio}.pdf`;

async function informeRegistrado(sql: Cliente, revisionId: number): Promise<ArchivoDeInforme | null> {
  const [a] = await sql`SELECT id, ruta FROM archivos
    WHERE contexto = 'revision_anual' AND contexto_id = ${revisionId} AND rol = 'evidencia'
    ORDER BY id LIMIT 1`;
  return a ? { archivoId: Number(a.id), ruta: a.ruta } : null;
}

/** Sin quien pida el informe no hay fila: solo queda el `console.error`. */
async function auditarNoRegenerable(sql: Cliente, usuarioId: number | null | undefined, archivoId: number, detalle: Record<string, unknown>) {
  if (!usuarioId) return;
  await registrarAuditoria(sql, { usuarioId, accion: "informe_no_regenerable", entidad: "archivos", entidadId: archivoId, detalle });
}

/**
 * Devuelve el informe de la revisión cerrada y, si no existe (o su fila no tiene archivo), lo genera con los datos
 * congelados y lo registra; `null` si la revisión no está cerrada o el informe no se puede entregar. Si otra petición lo
 * registró entre tanto (la ruta, `informes/revision-<año>.pdf`, es única), devuelve el que quedó. Quien lo registra deja
 * su fila en la bitácora: `usuarioId` es quien lo pidió. Solo al generar se lee el formato congelado: si falta o es otro
 * archivo no hay informe, y el pedido siguiente lo reintenta.
 *
 * El mismo algoritmo (F13A-R17) vive en `asegurarActa` (`src/db/consultas/actas.ts`), que no se factoriza con este: un
 * cambio de su invariante (cuándo se regenera, cuándo no se entrega, qué se audita) va en los dos.
 */
export async function asegurarInforme(
  revisionId: number,
  opciones?: {
    sql?: Cliente;
    generar?: (d: DatosInforme, membrete: Uint8Array | null) => Promise<Uint8Array>;
    usuarioId?: number | null;
  },
): Promise<ArchivoDeInforme | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const anio = await anioDeRevisionCerrada(revisionId, { sql });
  if (anio === null) return null;
  const existente = await informeRegistrado(sql, revisionId);
  if (existente) {
    const absoluta = resolverRutaAlmacen(existente.ruta);
    if (absoluta && (await existeEnDisco(absoluta))) return existente;
  }

  const congelado = await informeCongelado(revisionId, { sql });
  if (!congelado) return null;
  // El pie identifica la revisión en lugar de la huella, que el PDF no puede llevar dentro.
  const datos: DatosInforme = { ...congelado, revisionId };
  const { formato } = datos;
  const membrete = formato ? await leerFormatoCongelado(formato, { sql }) : null;
  if (formato && !membrete) {
    console.error(`El informe de la revisión anual ${anio} no se generó: el archivo ${formato.archivoId} del formato ${formato.codigo} falta o cambió.`);
    await auditarNoRegenerable(sql, opciones?.usuarioId, formato.archivoId, { revisionId, anio, motivo: "formato", archivoId: formato.archivoId });
    return null;
  }
  const bytes = await (opciones?.generar ?? generarInformeAnual)(datos, membrete);
  const ruta = existente?.ruta ?? `informes/revision-${anio}.pdf`;
  const absoluta = resolverRutaAlmacen(ruta);
  if (!absoluta) throw new Error(`Ruta inválida en el almacén: ${ruta}`);
  const huella = createHash("sha256").update(bytes).digest("hex");

  if (existente) {
    // El archivo se perdió: solo se sirve el regenerado si es idéntico al que se registró. Si no, la fila (huella y
    // tamaño del informe original) no se pisa y el informe se trata como perdido.
    const [registrado] = await sql`SELECT hash_sha256 FROM archivos WHERE id = ${existente.archivoId}`;
    if (registrado?.hash_sha256 !== huella) {
      console.error(
        `El informe de la revisión anual ${anio} no se pudo regenerar idéntico (huella registrada ${registrado?.hash_sha256}, regenerada ${huella}); no se sirve.`,
      );
      await auditarNoRegenerable(sql, opciones?.usuarioId, existente.archivoId, {
        revisionId,
        anio,
        huellaRegistrada: registrado?.hash_sha256 ?? null,
        huellaRegenerada: huella,
      });
      return null;
    }
    await escribirAtomico(absoluta, bytes);
    return existente;
  }
  await escribirAtomico(absoluta, bytes);
  return enTransaccion(sql, async (tx) => {
    const [fila] = await tx`INSERT INTO archivos
        (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
      VALUES (NULL, 'revision_anual', ${revisionId}, 'evidencia', ${ruta}, ${nombreDeInforme(anio)}, 'pdf', 'application/pdf',
        ${bytes.byteLength}, ${huella})
      ON CONFLICT DO NOTHING
      RETURNING id`;
    if (!fila) return informeRegistrado(tx, revisionId);
    const archivoId = Number(fila.id);
    await registrarAuditoria(tx, {
      usuarioId: opciones?.usuarioId ?? null,
      accion: "informe_generado",
      entidad: "archivos",
      entidadId: archivoId,
      detalle: { revisionId, anio, huella },
    });
    return { archivoId, ruta };
  });
}
