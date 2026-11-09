/**
 * El cierre firmado de la revisión anual y los datos de su informe (spec 13C §9.5). Sigue F13A-R4: un validador de solo
 * lectura, la clave fuera de la transacción y las comprobaciones repetidas dentro, con la revisión bloqueada. Una clave
 * errada no escribe nada de la campaña. Al cerrar, lo que quedó sin decisión queda «sin revisar», se recuentan los
 * procesos, se congelan los insumos de cada fila y en `informe` todo lo que el PDF imprime; `estado`, `cerrada_por`,
 * `cerrada_en`, `metodo_cierre` e `informe` se escriben en un solo `UPDATE`, después de tocar las filas hijas: cerrada,
 * el trigger las protege.
 */
import type { TransactionSql } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { avisarA } from "@/db/consultas/avisos-vencimiento";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { ErrorFirma, enTransaccion, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { archivoDeFormato } from "@/db/consultas/formato-acta";
import { nombreSql } from "@/db/consultas/normograma/busqueda";
import type { FormatoActa } from "@/lib/acta";
import { porcentaje } from "@/lib/distribucion/acuses";
import { verificarParaFirmar, type CredencialesFirma } from "@/lib/firma";
import type { DatosInforme } from "@/lib/informe-anual";
import { MARCA_DEFECTO } from "@/lib/marca";
import { ETIQUETA_ESTADO_NORMA, type EstadoNorma } from "@/lib/normograma/tipos";
import { requerirPermiso } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { estadoPlazo, finDeFecha } from "@/lib/tramites/plazos";
import { ETIQUETA_ETAPA, esEtapaDeTrabajo, type Etapa } from "@/lib/tramites/tipos";
import { ErrorVigencia, type Decision } from "@/lib/vigencia/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { columnasDeVigencia } from "../fragmentos";
import { PENDIENTE, REVISION_NO_EXISTE, YA_CERRADA, cerosPorDecision, prorrogasDe } from "./comun";
import { insumosDe } from "./lectura";

const FALTA_ENTIDAD = "Configure el nombre de la entidad antes de cerrar la revisión anual";

/** Cómo dice el informe el normograma confirmado de un proceso. */
const RESULTADO_NORMOGRAMA: Record<"sin_novedad" | "cambios", string> = { sin_novedad: "Sin novedad", cambios: "Con cambios" };

/**
 * El nombre de la entidad que llevará el informe. Al cerrar es obligatorio: el de la instalación sin configurar quedaría
 * congelado en un registro. El informe parcial, que es solo de pantalla, usa el que haya (`exigir` falso).
 */
async function entidadDelInforme(sql: Cliente, exigir = true): Promise<string> {
  const [entidad] = await sql`SELECT valor FROM configuracion WHERE clave = 'nombre_entidad'`;
  const nombre = typeof entidad?.valor === "string" ? entidad.valor.trim() : "";
  if (exigir && (!nombre || nombre === MARCA_DEFECTO.nombre)) throw new ErrorVigencia(FALTA_ENTIDAD);
  return nombre;
}

/**
 * Qué pasó con un externo al cerrar (spec 13C §9.3): «Edición adoptada» si la verificación pidió una edición nueva y la
 * fila ya apunta a otra versión, «Pendiente de adoptar» si sigue en la verificada, «Retirado» si se eliminó. Nada en los
 * internos ni en las demás decisiones.
 */
function estadoDelExterno(f: { origen: string; decision: Decision; version_id: unknown; verificada_version_id: unknown }): string | null {
  if (f.origen !== "externo") return null;
  if (f.decision === "eliminar") return "Retirado";
  if (f.decision !== "actualizar" || f.verificada_version_id === null) return null;
  return Number(f.version_id) !== Number(f.verificada_version_id) ? "Edición adoptada" : "Pendiente de adoptar";
}

/** «Publicado», «Cancelado», «En curso: Elaboración»: el estado del trámite de una decisión al cerrar. */
function estadoAlCierre(etapa: Etapa): string {
  return esEtapaDeTrabajo(etapa) ? `En curso: ${ETIQUETA_ETAPA[etapa]}` : ETIQUETA_ETAPA[etapa];
}

/**
 * El formato sobre el que se imprimirá el informe, con sus márgenes: el elegido para el informe o, si no hay, el del
 * acta con los suyos (spec 13C §9.5). Sin versión utilizable es `null` y el informe sale con el diseño básico. Es la
 * única regla: la usan el cierre, que lo congela, y el informe de ejemplo de Configuración documental.
 */
export async function formatoDelInforme(tx: Cliente): Promise<FormatoActa | null> {
  const { formatoActa, vigencia } = await obtenerConfigDocumental({ sql: tx });
  const elegido = vigencia.formatoInforme.documentoId !== null ? vigencia.formatoInforme : formatoActa;
  const archivo = elegido.documentoId === null ? null : await archivoDeFormato(elegido.documentoId, { sql: tx });
  if (!archivo) return null;
  const { archivoId, hash, codigo, version } = archivo;
  return { archivoId, hash, codigo, version, margenSuperiorCm: elegido.margenSuperiorCm, margenInferiorCm: elegido.margenInferiorCm };
}

/**
 * Todo lo que imprime el informe de la revisión `revisionId` (maqueta 6), leído en `tx`: la entidad, las fechas y las
 * prórrogas, quién cerró, el alcance, las cifras por decisión, cada decisión con su responsable y el estado de su trámite,
 * los cambios normativos del año con su impacto, el normograma confirmado por proceso, los acuses de lo publicado en el
 * año, la conformidad de los puntos de uso, los externos al día y el formato elegido. En una revisión cerrada, quién y
 * cómo cerró salen de ella; al cerrar los da `cierre`; en el informe parcial de una abierta quedan vacíos, y la entidad
 * es la que haya (sin exigirla).
 */
export async function datosDelInforme(
  tx: Cliente,
  revisionId: number,
  ahora: Date,
  cierre?: { usuarioId: number; metodo: string },
): Promise<DatosInforme> {
  const zona = zonaHoraria();
  const [r] = await tx`SELECT anio, estado, abierta_en, prorrogas, cerrada_por, cerrada_en, metodo_cierre FROM revisiones_anuales WHERE id = ${revisionId}`;
  if (!r) throw new ErrorVigencia(REVISION_NO_EXISTE);
  const anio = Number(r.anio);
  const cerrada = r.estado === "cerrada";
  const entidad = await entidadDelInforme(tx, cerrada || cierre !== undefined);
  const cerroId = cerrada ? Number(r.cerrada_por) : (cierre?.usuarioId ?? null);
  const [quien] = cerroId === null ? [] : await tx`SELECT u.nombre, c.nombre AS cargo FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id WHERE u.id = ${cerroId}`;
  const primerDia = `${anio}-01-01`;
  const ultimoDia = `${anio}-12-31`;
  const inicio = new Date(finDeFecha(`${anio - 1}-12-31`, zona).getTime() + 1);
  const fin = new Date(finDeFecha(ultimoDia, zona).getTime() + 1);

  const filas = await tx`
    SELECT d.codigo, d.titulo, d.origen, rad.version_id, v.numero AS version, v.edicion_externa AS edicion, p.nombre AS proceso,
      rad.decision, u.nombre AS responsable,
      rad.actualizado_en, t.numero AS tramite_numero, t.etapa AS tramite_etapa, t.vence_en AS tramite_vence_en,
      ev.version_id AS verificada_version_id
    FROM revision_anual_decisiones rad
    JOIN documentos d ON d.id = rad.documento_id
    JOIN documento_versiones v ON v.id = rad.version_id
    LEFT JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    LEFT JOIN procesos p ON p.id = COALESCE(dp.proceso_id, s.proceso_id)
    LEFT JOIN usuarios u ON u.id = rad.usuario_id
    LEFT JOIN tramites t ON t.id = rad.tramite_id
    LEFT JOIN externo_verificaciones ev ON ev.id = rad.verificacion_id
    WHERE rad.revision_id = ${revisionId}
    ORDER BY p.nombre, d.codigo`;
  const totales = cerosPorDecision();
  for (const f of filas) totales[f.decision as Decision] += 1;

  const [filasDeProcesos, cambios, [acuses], [conformidad], externos, formato] = await Promise.all([
    tx`SELECT p.nombre, rap.documentos, rap.normograma_resultado, rap.normograma_nota
      FROM revision_anual_procesos rap JOIN procesos p ON p.id = rap.proceso_id
      WHERE rap.revision_id = ${revisionId}
      ORDER BY p.nombre`,
    tx`SELECT ${nombreSql(tx)} AS norma, c.estado_nuevo, c.fecha::text AS fecha,
        count(i.id) FILTER (WHERE i.documento_id IS NOT NULL)::int AS documentos,
        count(i.id) FILTER (WHERE i.documento_id IS NOT NULL AND i.estado = 'resuelto')::int AS resueltos,
        count(i.id) FILTER (WHERE i.documento_id IS NOT NULL AND i.resolucion = 'no_afecta')::int AS no_afecta
      FROM norma_cambios c
      JOIN normas n ON n.id = c.norma_id
      JOIN tipos_norma tn ON tn.id = n.tipo_norma_id
      LEFT JOIN impactos_normativos i ON i.cambio_id = c.id
      WHERE c.fecha BETWEEN ${primerDia} AND ${ultimoDia}
      GROUP BY c.id, tn.nombre, n.numero, n.anio
      ORDER BY c.fecha, c.id`,
    tx`SELECT count(*) FILTER (WHERE ac.estado = 'confirmado')::int AS confirmados,
        count(*) FILTER (WHERE ac.estado = 'pendiente')::int AS pendientes
      FROM acuses ac JOIN documento_versiones v ON v.id = ac.version_id
      WHERE v.publicado_en >= ${inicio} AND v.publicado_en < ${fin}`,
    tx`SELECT count(*) FILTER (WHERE conforme)::int AS conformes, count(*)::int AS total
      FROM verificaciones WHERE estado = 'cerrada' AND cerrada_en >= ${inicio} AND cerrada_en < ${fin}`,
    columnasDeVigencia(tx, tx`d.origen = 'externo'`, ahora),
    formatoDelInforme(tx),
  ]);
  const alDia = externos.filter((f) => f.proximaRevision !== null && estadoPlazo(f.proximaRevision, ahora, zona).estado !== "vencido").length;
  // Un proceso que se quedó sin documentos no cuenta en el alcance; su normograma confirmado sí se lista.
  const conDocumentos = filasDeProcesos.filter((p) => Number(p.documentos) > 0);
  const procesos = filasDeProcesos.filter((p) => Number(p.documentos) > 0 || p.normograma_resultado !== null);

  return {
    entidad,
    anio,
    abiertaEn: new Date(r.abierta_en as string),
    prorrogas: prorrogasDe(r.prorrogas),
    cerradaEn: cerrada ? new Date(r.cerrada_en as string) : ahora,
    cerradaPor: { nombre: (quien?.nombre as string | undefined) ?? "", cargo: (quien?.cargo as string | null | undefined) ?? null },
    metodo: cerrada ? (r.metodo_cierre as string) : (cierre?.metodo ?? ""),
    alcance: {
      documentos: filas.length,
      internos: filas.filter((f) => f.origen === "interno").length,
      externos: filas.filter((f) => f.origen === "externo").length,
      procesos: conDocumentos.length,
    },
    totales,
    decisiones: filas.map((f) => {
      const decision = f.decision as Decision;
      const estadoExterno = estadoDelExterno({
        origen: f.origen as string,
        decision,
        version_id: f.version_id,
        verificada_version_id: f.verificada_version_id ?? null,
      });
      return {
        codigo: f.codigo as string,
        titulo: f.titulo as string,
        version: Number(f.version),
        proceso: (f.proceso as string | null) ?? "—",
        decision,
        responsable: (f.responsable as string | null) ?? null,
        solicitud:
          f.tramite_numero === null
            ? null
            : {
                numero: f.tramite_numero as string,
                venceEn: f.tramite_vence_en === null ? null : new Date(f.tramite_vence_en as string),
                estadoAlCierre: estadoAlCierre(f.tramite_etapa as Etapa),
              },
        fecha: decision === PENDIENTE ? null : new Date(f.actualizado_en as string),
        ...(estadoExterno === null ? {} : { estadoExterno }),
        // Un externo se nombra por la edición de la versión de su fila (la adoptada, si la hubo).
        ...(f.origen === "externo" && f.edicion ? { edicion: f.edicion as string } : {}),
      };
    }),
    normograma: {
      cambios: cambios.map((c) => ({
        norma: c.norma as string,
        estado: ETIQUETA_ESTADO_NORMA[c.estado_nuevo as EstadoNorma],
        fecha: finDeFecha(c.fecha as string, zona),
        documentos: Number(c.documentos),
        resueltos: Number(c.resueltos),
        noAfecta: Number(c.no_afecta),
      })),
      porProceso: procesos.map((p) => ({
        proceso: p.nombre as string,
        resultado: p.normograma_resultado === null ? null : RESULTADO_NORMOGRAMA[p.normograma_resultado as "sin_novedad" | "cambios"],
        nota: (p.normograma_nota as string | null) ?? null,
      })),
    },
    otros: {
      acusesPct: porcentaje(Number(acuses.confirmados), Number(acuses.pendientes)),
      conformidadPct: Number(conformidad.total) === 0 ? null : Math.round((Number(conformidad.conformes) / Number(conformidad.total)) * 100),
      externosAlDia: { alDia, total: externos.length },
    },
    formato,
    zona,
  };
}

const fecha = (v: unknown) => new Date(v as string);

/**
 * El informe congelado de una revisión cerrada, con sus fechas de vuelta como `Date` (el jsonb las guarda como texto);
 * `null` si no está cerrada. Con esto se regenera el PDF sin consultar nada más.
 */
export async function informeCongelado(revisionId: number, opciones?: { sql?: Cliente }): Promise<DatosInforme | null> {
  const sql = opciones?.sql ?? obtenerSql();
  const [r] = await sql`SELECT informe FROM revisiones_anuales WHERE id = ${revisionId} AND estado = 'cerrada'`;
  if (!r?.informe) return null;
  const d = r.informe as DatosInforme;
  return {
    ...d,
    abiertaEn: fecha(d.abiertaEn),
    cerradaEn: fecha(d.cerradaEn),
    prorrogas: d.prorrogas.map((p) => ({ ...p, fecha: fecha(p.fecha) })),
    decisiones: d.decisiones.map((x) => ({
      ...x,
      fecha: x.fecha === null ? null : fecha(x.fecha),
      solicitud: x.solicitud === null ? null : { ...x.solicitud, venceEn: x.solicitud.venceEn === null ? null : fecha(x.solicitud.venceEn) },
    })),
    normograma: { ...d.normograma, cambios: d.normograma.cambios.map((c) => ({ ...c, fecha: fecha(c.fecha) })) },
  };
}

/** Solo lee: la revisión existe, está abierta y la entidad tiene nombre. Corre antes de la firma y otra vez bajo el candado. */
async function validarCierre(sql: Cliente, revisionId: number): Promise<{ anio: number }> {
  const [r] = await sql`SELECT anio, estado FROM revisiones_anuales WHERE id = ${revisionId}`;
  if (!r) throw new ErrorVigencia(REVISION_NO_EXISTE);
  if (r.estado !== "abierta") throw new ErrorVigencia(YA_CERRADA);
  await entidadDelInforme(sql);
  return { anio: Number(r.anio) };
}

/** El conteo de cada proceso, congelado al cierre: los documentos de la foto por su proceso propietario de hoy. */
async function recontarProcesos(tx: TransactionSql, revisionId: number): Promise<void> {
  await tx`INSERT INTO revision_anual_procesos (revision_id, proceso_id, documentos)
    SELECT ${revisionId}, COALESCE(dp.proceso_id, s.proceso_id), count(*)::int
    FROM revision_anual_decisiones rad
    JOIN documento_proceso dp ON dp.documento_id = rad.documento_id AND dp.es_principal
    LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE rad.revision_id = ${revisionId}
    GROUP BY 2
    ON CONFLICT (revision_id, proceso_id) DO UPDATE SET documentos = EXCLUDED.documentos`;
  await tx`UPDATE revision_anual_procesos rap SET documentos = 0
    WHERE rap.revision_id = ${revisionId} AND rap.documentos <> 0 AND NOT EXISTS (
      SELECT 1 FROM revision_anual_decisiones rad
      JOIN documento_proceso dp ON dp.documento_id = rad.documento_id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
      WHERE rad.revision_id = ${revisionId} AND COALESCE(dp.proceso_id, s.proceso_id) = rap.proceso_id)`;
}

/**
 * Los insumos de cada fila de la foto, congelados al cerrar (spec 13C §15.2): todas las filas, sin filtro de acceso y
 * aunque el documento ya no tenga versión vigente (sus acuses quedan nulos), en una sentencia. Después del cierre, el
 * trigger protege las filas y la revisión cerrada se muestra con estos.
 */
async function congelarInsumos(tx: TransactionSql, revisionId: number, anio: number): Promise<void> {
  const filas = await tx`SELECT documento_id FROM revision_anual_decisiones WHERE revision_id = ${revisionId}`;
  if (filas.length === 0) return;
  const insumos = await insumosDe(tx, filas.map((f) => Number(f.documento_id)), anio);
  await tx`UPDATE revision_anual_decisiones rad SET insumos = ${tx.json(Object.fromEntries(insumos) as never)}::jsonb -> rad.documento_id::text
    WHERE rad.revision_id = ${revisionId}`;
}

/**
 * Cierra la revisión con la firma de quien la gestiona (spec 13C §9.5). Lo que quedó sin decisión queda «sin revisar»
 * (con la hora del cierre); lo de un trámite que murió conserva su decisión y el informe muestra el estado del trámite.
 * Se congelan los insumos de cada fila y el informe con el formato elegido, y se avisa a Gerencia, a Control Interno y
 * a los líderes. Las tareas de la campaña desaparecen solas: son calculadas. El PDF se genera después, al primer clic.
 */
export async function cerrarRevision(
  sesion: SesionFlujo,
  d: { revisionId: number; credenciales: CredencialesFirma },
  opciones: OpcionesFlujo = {},
): Promise<{ sinRevisar: number }> {
  requerirPermiso(sesion, "revision_anual.gestionar");
  const sql = opciones.sql ?? obtenerSql();
  const ahora = opciones.ahora ?? new Date();
  const contexto = opciones.contexto ?? { ip: null, userAgent: null };

  await validarCierre(sql, d.revisionId);
  const verificar = opciones.verificar ?? verificarParaFirmar;
  const firma = await verificar(sesion, d.credenciales, contexto, ahora);
  if (!firma.ok) throw new ErrorFirma(firma.mensaje, firma.sesionCerrada, firma.bloqueada);

  return enTransaccion(sql, async (tx) => {
    await tx`SELECT id FROM revisiones_anuales WHERE id = ${d.revisionId} FOR UPDATE`;
    const { anio } = await validarCierre(tx, d.revisionId);
    const sinRevisar = (
      await tx`UPDATE revision_anual_decisiones SET usuario_id = NULL, actualizado_en = ${ahora}
        WHERE revision_id = ${d.revisionId} AND decision = ${PENDIENTE}
        RETURNING id`
    ).length;
    await recontarProcesos(tx, d.revisionId);
    await congelarInsumos(tx, d.revisionId, anio);
    const informe = await datosDelInforme(tx, d.revisionId, ahora, { usuarioId: sesion.usuarioId, metodo: firma.metodo });
    await tx`UPDATE revisiones_anuales SET estado = 'cerrada', cerrada_por = ${sesion.usuarioId}, cerrada_en = ${ahora},
        metodo_cierre = ${firma.metodo}, informe = ${tx.json(informe as never)}
      WHERE id = ${d.revisionId}`;

    await registrarAuditoria(tx, {
      usuarioId: sesion.usuarioId,
      accion: "revision_anual_cerrada",
      entidad: "revision_anual",
      entidadId: d.revisionId,
      detalle: { anio, totales: informe.totales, documentos: informe.alcance.documentos, sinRevisar, metodo: firma.metodo },
    });

    // A Gerencia, a Control Interno y a los líderes de los procesos de la revisión; nadie se avisa a sí mismo.
    const destinatarios = await tx`SELECT DISTINCT u.id FROM usuarios u
      WHERE u.activo AND (u.rol IN ('gerencia', 'control_interno') OR (u.rol = 'lider_proceso' AND EXISTS (
        SELECT 1 FROM usuario_procesos up
        JOIN procesos p ON p.id = up.proceso_id AND p.activo
        JOIN revision_anual_procesos rap ON rap.proceso_id = up.proceso_id AND rap.revision_id = ${d.revisionId}
        WHERE up.usuario_id = u.id)))`;
    const ids = destinatarios.map((u) => Number(u.id)).filter((u) => u !== sesion.usuarioId);
    if (ids.length > 0) {
      const cuerpo = `${cuenta(informe.alcance.documentos, "documento en la revisión", "documentos en la revisión")}; ${cuenta(sinRevisar, "quedó sin revisar", "quedaron sin revisar")}.`;
      await avisarA(
        tx,
        { tipo: "revision.cerrada", titulo: `Se cerró la revisión anual ${anio}`, enlace: `/vigencia/revision-anual/${d.revisionId}`, entidad: "revision_anual", entidadId: d.revisionId },
        ids.map((usuarioId) => ({ usuarioId, cuerpo })),
      );
    }
    return { sinRevisar };
  });
}
