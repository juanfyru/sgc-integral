/** Envío a revisión: lo que exige, antes de pedir la firma, y a quién le toca después (spec 13A §9.1). */
import { rotuloDeTramite } from "@/db/consultas/tramites";
import {
  ErrorTramite,
  type Manejador,
  type RegistroManejadores,
  type RegistroValidadores,
  type Validador,
} from "./contrato";

const validarEnvio: Validador = async ({ sql, tramite }) => {
  const [v] = await sql`SELECT
      EXISTS (SELECT 1 FROM archivos a WHERE a.version_id = v.id AND a.rol = 'principal') AS con_principal,
      COALESCE(btrim(v.resumen_cambios), '') <> '' AS con_control
    FROM documento_versiones v WHERE v.id = ${tramite.versionId}`;
  if (!v?.con_principal) throw new ErrorTramite("Falta el archivo principal");
  if (!v.con_control) throw new ErrorTramite("Falta el control de cambios");
  const [sinResponder] = await sql`SELECT 1 FROM tramite_observaciones
    WHERE tramite_id = ${tramite.id} AND estado = 'abierta' AND COALESCE(btrim(respuesta), '') = ''
    LIMIT 1`;
  if (sinResponder) throw new ErrorTramite("Hay observaciones sin responder");
};

const enviarARevision: Manejador = async ({ tx, tramite }) => {
  if (tramite.revisorId === null) throw new ErrorTramite("El trámite no tiene revisor");
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    avisos: [{ usuarioIds: [tramite.revisorId], tipo: "tramite.paso", titulo: `Solicitud ${tramite.numero}: le toca revisar`, cuerpo: texto }],
  };
};

export const VALIDADORES_ELABORACION: RegistroValidadores = { enviar_a_revision: validarEnvio };

export const MANEJADORES_ELABORACION: RegistroManejadores = { enviar_a_revision: enviarARevision };
