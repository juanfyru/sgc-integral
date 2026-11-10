/**
 * Lo que comparten las firmas sin trámite de la vigencia, la ratificación y la adopción de un externo: sus mensajes
 * y el rechazo por huella. Se firma el archivo registrado: si el que está en disco es otro, la transacción no escribe
 * nada y el rechazo queda en la bitácora, fuera de ella (F13A-R4).
 */
import type { Cliente } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { huellaDeArchivo } from "@/lib/huella";
import { ErrorVigencia } from "@/lib/vigencia/tipos";

export const NO_EXISTE = "El documento no existe";
export const NO_COINCIDE = "El archivo en disco no coincide con el registrado; avise al Administrador del SGC";

/** Un archivo que no se puede leer tampoco es el registrado: la huella en disco queda nula. */
async function huellaEnDisco(ruta: string): Promise<string | null> {
  try {
    return await huellaDeArchivo(ruta);
  } catch (err) {
    console.error("No se pudo leer el archivo principal para comprobar su huella:", err);
    return null;
  }
}

/** El rechazo por la huella sale de la transacción con lo que la bitácora debe guardar. */
class HuellaDistinta extends Error {
  constructor(readonly detalle: Record<string, unknown>) {
    super(NO_COINCIDE);
  }
}

/**
 * La huella del archivo en disco, que debe ser la registrada; si no, rechaza la firma con `detalle` y las dos huellas
 * para la bitácora. Va dentro de la transacción de la firma, envuelta por `conRechazoPorHuella`.
 */
export async function exigirHuellaRegistrada(ruta: string, registrada: string | null, detalle: Record<string, unknown>): Promise<string> {
  const enDisco = await huellaEnDisco(ruta);
  if (enDisco === null || enDisco !== registrada) {
    throw new HuellaDistinta({ ...detalle, huellaRegistrada: registrada, huellaEnDisco: enDisco });
  }
  return enDisco;
}

/**
 * Corre la transacción de la firma. Si `exigirHuellaRegistrada` la rechazó, deja `accion` en la bitácora del
 * documento, fuera de la transacción revertida, y responde con `NO_COINCIDE`.
 */
export async function conRechazoPorHuella<T>(
  sql: Cliente,
  rechazo: { usuarioId: number; accion: string; documentoId: number },
  transaccion: () => Promise<T>,
): Promise<T> {
  try {
    return await transaccion();
  } catch (err) {
    if (!(err instanceof HuellaDistinta)) throw err;
    await registrarAuditoria(sql, {
      usuarioId: rechazo.usuarioId,
      accion: rechazo.accion,
      entidad: "documento",
      entidadId: rechazo.documentoId,
      detalle: err.detalle,
    });
    throw new ErrorVigencia(NO_COINCIDE);
  }
}
