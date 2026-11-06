/** Devolución y concepto favorable de la revisión: lo que exigen y a quién le toca después (spec 13A §9.2). */
import { obtenerVerificacion } from "@/db/consultas/revision";
import { rotuloDeTramite } from "@/db/consultas/tramites";
import {
  ErrorTramite,
  type Manejador,
  type RegistroManejadores,
  type RegistroValidadores,
  type Validador,
} from "./contrato";

const LARGO_MIN_CONCEPTO = 5;
const LARGO_MAX_CONCEPTO = 2000;

function conceptoDe(datos: Record<string, unknown>): string {
  const concepto = typeof datos.concepto === "string" ? datos.concepto.trim() : "";
  if (concepto.length < LARGO_MIN_CONCEPTO || concepto.length > LARGO_MAX_CONCEPTO)
    throw new ErrorTramite(`El concepto debe tener entre ${LARGO_MIN_CONCEPTO} y ${LARGO_MAX_CONCEPTO} caracteres`);
  return concepto;
}

/** Solo lee: corre antes de pedir o gastar la firma y otra vez con la fila bloqueada. */
const validarConcepto: Validador = async ({ sql, tramite, datos }) => {
  conceptoDe(datos);
  // Lo firmado es lo guardado en la ronda: un crítico que no cumple cuenta aunque el ítem se desactivara después.
  const [lista] = await sql`SELECT
      (SELECT count(*) FROM lista_verificacion_items i WHERE i.activo AND NOT EXISTS (
        SELECT 1 FROM tramite_verificaciones r WHERE r.item_id = i.id AND r.tramite_id = ${tramite.id} AND r.ronda = ${tramite.ronda})) AS sin_responder,
      (SELECT count(*) FROM tramite_verificaciones r
        WHERE r.tramite_id = ${tramite.id} AND r.ronda = ${tramite.ronda} AND r.critico AND r.resultado = 'no_cumple') AS criticos_sin_cumplir`;
  if (Number(lista.sin_responder) > 0) throw new ErrorTramite("Faltan ítems de la lista por responder");
  if (Number(lista.criticos_sin_cumplir) > 0) throw new ErrorTramite("Hay un ítem crítico que no cumple");
  const [abiertas] = await sql`SELECT 1 FROM tramite_observaciones WHERE tramite_id = ${tramite.id} AND estado <> 'cerrada' LIMIT 1`;
  if (abiertas) throw new ErrorTramite("Hay observaciones sin cerrar");
};

const devolverRevision: Manejador = async ({ tx, tramite }) => {
  const abiertas = await tx`SELECT numero FROM tramite_observaciones
    WHERE tramite_id = ${tramite.id} AND estado = 'abierta' ORDER BY numero`;
  if (abiertas.length === 0) throw new ErrorTramite("Para devolver, escriba al menos una observación");
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { observaciones: abiertas.map((o) => o.numero as number) },
    avisos:
      tramite.elaboradorId === null
        ? []
        : [{ usuarioIds: [tramite.elaboradorId], tipo: "tramite.devuelto", titulo: `Solicitud ${tramite.numero}: devuelta a elaboración`, cuerpo: texto }],
  };
};

const conceptoFavorable: Manejador = async ({ tx, tramite, datos }) => {
  const [{ total, cerradas }] = await tx`SELECT count(*) AS total, count(*) FILTER (WHERE estado = 'cerrada') AS cerradas
    FROM tramite_observaciones WHERE tramite_id = ${tramite.id}`;
  // La evidencia lleva el texto y la marca de crítico con que se respondió cada ítem.
  const lista = await obtenerVerificacion(tramite.id, tramite.ronda, { sql: tx });
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { concepto: conceptoDe(datos), lista, observaciones: { total: Number(total), cerradas: Number(cerradas) } },
    avisos:
      tramite.aprobadorId === null
        ? []
        : [{ usuarioIds: [tramite.aprobadorId], tipo: "tramite.paso", titulo: `Solicitud ${tramite.numero}: le toca aprobar`, cuerpo: texto }],
  };
};

export const VALIDADORES_REVISION: RegistroValidadores = { concepto_favorable: validarConcepto };

export const MANEJADORES_REVISION: RegistroManejadores = {
  devolver_revision: devolverRevision,
  concepto_favorable: conceptoFavorable,
};
