import type { Rol } from "@/lib/roles";
import type { Autoridad, TipoSolicitud } from "./tipos";

export type Persona = { id: number; rol: Rol; activo: boolean };

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
  const designados = [d.solicitante, d.elaborador, d.revisor, d.aprobador];
  if (designados.some((x) => x !== null && !x.activo)) return "El usuario designado no está activo";

  const elabora = d.tipo !== "eliminar";
  if (elabora) {
    if (!d.elaborador) return "Falta designar quién elabora";
    if (!d.revisor) return "Falta designar quién revisa";
    if (d.revisor.rol !== "admin_sgc" && d.revisor.rol !== "lider_proceso")
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
