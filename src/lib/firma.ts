/**
 * Firma con reingreso de clave (Ley 527 de 1999, spec §10.2): verifica las mismas
 * credenciales del ingreso y sus fallos cuentan para el mismo bloqueo de la cuenta, para
 * que una sesión ajena abierta no sirva para probar claves sin límite. Escribe en
 * `usuarios` y `accesos` con sus propias conexiones y por eso no recibe la transacción del
 * trámite: esas filas deben sobrevivir aunque la transición falle.
 */
import {
  buscarParaIngresoPorId,
  guardarEstadoBloqueo,
  registrarAcceso,
  type ResultadoAcceso,
} from "@/db/consultas/autenticacion";
import { SIN_BLOQUEO, estaBloqueado, estadoTrasFallo } from "@/lib/bloqueo";
import { claveCandadoUsuario, conCandado } from "@/lib/candado";
import { verificarClave } from "@/lib/clave";
import { comprobarCodigoFactor } from "@/lib/ingreso";
import { cerrarSesionPorId, type SesionValida } from "@/lib/sesion";

export type CredencialesFirma = { clave: string; codigo?: string };
export type ContextoFirma = { ip: string | null; userAgent: string | null };
export type ResultadoVerificacion =
  | { ok: true; metodo: "clave" | "clave_totp" }
  | { ok: false; mensaje: string; sesionCerrada: boolean; bloqueada?: true };
export type SesionFirma = Pick<SesionValida, "sesionId" | "usuarioId" | "usuario">;
export type Verificador = (
  sesion: SesionFirma,
  credenciales: CredencialesFirma,
  contexto: ContextoFirma,
  ahora?: Date,
) => Promise<ResultadoVerificacion>;

const MENSAJE_FALLO = "Clave o código incorrectos";

export const verificarParaFirmar: Verificador = (sesion, credenciales, contexto, ahora = new Date()) => {
  const registrar = (usuarioId: number | null, resultado: ResultadoAcceso) =>
    registrarAcceso({
      usuarioId,
      usuarioTexto: sesion.usuario,
      resultado,
      ip: contexto.ip,
      userAgent: contexto.userAgent,
    });

  return conCandado(claveCandadoUsuario(sesion.usuarioId), async () => {
    const u = await buscarParaIngresoPorId(sesion.usuarioId);
    if (!u || !u.activo || estaBloqueado(u, ahora)) {
      await cerrarSesionPorId(sesion.sesionId);
      await registrar(u?.id ?? null, "firma_fallo");
      return { ok: false, mensaje: MENSAJE_FALLO, sesionCerrada: true };
    }

    // El orden importa: una clave errada nunca debe consumir un código de recuperación.
    let correcto = await verificarClave(u.hashClave, credenciales.clave);
    if (correcto && u.totpActivo) {
      correcto = credenciales.codigo !== undefined && (await comprobarCodigoFactor(u.id, credenciales.codigo));
    }

    if (!correcto) {
      const nuevo = estadoTrasFallo(u, ahora);
      await guardarEstadoBloqueo(u.id, nuevo);
      const bloqueada = estaBloqueado(nuevo, ahora);
      await registrar(u.id, bloqueada ? "bloqueo" : "firma_fallo");
      if (bloqueada) await cerrarSesionPorId(sesion.sesionId);
      return { ok: false, mensaje: MENSAJE_FALLO, sesionCerrada: bloqueada, ...(bloqueada ? { bloqueada } : {}) };
    }

    await guardarEstadoBloqueo(u.id, SIN_BLOQUEO);
    return { ok: true, metodo: u.totpActivo ? "clave_totp" : "clave" };
  });
};
