// Validadores puros del editor del mapa. Lanzan Error de negocio con mensaje
// para el admin; las acciones los capturan y conservan lo escrito.
const BANDAS = ["estrategicos", "misionales", "apoyo", "evaluacion"] as const;

export function validarColor(v: string): string {
  const c = v.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(c)) {
    throw new Error("El color debe ser hex de 6 dígitos, p. ej. #1B4E8E");
  }
  return c.toUpperCase();
}

export function validarSigla(v: string): string {
  const s = v.trim().toUpperCase();
  if (!/^[A-Z]{2,4}$/.test(s)) {
    throw new Error("La sigla debe tener de 2 a 4 letras (A–Z)");
  }
  return s;
}

/** La sigla de un subproceso es opcional: vacía no es un error, es «sin sigla». */
export function validarSiglaOpcional(v: string): string | null {
  return v.trim() === "" ? null : validarSigla(v);
}

/** `IND` e `ID` son las siglas de los códigos de indicador (spec 14 §7.1; 14A §4): ningún proceso, subproceso ni tipo las usa. */
export function exigirSiglaNoReservada(sigla: string): void {
  const s = sigla.trim().toUpperCase();
  if (s === "IND" || s === "ID") throw new Error(`La sigla ${s} está reservada para los indicadores`);
}

export function validarSlug(v: string): string {
  const s = v.trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)) {
    throw new Error("El slug solo admite minúsculas, números y guiones");
  }
  return s;
}

export function validarBanda(v: string): string {
  if (!(BANDAS as readonly string[]).includes(v)) {
    throw new Error("Banda inválida");
  }
  return v;
}

export function validarIcono(v: string, validos: readonly string[]): string {
  const i = v.trim();
  if (!validos.includes(i)) {
    throw new Error("El ícono no está en el catálogo disponible");
  }
  return i;
}
