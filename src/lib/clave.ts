import { hash, verify } from "@node-rs/argon2";

// Parámetros OWASP para Argon2id (19 MiB, t=2). Costo puntual por intento de
// login — el rate limit de 5/min hace irrelevante el gasto en el NAS.
const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export function hashearClave(clave: string): Promise<string> {
  return hash(clave, OPCIONES);
}

export async function verificarClave(
  hashGuardado: string,
  clave: string,
): Promise<boolean> {
  try {
    return await verify(hashGuardado, clave);
  } catch {
    // Hash corrupto o formato desconocido: credencial inválida, no un 500.
    return false;
  }
}
