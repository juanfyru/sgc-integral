"use server";

// Acciones del normograma (Fase 13C, spec 13C §10). Cada una pasa por `mutacion` con su permiso: el catálogo, los
// estados, las relaciones, los tipos de norma y el PDF son de `normograma.administrar`; las asociaciones y los
// impactos, de `normograma.procesos`, con el alcance sobre el proceso que comprueba el dominio.

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import {
  asociarProceso,
  desasociarProceso,
  desenlazarDocumento,
  enlazarDocumento,
} from "@/db/consultas/normograma/asociaciones";
import { resolverImpacto } from "@/db/consultas/normograma/impactos";
import { borrarNorma, cambiarEstadoNorma, crearNorma, editarNorma, retirarNorma } from "@/db/consultas/normograma/normas";
import { eliminarRelacion, registrarRelacion } from "@/db/consultas/normograma/relaciones";
import { alternarTipoNorma, crearTipoNorma, editarTipoNorma, moverTipoNorma } from "@/db/consultas/normograma/tipos-norma";
import { EsquemaAlternar } from "@/lib/esquemas/distribucion";
import { EsquemaSinDatos } from "@/lib/esquemas/documentos";
import {
  EsquemaAsociarProceso,
  EsquemaEnlazarDocumento,
  EsquemaEstadoNorma,
  EsquemaMotivo,
  EsquemaMoverTipoNorma,
  EsquemaNorma,
  EsquemaRelacion,
  EsquemaResolverImpacto,
  EsquemaTipoNorma,
} from "@/lib/esquemas/normograma";
import { parsearFormulario } from "@/lib/validacion";

const fichaDeNorma = (normaId: number) => `/normograma/${normaId}`;

// ── El catálogo (quien administra) ──

export async function crearNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaNorma);
    const { id } = await crearNorma(sesion, d);
    return fichaDeNorma(id);
  });
}

/** `id` es el de la norma. */
export async function editarNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaNorma, { omitir: ["id"] });
    const normaId = idNumerico(formData, "id");
    await editarNorma(sesion, normaId, d);
    return fichaDeNorma(normaId);
  });
}

/** «Cambiar estado», con fecha y nota; no navega (la ficha se vuelve a pintar). */
export async function cambiarEstadoNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaEstadoNorma);
    await cambiarEstadoNorma(sesion, d);
  });
}

/** `id` es el de la norma. */
export async function retirarNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaMotivo, { omitir: ["id"] });
    const normaId = idNumerico(formData, "id");
    await retirarNorma(sesion, { normaId, motivo });
    return fichaDeNorma(normaId);
  });
}

/** `id` es el de la norma; solo una sin historia. */
export async function borrarNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await borrarNorma(sesion, idNumerico(formData, "id"));
    return "/normograma";
  });
}

export async function registrarRelacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaRelacion);
    await registrarRelacion(sesion, d);
  });
}

/** `id` es el de la relación. */
export async function eliminarRelacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaMotivo, { omitir: ["id"] });
    await eliminarRelacion(sesion, { relacionId: idNumerico(formData, "id"), motivo });
  });
}

// ── Los tipos de norma (quien administra) ──

export async function crearTipoNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const { nombre } = parsearFormulario(formData, EsquemaTipoNorma);
    await crearTipoNorma(sesion, nombre);
  });
}

/** `id` es el del tipo de norma. */
export async function editarTipoNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const { nombre } = parsearFormulario(formData, EsquemaTipoNorma, { omitir: ["id"] });
    await editarTipoNorma(sesion, idNumerico(formData, "id"), nombre);
  });
}

/** `id` es el del tipo de norma. */
export async function moverTipoNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const { direccion } = parsearFormulario(formData, EsquemaMoverTipoNorma, { omitir: ["id"] });
    await moverTipoNorma(sesion, idNumerico(formData, "id"), direccion);
  });
}

/** `id` es el del tipo de norma. */
export async function alternarTipoNormaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.administrar", async (_usuarioId, _formData, sesion) => {
    const { activo } = parsearFormulario(formData, EsquemaAlternar, { omitir: ["id"] });
    await alternarTipoNorma(sesion, idNumerico(formData, "id"), activo === "true");
  });
}

// ── Asociaciones e impactos (quien tiene el proceso) ──

export async function asociarProcesoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.procesos", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaAsociarProceso);
    await asociarProceso(sesion, d);
  });
}

export async function desasociarProcesoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.procesos", async (_usuarioId, _formData, sesion) => {
    const { normaId, procesoId } = parsearFormulario(formData, EsquemaAsociarProceso);
    await desasociarProceso(sesion, { normaId, procesoId });
  });
}

export async function enlazarDocumentoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.procesos", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaEnlazarDocumento);
    await enlazarDocumento(sesion, d);
  });
}

export async function desenlazarDocumentoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.procesos", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaEnlazarDocumento);
    await desenlazarDocumento(sesion, d);
  });
}

/**
 * «No afecta…» con nota, o el enlace de la solicitud que lo atiende. La verificación de un externo resuelve su impacto
 * desde `verificarExternoAccion` (`acciones-vigencia.ts`), que también admite al responsable técnico.
 */
export async function resolverImpactoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "normograma.procesos", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaResolverImpacto);
    await resolverImpacto(sesion, d);
  });
}
