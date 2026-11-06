/** Lo que hace quien gestiona con un trámite abierto: cancelarlo y reasignarlo (spec 13A §7.2). */
import type { TransactionSql } from "postgres";
import { rotuloDeTramite, tipoDeDocumento } from "@/db/consultas/tramites";
import type { DatosReasignar } from "@/lib/esquemas/tramites";
import { papelesReasignables, type Papel } from "@/lib/tramites/separacion";
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

type Persona = { id: number; nombre: string };

async function cambioDeResponsable(
  tx: TransactionSql,
  tramite: FilaTramite,
  papel: Papel | undefined,
  usuarioId: number,
): Promise<{ de: Persona | null; a: Persona | null; cambios: Efecto["cambios"]; avisos: Aviso[] }> {
  if (!papel) throw new ErrorTramite("Elija el papel");
  // Un valor fuera de la lista (el solicitante, por ejemplo) tampoco está entre los reasignables.
  if (!papelesReasignables(tramite.etapa).includes(papel)) throw new ErrorTramite("Ese papel no se puede reasignar en esta etapa");
  const columna = COLUMNA_DEL_PAPEL[papel];
  const sale = tramite[columna];
  if (sale === usuarioId) throw new ErrorTramite("Esa persona ya tiene ese papel");

  const [documento] = await tx`SELECT tipo_id FROM documentos WHERE id = ${tramite.documentoId}`;
  const tipo = documento ? await tipoDeDocumento(Number(documento.tipo_id), { sql: tx }) : null;
  if (!tipo) throw new ErrorTramite("El tipo de documento no existe o está inactivo");
  const designados = await exigirDesignacion(
    tx,
    tramite,
    tramite.tipo,
    tipo.autoridad,
    {
      elaboradorId: tramite.elaboradorId ?? undefined,
      revisorId: tramite.revisorId ?? undefined,
      aprobadorId: tramite.aprobadorId ?? undefined,
      [columna]: usuarioId,
    },
    usuarioId,
  );

  const [de] = sale === null ? [] : await tx`SELECT id, nombre FROM usuarios WHERE id = ${sale}`;
  const { texto } = await rotuloDeTramite(tx, tramite);
  const verbo = VERBO_DEL_PAPEL[papel];
  return {
    de: de ? { id: Number(de.id), nombre: de.nombre } : null,
    a: designados[papel],
    cambios: { [columna]: usuarioId },
    avisos: [
      { usuarioIds: [usuarioId], tipo: "tramite.reasignado", titulo: `Solicitud ${tramite.numero}: ahora le corresponde ${verbo}`, cuerpo: texto },
      { usuarioIds: sale === null ? [] : [sale], tipo: "tramite.reasignado", titulo: `Solicitud ${tramite.numero}: ya no le corresponde ${verbo}`, cuerpo: texto },
    ],
  };
}

/** Cambia a un designado, la fecha límite de la etapa en curso, o las dos cosas. Si no hay fecha, sigue la que había. */
const reasignar: Manejador = async ({ tx, tramite, datos, ahora }) => {
  const { papel, usuarioId, venceEn } = datos as Partial<DatosReasignar>;
  const motivo = motivoObligatorio(datos);
  if (usuarioId === undefined && venceEn === undefined) throw new ErrorTramite("Elija a la persona o la fecha límite");
  const fecha = venceEn === undefined ? undefined : plazoHasta(venceEn, ahora, "La fecha límite");
  const cambio = usuarioId === undefined ? null : await cambioDeResponsable(tx, tramite, papel, usuarioId);
  return {
    detalle: { papel: cambio ? papel : null, de: cambio?.de ?? null, a: cambio?.a ?? null, venceEn: venceEn ?? null, motivo },
    // En la bitácora, `de` es la etapa: quien sale va con otro nombre.
    auditoria: { sale: cambio?.de ?? null },
    cambios: { ...cambio?.cambios, venceEn: fecha },
    avisos: cambio?.avisos,
  };
};

export const MANEJADORES_GESTION: RegistroManejadores = { cancelar, reasignar };
