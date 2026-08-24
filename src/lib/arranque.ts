/**
 * Lógica de arranque del contenedor (Fase 10). Sin dependencias de Next:
 * este módulo se bundlea en arrancar.js (esbuild) y también se prueba solo.
 */

export type OpcionesEspera = {
  intentos: number;
  esperaMs: number;
  dormir?: (ms: number) => Promise<void>;
};

const dormirReal = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Reintenta `probar` hasta que no lance. Devuelve el intento (base 1) que
 * funcionó; si se agotan, relanza el último error. `dormir` es inyectable
 * para probar la espera sin timers reales (patrón crearLimitador).
 */
export async function esperarConReintentos(
  probar: () => Promise<void>,
  { intentos, esperaMs, dormir = dormirReal }: OpcionesEspera,
): Promise<number> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      await probar();
      return intento;
    } catch (error) {
      ultimoError = error;
      if (intento < intentos) await dormir(esperaMs);
    }
  }
  throw ultimoError;
}

export type ConfigAdmin = {
  usuario: string;
  nombre: string;
  clave: string;
  forzarClave: boolean;
};

export type DecisionAdmin =
  | { accion: "asegurar"; config: ConfigAdmin }
  | { accion: "omitir"; motivo: string };

/**
 * Decide el bootstrap del admin a partir del entorno. Sin ADMIN_USUARIO o
 * ADMIN_CLAVE solo se omite (con motivo): un NAS ya aprovisionado retira
 * ADMIN_CLAVE del .env tras el primer arranque y eso NO es un error.
 */
export function configurarAdminDesdeEnv(env: NodeJS.ProcessEnv): DecisionAdmin {
  const usuario = env.ADMIN_USUARIO;
  const clave = env.ADMIN_CLAVE;
  if (!usuario) return { accion: "omitir", motivo: "falta ADMIN_USUARIO" };
  if (!clave) return { accion: "omitir", motivo: "falta ADMIN_CLAVE" };
  return {
    accion: "asegurar",
    config: {
      usuario,
      nombre: env.ADMIN_NOMBRE ?? "Administrador",
      clave,
      forzarClave: env.ADMIN_FORZAR_CLAVE === "1",
    },
  };
}
