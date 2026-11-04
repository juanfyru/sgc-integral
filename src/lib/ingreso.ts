/**
 * Núcleo del ingreso y del segundo factor, sin contexto de petición (sin
 * cookies ni redirect) para poder probarlo contra la BD. Todo va bajo un
 * candado por id de cuenta (no por el texto tecleado: Postgres y JS no coinciden
 * en lower() para todo Unicode): buscar, verificar y escribir el bloqueo es una sola
 * unidad, así N intentos en paralelo se cuentan en serie.
 */
import {
  buscarParaIngreso,
  buscarParaIngresoPorId,
  consumirCodigoRecuperacion,
  guardarEstadoBloqueo,
  obtenerSecretoTotp,
  registrarAcceso,
  type ResultadoAcceso,
} from "@/db/consultas/autenticacion";
import { SIN_BLOQUEO, estaBloqueado, estadoTrasFallo } from "@/lib/bloqueo";
import { claveCandadoUsuario, conCandado } from "@/lib/candado";
import { descifrar } from "@/lib/cifrado";
import { hashearClave, verificarClave } from "@/lib/clave";
import { cerrarSesionPorId, confirmarSegundoFactor, crearSesion, type SesionValida } from "@/lib/sesion";
import { hashCodigoRecuperacion, verificarTotp } from "@/lib/totp";

/** Mismo texto para usuario inexistente, inactivo, clave incorrecta y cuenta bloqueada. */
export const MENSAJE_CREDENCIALES =
  "Usuario o clave incorrectos. Si falló varias veces, la cuenta se bloquea temporalmente; espere o pida al administrador que la desbloquee.";

type Contexto = { ip: string | null; userAgent: string | null };

export type ResultadoIngreso =
  | { tipo: "error"; mensaje: string }
  | { tipo: "sesion"; token: string; factorPendiente: boolean };

export function intentarIngreso(
  datos: Contexto & { usuario: string; clave: string },
  ahora: Date = new Date(),
): Promise<ResultadoIngreso> {
  const { usuario, clave, ip, userAgent } = datos;
  const error: ResultadoIngreso = { tipo: "error", mensaje: MENSAJE_CREDENCIALES };
  const registrar = (usuarioId: number | null, resultado: ResultadoAcceso) =>
    registrarAcceso({ usuarioId, usuarioTexto: usuario, resultado, ip, userAgent });

  return (async () => {
    const hallada = await buscarParaIngreso(usuario);
    if (!hallada || !hallada.activo) {
      // Mismo costo que verificar: no se distingue por tiempo si el usuario existe.
      await hashearClave(clave);
      await registrar(hallada?.id ?? null, "fallo");
      return error;
    }
    return conCandado(claveCandadoUsuario(hallada.id), () => ingresarBajoCandado(hallada.id));
  })();

  async function ingresarBajoCandado(id: number): Promise<ResultadoIngreso> {
    // Se relee dentro del candado: el estado de la primera lectura pudo quedar viejo.
    const u = await buscarParaIngresoPorId(id);
    if (!u || !u.activo) {
      await hashearClave(clave);
      await registrar(id, "fallo");
      return error;
    }
    if (estaBloqueado(u, ahora)) {
      // Bloqueada: la clave no se prueba (sin oráculo) y el estado no cambia.
      await hashearClave(clave);
      await registrar(u.id, "fallo");
      return error;
    }
    if (!(await verificarClave(u.hashClave, clave))) {
      const nuevo = estadoTrasFallo(u, ahora);
      await guardarEstadoBloqueo(u.id, nuevo);
      await registrar(u.id, estaBloqueado(nuevo, ahora) ? "bloqueo" : "fallo");
      return error;
    }
    // Con segundo factor, los contadores se reinician al confirmarlo, no aquí.
    if (!u.totpActivo) await guardarEstadoBloqueo(u.id, SIN_BLOQUEO);
    const { token } = await crearSesion(u.id, {
      ip,
      userAgent,
      factorPendiente: u.totpActivo,
    });
    if (!u.totpActivo) await registrar(u.id, "ingreso");
    return { tipo: "sesion", token, factorPendiente: u.totpActivo };
  }
}

export type ResultadoFactor =
  | { tipo: "ok" }
  | { tipo: "error"; mensaje: string }
  | { tipo: "cerrada" };

export function intentarFactor(
  datos: Contexto & {
    sesion: Pick<SesionValida, "sesionId" | "usuarioId" | "usuario">;
    codigo: string;
  },
  ahora: Date = new Date(),
): Promise<ResultadoFactor> {
  const { sesion, ip, userAgent } = datos;
  const registrar = (resultado: ResultadoAcceso) =>
    registrarAcceso({
      usuarioId: sesion.usuarioId,
      usuarioTexto: sesion.usuario,
      resultado,
      ip,
      userAgent,
    });

  return conCandado(claveCandadoUsuario(sesion.usuarioId), async () => {
    const u = await buscarParaIngresoPorId(sesion.usuarioId);
    if (!u || estaBloqueado(u, ahora)) {
      // Cuenta bloqueada: no se evalúa el código.
      await cerrarSesionPorId(sesion.sesionId);
      await registrar("factor_fallo");
      return { tipo: "cerrada" };
    }

    const codigo = datos.codigo.replace(/[\s-]/g, "");
    let correcto = false;
    if (/^\d{6}$/.test(codigo)) {
      const { secretoCifrado, activo } = await obtenerSecretoTotp(sesion.usuarioId);
      if (activo && secretoCifrado) {
        try {
          correcto = verificarTotp(descifrar(secretoCifrado), codigo);
        } catch (err) {
          // Sin el secreto en el registro: solo el tipo de error.
          console.error("[factor] no se pudo descifrar el secreto TOTP:", (err as Error).name);
        }
      }
    } else {
      correcto = await consumirCodigoRecuperacion(sesion.usuarioId, hashCodigoRecuperacion(codigo));
    }

    if (!correcto) {
      const nuevo = estadoTrasFallo(u, ahora);
      await guardarEstadoBloqueo(u.id, nuevo);
      await registrar("factor_fallo");
      if (estaBloqueado(nuevo, ahora)) {
        await cerrarSesionPorId(sesion.sesionId);
        return { tipo: "cerrada" };
      }
      return { tipo: "error", mensaje: "Código incorrecto" };
    }

    await confirmarSegundoFactor(sesion.sesionId);
    await guardarEstadoBloqueo(u.id, SIN_BLOQUEO);
    await registrar("ingreso");
    return { tipo: "ok" };
  });
}
