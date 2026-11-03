import { createHash, randomInt } from "node:crypto";
import * as OTPAuth from "otpauth";
import { ALFABETO_TEMPORAL } from "./clave-politica";

function crearTotp(secreto: string, etiqueta = "usuario", emisor?: string) {
  return new OTPAuth.TOTP({
    issuer: emisor,
    label: etiqueta,
    secret: OTPAuth.Secret.fromBase32(secreto),
    digits: 6,
    period: 30,
  });
}

/** Secreto TOTP aleatorio de 20 bytes en base32. */
export function generarSecretoTotp(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function uriTotp(secreto: string, usuario: string, emisor: string): string {
  return crearTotp(secreto, usuario, emisor).toString();
}

/** Código de 6 dígitos para un instante dado (pruebas y QR de prueba). */
export function generarCodigoTotp(secreto: string, ahoraMs: number): string {
  return crearTotp(secreto).generate({ timestamp: ahoraMs });
}

/** Acepta el periodo actual y uno a cada lado (ventana ±1). */
export function verificarTotp(secreto: string, codigo: string, ahoraMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(codigo)) return false;
  return crearTotp(secreto).validate({ token: codigo, timestamp: ahoraMs, window: 1 }) !== null;
}

/** Códigos de un solo uso "XXXXX-XXXXX" con el alfabeto sin ambiguos de la clave temporal. */
export function generarCodigosRecuperacion(cantidad = 8): string[] {
  const codigos = new Set<string>();
  while (codigos.size < cantidad) {
    let codigo = "";
    for (let i = 0; i < 10; i++) {
      if (i === 5) codigo += "-";
      codigo += ALFABETO_TEMPORAL[randomInt(ALFABETO_TEMPORAL.length)];
    }
    codigos.add(codigo);
  }
  return [...codigos];
}

/** sha256 hex de las mayúsculas sin guiones ni espacios. */
export function hashCodigoRecuperacion(codigo: string): string {
  const normalizado = codigo.replace(/[\s-]/g, "").toUpperCase();
  return createHash("sha256").update(normalizado).digest("hex");
}
