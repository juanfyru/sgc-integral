// Valores puros compartidos entre el servidor (logo.ts) y el cliente (CargaLogo).
export const LOGO_MAX_BYTES = 1_048_576;
export const LOGO_MIN_LADO = 64;
export const LOGO_MAX_LADO = 2048;
export const LOGO_MIMES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export type MimeLogo = keyof typeof LOGO_MIMES;
