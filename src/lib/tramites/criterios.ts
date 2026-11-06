/** Los criterios que no cumplen: su huella y su constancia. Solo servidor: usa `node:crypto`. */
import { createHash } from "node:crypto";

/** Lo que se confirmó: si un criterio o su nota cambian, la huella deja de coincidir. */
export function huellaDeCriterios(criterios: { itemId: number; nota: string }[]): string {
  return createHash("sha256")
    .update(JSON.stringify(criterios.map((c) => [c.itemId, c.nota])))
    .digest("hex");
}

/** Lo que dice el evento: sin criterios no añade ninguna clave. */
export function constanciaDeCriterios(criterios: { texto: string; nota: string }[]): {
  noCumple?: { texto: string; nota: string }[];
  confirmoNoCumple?: true;
} {
  if (criterios.length === 0) return {};
  return { noCumple: criterios.map(({ texto, nota }) => ({ texto, nota })), confirmoNoCumple: true };
}
