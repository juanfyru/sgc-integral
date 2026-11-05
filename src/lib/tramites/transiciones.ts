import { puede, type Permiso } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";
import { esEtapaDeTrabajo, type Etapa, type Firma, type TipoSolicitud } from "./tipos";

export const ACCIONES = [
  "dar_visto_bueno",
  "negar_visto_bueno",
  "retirar",
  "aceptar",
  "rechazar",
  "enviar_a_revision",
  "devolver_revision",
  "concepto_favorable",
  "aprobar",
  "devolver_aprobacion",
  "negar_eliminacion",
  "publicar",
  "aprobar_y_publicar",
  "cancelar",
  "reasignar",
] as const;
export type Accion = (typeof ACCIONES)[number];

export type TramiteParaRegla = {
  tipo: TipoSolicitud;
  etapa: Etapa;
  solicitanteId: number;
  elaboradorId: number | null;
  revisorId: number | null;
  aprobadorId: number | null;
};

export type ActorParaRegla = { usuarioId: number; rol: Rol; lideraPropietario: boolean };

export type Veredicto =
  | { ok: true; hacia: Etapa; firmas: Firma[]; sumaRonda: boolean }
  | { ok: false; motivo: string };

export const PERMISO_DE_ACCION: Record<Accion, Permiso> = {
  dar_visto_bueno: "tramites.visto_bueno",
  negar_visto_bueno: "tramites.visto_bueno",
  retirar: "tramites.solicitar",
  aceptar: "tramites.gestionar",
  rechazar: "tramites.gestionar",
  enviar_a_revision: "tramites.participar",
  devolver_revision: "tramites.revisar",
  concepto_favorable: "tramites.revisar",
  aprobar: "tramites.aprobar",
  devolver_aprobacion: "tramites.aprobar",
  negar_eliminacion: "tramites.aprobar",
  publicar: "tramites.gestionar",
  aprobar_y_publicar: "tramites.gestionar",
  cancelar: "tramites.gestionar",
  reasignar: "tramites.gestionar",
};

type Regla = {
  /** Etapas en que se puede; "trabajo" es cualquiera de las de trabajo. */
  etapas: readonly Etapa[] | "trabajo";
  persona?: (t: TramiteParaRegla, a: ActorParaRegla) => boolean;
  tipo?: (tipo: TipoSolicitud) => boolean;
  hacia: (t: TramiteParaRegla) => Etapa;
  firmas?: readonly Firma[];
  sumaRonda?: (t: TramiteParaRegla) => boolean;
};

const lidera = (_t: TramiteParaRegla, a: ActorParaRegla) => a.lideraPropietario;
const esSolicitante = (t: TramiteParaRegla, a: ActorParaRegla) => t.solicitanteId === a.usuarioId;
const esElaborador = (t: TramiteParaRegla, a: ActorParaRegla) => t.elaboradorId === a.usuarioId;
const esRevisor = (t: TramiteParaRegla, a: ActorParaRegla) => t.revisorId === a.usuarioId;
const esAprobador = (t: TramiteParaRegla, a: ActorParaRegla) => t.aprobadorId === a.usuarioId;
const noEsEliminar = (tipo: TipoSolicitud) => tipo !== "eliminar";
const esEliminar = (tipo: TipoSolicitud) => tipo === "eliminar";
const cierreDePublicacion = (t: TramiteParaRegla): Etapa => (t.tipo === "eliminar" ? "eliminado" : "publicado");

/** Tabla de transiciones del trámite (spec §7.2). */
const REGLAS: Record<Accion, Regla> = {
  dar_visto_bueno: { etapas: ["visto_bueno"], persona: lidera, hacia: () => "aceptacion" },
  negar_visto_bueno: { etapas: ["visto_bueno"], persona: lidera, hacia: () => "rechazado" },
  retirar: { etapas: ["visto_bueno", "aceptacion"], persona: esSolicitante, hacia: () => "cancelado" },
  aceptar: {
    etapas: ["aceptacion"],
    hacia: (t) => (t.tipo === "eliminar" ? "aprobacion" : "elaboracion"),
    sumaRonda: (t) => t.tipo !== "eliminar",
  },
  rechazar: { etapas: ["aceptacion"], hacia: () => "rechazado" },
  enviar_a_revision: { etapas: ["elaboracion"], persona: esElaborador, hacia: () => "revision", firmas: ["elaboro"] },
  devolver_revision: { etapas: ["revision"], persona: esRevisor, hacia: () => "elaboracion", sumaRonda: () => true },
  concepto_favorable: { etapas: ["revision"], persona: esRevisor, hacia: () => "aprobacion", firmas: ["reviso"] },
  aprobar: { etapas: ["aprobacion"], persona: esAprobador, hacia: () => "publicacion", firmas: ["aprobo"] },
  devolver_aprobacion: {
    etapas: ["aprobacion"],
    persona: esAprobador,
    tipo: noEsEliminar,
    hacia: () => "elaboracion",
    sumaRonda: () => true,
  },
  negar_eliminacion: { etapas: ["aprobacion"], persona: esAprobador, tipo: esEliminar, hacia: () => "rechazado" },
  publicar: { etapas: ["publicacion"], hacia: cierreDePublicacion, firmas: ["publico"] },
  aprobar_y_publicar: {
    etapas: ["aprobacion"],
    persona: esAprobador,
    hacia: cierreDePublicacion,
    firmas: ["aprobo", "publico"],
  },
  cancelar: { etapas: "trabajo", hacia: () => "cancelado" },
  reasignar: { etapas: "trabajo", hacia: (t) => t.etapa },
};

export function evaluarTransicion(accion: Accion, t: TramiteParaRegla, actor: ActorParaRegla): Veredicto {
  const regla = REGLAS[accion];
  const enEtapa = regla.etapas === "trabajo" ? esEtapaDeTrabajo(t.etapa) : regla.etapas.includes(t.etapa);
  if (!enEtapa) return { ok: false, motivo: "Este trámite ya no está en esa etapa" };
  if (!puede({ rol: actor.rol }, PERMISO_DE_ACCION[accion])) return { ok: false, motivo: "Sin permiso para esta acción" };
  if (regla.persona && !regla.persona(t, actor)) return { ok: false, motivo: "No es la persona designada para este paso" };
  if (regla.tipo && !regla.tipo(t.tipo)) return { ok: false, motivo: "Esta acción no corresponde a este tipo de solicitud" };
  return { ok: true, hacia: regla.hacia(t), firmas: [...(regla.firmas ?? [])], sumaRonda: regla.sumaRonda?.(t) ?? false };
}

export function accionesDisponibles(t: TramiteParaRegla, actor: ActorParaRegla): Accion[] {
  return ACCIONES.filter((a) => evaluarTransicion(a, t, actor).ok);
}
