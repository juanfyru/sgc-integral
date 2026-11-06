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
