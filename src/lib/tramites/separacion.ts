import type { Rol } from "@/lib/roles";
import type { Autoridad, Etapa, TipoSolicitud } from "./tipos";

export type Persona = { id: number; rol: Rol; activo: boolean };

export const ROLES_REVISOR: readonly Rol[] = ["admin_sgc", "lider_proceso"];

export const PAPELES = ["elaborador", "revisor", "aprobador"] as const;
export type Papel = (typeof PAPELES)[number];

export const ETIQUETA_PAPEL: Record<Papel, string> = {
  elaborador: "Quien elabora",
  revisor: "Quien revisa",
  aprobador: "Quien aprueba",
};

/** Etapas en que el paso de cada papel sigue pendiente; antes de aceptar no hay designados (spec §7.2). */
const ETAPAS_DEL_PAPEL: Record<Papel, readonly Etapa[]> = {
  elaborador: ["elaboracion"],
  revisor: ["elaboracion", "revision"],
  aprobador: ["elaboracion", "revision", "aprobacion"],
};

/** Una eliminación solo llega a la aprobación: ahí no aparecen ni elaborador ni revisor. */
export function papelesReasignables(etapa: Etapa): Papel[] {
  return PAPELES.filter((p) => ETAPAS_DEL_PAPEL[p].includes(etapa));
}

/**
 * Rol que aprueba: Gerencia si la autoridad es estratégica o si el originador es el
 * Administrador del SGC (nadie aprueba lo suyo); si no, el Administrador del SGC.
 * El originador es el elaborador en crear y modificar, y el solicitante en eliminar.
 */
export function rolAprobador(autoridad: Autoridad, rolOriginador: Rol): "gerencia" | "admin_sgc" {
  return autoridad === "estrategico" || rolOriginador === "admin_sgc" ? "gerencia" : "admin_sgc";
}

type Designacion = {
  tipo: TipoSolicitud;
  autoridad: Autoridad;
  solicitante: Persona;
  elaborador: Persona | null;
  revisor: Persona | null;
  aprobador: Persona;
};

/** Primer mensaje de separación de funciones que incumple la designación, o null. */
export function validarDesignacion(d: Designacion): string | null {
  const elabora = d.tipo !== "eliminar";
  // Quien pidió no es un designado: si ya no está activo, el trámite debe poder seguir.
  const designados = elabora ? [d.elaborador, d.revisor, d.aprobador] : [d.aprobador];
  if (designados.some((x) => x !== null && !x.activo)) return "El usuario designado no está activo";

  if (elabora) {
    if (!d.elaborador) return "Falta designar quién elabora";
    if (!d.revisor) return "Falta designar quién revisa";
    if (!ROLES_REVISOR.includes(d.revisor.rol))
      return "Quien revisa debe ser Administrador del SGC o Líder de proceso";
    if (d.elaborador.id === d.revisor.id) return "Quien elabora no puede revisar";
  }

  const originador = elabora && d.elaborador ? d.elaborador : d.solicitante;
  const rolRequerido = rolAprobador(d.autoridad, originador.rol);
  if (d.aprobador.rol !== rolRequerido)
    return rolRequerido === "gerencia"
      ? "Quien aprueba debe tener el rol Gerencia"
      : "Quien aprueba debe ser Administrador del SGC";

  if (elabora && d.elaborador && d.elaborador.id === d.aprobador.id) return "Quien elabora no puede aprobar";
  if (!elabora && d.solicitante.id === d.aprobador.id) return "Quien pide la eliminación no puede aprobarla";
  return null;
}

type Candidato = { id: number; rol: Rol };

/** Quienes pueden revisar, sin quien elabora (S2). */
export function candidatosRevisor<T extends Candidato>(usuarios: readonly T[], elaboradorId: number | null): T[] {
  return usuarios.filter((u) => ROLES_REVISOR.includes(u.rol) && u.id !== elaboradorId);
}

/** Quienes tienen el rol que aprueba, sin el originador (S1 y S3). */
export function candidatosAprobador<T extends Candidato>(
  usuarios: readonly T[],
  rol: "gerencia" | "admin_sgc",
  originadorId: number | null,
): T[] {
  return usuarios.filter((u) => u.rol === rol && u.id !== originadorId);
}
