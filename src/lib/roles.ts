export const ROLES = [
  "admin_sgc",
  "gerencia",
  "control_interno",
  "lider_proceso",
  "consulta",
] as const;

export type Rol = (typeof ROLES)[number];

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin_sgc: "Administrador del SGC",
  gerencia: "Gerencia",
  control_interno: "Control Interno",
  lider_proceso: "Líder de proceso",
  consulta: "Consulta",
};

export function esRol(v: unknown): v is Rol {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/** Roles que deben tener segundo factor, según EXIGIR_2FA_ROLES (lista separada por comas). */
export function rolesConTotpObligatorio(
  env: Record<string, string | undefined> = process.env,
): Rol[] {
  return (env.EXIGIR_2FA_ROLES ?? "")
    .split(",")
    .map((r) => r.trim())
    .filter(esRol);
}
