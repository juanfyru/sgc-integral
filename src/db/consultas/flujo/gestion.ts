/**
 * Lo que hace quien gestiona con un trámite abierto: cancelarlo y reasignarlo (spec 13A §7.2).
 * Además de los manejadores exporta `exigirQueNoElaboro` y `relevoDe`, que comparte con
 * `corregirDatosDeControl` (`tramites-gestion.ts`).
 */
import type { TransactionSql } from "postgres";
import { rotuloDeTramite, tipoDeDocumento } from "@/db/consultas/tramites";
import type { DatosReasignar } from "@/lib/esquemas/tramites";
import { papelesReasignables, type Papel } from "@/lib/tramites/separacion";
import type { Etapa } from "@/lib/tramites/tipos";
import {
  ErrorTramite,
  motivoObligatorio,
  type Aviso,
  type Efecto,
  type FilaTramite,
  type Manejador,
  type RegistroManejadores,
} from "./contrato";
import { exigirDesignacion, plazoHasta } from "./aceptacion";
import { avisoDeCierre } from "./cierre";

/** En una eliminación, la versión del trámite es la vigente: esa no se toca. Los archivos se conservan. */
async function descartarVersion(tx: TransactionSql, tramite: FilaTramite): Promise<number | null> {
  if (tramite.tipo === "eliminar" || tramite.versionId === null) return null;
  const [version] = await tx`UPDATE documento_versiones SET estado = 'descartado'
    WHERE id = ${tramite.versionId} AND estado = 'borrador'
    RETURNING numero`;
  return version?.numero ?? null;
}

const cancelar: Manejador = async ({ tx, tramite, datos }) => {
  const motivo = motivoObligatorio(datos);
  const versionDescartada = await descartarVersion(tx, tramite);
  return {
    detalle: { motivo, ...(versionDescartada === null ? {} : { versionDescartada }) },
    cambios: { motivoCierre: motivo },
    avisos: await avisoDeCierre(tx, tramite, tramite.documentoId, `Solicitud ${tramite.numero} cancelada`),
  };
};

const COLUMNA_DEL_PAPEL = { elaborador: "elaboradorId", revisor: "revisorId", aprobador: "aprobadorId" } as const;

const VERBO_DEL_PAPEL: Record<Papel, string> = { elaborador: "elaborar", revisor: "revisar", aprobador: "aprobar" };

/** Quién tiene el paso en curso; en las demás etapas no es un papel designado. */
const PAPEL_DE_LA_ETAPA: Partial<Record<Etapa, Papel>> = { elaboracion: "elaborador", revision: "revisor", aprobacion: "aprobador" };

type Persona = { id: number; nombre: string };

/**
 * S1 y S2 miran toda la historia: quien firmó como elaborador en cualquier ronda no revisa ni
 * aprueba este trámite, aunque lo hayan reemplazado (spec 13A §6.3).
 */
export async function exigirQueNoElaboro(tx: TransactionSql, tramiteId: number, usuarioId: number, papel: "revisor" | "aprobador"): Promise<void> {
  const [firmo] = await tx`SELECT 1 FROM firmas
    WHERE tramite_id = ${tramiteId} AND firma = 'elaboro' AND usuario_id = ${usuarioId} LIMIT 1`;
  if (firmo) throw new ErrorTramite(papel === "revisor" ? "Quien elabora no puede revisar" : "Quien elabora no puede aprobar");
}

/** Quien sale, para la evidencia, y el aviso de cada uno. Quien entra va primero en los avisos: gana si es la misma persona de otro relevo. */
export async function relevoDe(
  tx: TransactionSql,
  tramite: FilaTramite,
  papel: Papel,
  entra: number,
  texto: string,
): Promise<{ de: Persona | null; entra: Aviso; sale: Aviso }> {
  const sale = tramite[COLUMNA_DEL_PAPEL[papel]];
  const [de] = sale === null ? [] : await tx`SELECT id, nombre FROM usuarios WHERE id = ${sale}`;
  const verbo = VERBO_DEL_PAPEL[papel];
  const aviso = (usuarioIds: number[], titulo: string): Aviso => ({
    usuarioIds,
    tipo: "tramite.reasignado",
    titulo: `Solicitud ${tramite.numero}: ${titulo} ${verbo}`,
    cuerpo: texto,
  });
  return {
    de: de ? { id: Number(de.id), nombre: de.nombre } : null,
    entra: aviso([entra], "ahora le corresponde"),
    sale: aviso(sale === null ? [] : [sale], "ya no le corresponde"),
  };
}

async function cambioDeResponsable(
  tx: TransactionSql,
  tramite: FilaTramite,
  papel: Papel | undefined,
  usuarioId: number,
  aprobadorId: number | undefined,
) {
  if (!papel) throw new ErrorTramite("Elija el papel");
  // Un valor fuera de la lista (el solicitante, por ejemplo) tampoco está entre los reasignables.
  if (!papelesReasignables(tramite.etapa).includes(papel)) throw new ErrorTramite("Ese papel no se puede reasignar en esta etapa");
  const columna = COLUMNA_DEL_PAPEL[papel];
  if (tramite[columna] === usuarioId || aprobadorId === tramite.aprobadorId) throw new ErrorTramite("Esa persona ya tiene ese papel");
  if (papel !== "elaborador") await exigirQueNoElaboro(tx, tramite.id, usuarioId, papel);
  if (aprobadorId !== undefined) await exigirQueNoElaboro(tx, tramite.id, aprobadorId, "aprobador");

  const [documento] = await tx`SELECT tipo_id FROM documentos WHERE id = ${tramite.documentoId}`;
  const tipo = documento ? await tipoDeDocumento(Number(documento.tipo_id), { sql: tx }) : null;
  if (!tipo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
  const { elaboradorId, revisorId } = tramite;
  const designados = await exigirDesignacion(
    tx,
    tramite,
    tramite.tipo,
    tipo.autoridad,
    { elaboradorId, revisorId, aprobadorId: aprobadorId ?? tramite.aprobadorId, [columna]: usuarioId },
    aprobadorId === undefined ? [usuarioId] : [usuarioId, aprobadorId],
  );

  const { texto } = await rotuloDeTramite(tx, tramite);
  const relevo = await relevoDe(tx, tramite, papel, usuarioId, texto);
  const delAprobador = aprobadorId === undefined ? null : await relevoDe(tx, tramite, "aprobador", aprobadorId, texto);
  return {
    de: relevo.de,
    a: designados[papel],
    aprobador: delAprobador && { de: delAprobador.de, a: designados.aprobador },
    cambios: { [columna]: usuarioId, ...(aprobadorId === undefined ? {} : { aprobadorId }) } satisfies Efecto["cambios"],
    avisos: delAprobador ? [relevo.entra, delAprobador.entra, relevo.sale, delAprobador.sale] : [relevo.entra, relevo.sale],
  };
}

/**
 * Cambia a un designado, y con quien elabora también a quien aprueba, la fecha límite de la etapa
 * en curso, o las dos cosas. Si no hay fecha, sigue la que había. El aprobador va junto porque el
 * rol que aprueba depende de quien elabora: de a uno, ningún orden pasaría.
 */
const reasignar: Manejador = async ({ tx, tramite, datos, ahora }) => {
  const { papel, usuarioId, aprobadorId, venceEn } = datos as Partial<DatosReasignar>;
  const motivo = motivoObligatorio(datos);
  if (papel !== undefined && usuarioId === undefined) throw new ErrorTramite("Elija a la persona");
  if (usuarioId === undefined && venceEn === undefined) throw new ErrorTramite("Elija a la persona o la fecha límite");
  if (aprobadorId !== undefined && papel !== "elaborador") throw new ErrorTramite("Quien aprueba solo cambia junto a quien elabora");
  const fecha = venceEn === undefined ? undefined : plazoHasta(venceEn, ahora, "La fecha límite");
  const cambio = usuarioId === undefined ? null : await cambioDeResponsable(tx, tramite, papel, usuarioId, aprobadorId);
  const mismoPlazo = fecha === undefined || fecha.getTime() === tramite.venceEn?.getTime();
  const mismoResponsable = papel === undefined || papel !== PAPEL_DE_LA_ETAPA[tramite.etapa];
  return {
    detalle: {
      papel: cambio ? papel : null,
      de: cambio?.de ?? null,
      a: cambio?.a ?? null,
      venceEn: venceEn ?? null,
      motivo,
      ...(cambio?.aprobador ? { aprobador: cambio.aprobador } : {}),
    },
    // En la bitácora, `de` es la etapa: quien sale va con otro nombre.
    auditoria: { sale: cambio?.de ?? null },
    cambios: { ...cambio?.cambios, venceEn: fecha },
    conservarAvisos: mismoPlazo && mismoResponsable,
    avisos: cambio?.avisos,
  };
};

export const MANEJADORES_GESTION: RegistroManejadores = { cancelar, reasignar };
