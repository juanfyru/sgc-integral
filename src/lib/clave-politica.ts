import { randomInt } from "node:crypto";
import lista from "./datos/claves-comunes.json";

export const LONGITUD_MINIMA = 12;
export const LONGITUD_MAXIMA = 128;

const COMUNES = new Set<string>(lista as string[]);

const ALFABETO_TEMPORAL = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Devuelve el motivo de rechazo en español, o null si la clave cumple la política. */
export function validarClave(clave: string, contexto: { usuario: string }): string | null {
  if (clave.length < LONGITUD_MINIMA) {
    return `La clave debe tener al menos ${LONGITUD_MINIMA} caracteres.`;
  }
  if (clave.length > LONGITUD_MAXIMA) {
    return `La clave no puede superar los ${LONGITUD_MAXIMA} caracteres.`;
  }
  const minuscula = clave.toLowerCase();
  if (COMUNES.has(minuscula)) {
    return "Esa clave es demasiado común; elija otra.";
  }
  const usuario = contexto.usuario.trim().toLowerCase();
  if (usuario.length >= 3 && minuscula.includes(usuario)) {
    return "La clave no puede contener el nombre de usuario.";
  }
  return null;
}

/** Clave temporal XXXX-XXXX-XXXX-XXXX sin caracteres ambiguos (0/O, 1/I/L). */
export function generarClaveTemporal(): string {
  const grupos: string[] = [];
  for (let g = 0; g < 4; g++) {
    let grupo = "";
    for (let i = 0; i < 4; i++) grupo += ALFABETO_TEMPORAL[randomInt(ALFABETO_TEMPORAL.length)];
    grupos.push(grupo);
  }
  return grupos.join("-");
}
