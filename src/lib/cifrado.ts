import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Solo desarrollo: nunca se usa en producción (claveDeEntorno lanza).
const CLAVE_DESARROLLO = Buffer.alloc(32, "sgc-integral-dev-clave-insegura");
let avisado = false;

/** APP_SECRETO: exactamente 32 bytes en base64 estándar (44 caracteres con relleno). */
export function appSecretoValido(valor: string | undefined): boolean {
  if (!valor || !/^[A-Za-z0-9+/]{43}=$/.test(valor)) return false;
  return Buffer.from(valor, "base64").length === 32;
}

export function claveDeEntorno(
  env: { APP_SECRETO?: string; NODE_ENV?: string } = process.env,
): Buffer {
  if (env.APP_SECRETO) {
    if (!appSecretoValido(env.APP_SECRETO)) {
      throw new Error(
        "APP_SECRETO no son 32 bytes en base64 estándar (generar con: openssl rand -base64 32)",
      );
    }
    return Buffer.from(env.APP_SECRETO, "base64");
  }
  if (env.NODE_ENV === "production") {
    throw new Error("Falta APP_SECRETO (generar con: openssl rand -base64 32)");
  }
  if (!avisado) {
    avisado = true;
    console.warn("[cifrado] APP_SECRETO ausente: se usa la clave fija de desarrollo");
  }
  return CLAVE_DESARROLLO;
}

/** base64url(iv 12 | tag 16 | datos), AES-256-GCM. */
export function cifrar(texto: string, clave: Buffer = claveDeEntorno()): string {
  const iv = randomBytes(12);
  const cifrador = createCipheriv("aes-256-gcm", clave, iv);
  const datos = Buffer.concat([cifrador.update(texto, "utf8"), cifrador.final()]);
  return Buffer.concat([iv, cifrador.getAuthTag(), datos]).toString("base64url");
}

export function descifrar(cifrado: string, clave: Buffer = claveDeEntorno()): string {
  const bytes = Buffer.from(cifrado, "base64url");
  if (bytes.length < 28) throw new Error("Dato cifrado inválido");
  const descifrador = createDecipheriv("aes-256-gcm", clave, bytes.subarray(0, 12));
  descifrador.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([descifrador.update(bytes.subarray(28)), descifrador.final()]).toString("utf8");
}
