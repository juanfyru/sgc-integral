export const TEMAS = ["claro", "oscuro", "sistema"] as const;
export type Tema = (typeof TEMAS)[number];
export const TEMA_DEFECTO: Tema = "claro";
export const COOKIE_TEMA = "sgc_tema";

export function esTema(v: unknown): v is Tema {
  return typeof v === "string" && (TEMAS as readonly string[]).includes(v);
}

/** Con sesión manda el perfil; sin sesión, la cookie válida; si no, el tema por defecto. */
export function temaEfectivo(sesion: { tema: Tema } | null, cookie: string | undefined): Tema {
  if (sesion) return sesion.tema;
  return esTema(cookie) ? cookie : TEMA_DEFECTO;
}
