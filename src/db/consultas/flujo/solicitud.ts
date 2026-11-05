/** Manejadores de la solicitud: visto bueno del líder y retiro por quien pidió. */
import {
  adminsActivos,
  lideresDeProceso,
  lideresDeProcesosDelDocumento,
  rotuloDeTramite,
} from "@/db/consultas/tramites";
import { motivoObligatorio, type Manejador, type RegistroManejadores } from "./contrato";

const darVistoBueno: Manejador = async ({ tx, tramite }) => {
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    avisos: [
      { usuarioIds: [tramite.solicitanteId], tipo: "tramite.resuelto", titulo: `Visto bueno dado a ${tramite.numero}`, cuerpo: texto },
      { usuarioIds: await adminsActivos({ sql: tx }), tipo: "tramite.paso", titulo: `Solicitud ${tramite.numero} por aceptar`, cuerpo: texto },
    ],
  };
};

const negarVistoBueno: Manejador = async ({ tx, tramite, datos }) => {
  const motivo = motivoObligatorio(datos);
  const { texto } = await rotuloDeTramite(tx, tramite);
  return {
    detalle: { motivo },
    cambios: { motivoCierre: motivo },
    avisos: [
      { usuarioIds: [tramite.solicitanteId], tipo: "tramite.resuelto", titulo: `Visto bueno negado a ${tramite.numero}`, cuerpo: texto },
    ],
  };
};

/** Avisa a los líderes de los procesos del documento y, en la aceptación, a los administradores. */
const retirar: Manejador = async ({ tx, tramite }) => {
  const { texto } = await rotuloDeTramite(tx, tramite);
  const interesados =
    tramite.documentoId === null
      ? await lideresDeProceso(tramite.procesoId, { sql: tx })
      : await lideresDeProcesosDelDocumento(tramite.documentoId, { sql: tx });
  if (tramite.etapa === "aceptacion") interesados.push(...(await adminsActivos({ sql: tx })));
  return {
    avisos: [{ usuarioIds: interesados, tipo: "tramite.cerrado", titulo: `Solicitud ${tramite.numero} retirada`, cuerpo: texto }],
  };
};

export const MANEJADORES_SOLICITUD: RegistroManejadores = {
  dar_visto_bueno: darVistoBueno,
  negar_visto_bueno: negarVistoBueno,
  retirar,
};
