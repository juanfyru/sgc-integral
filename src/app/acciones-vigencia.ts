"use server";

// Acciones de vigencia y revisión anual (Fase 13C). Cada una pasa por `mutacion` con su permiso; la
// condición de persona (líder sobre sus procesos, Gerencia solo estratégicos) la comprueba el dominio.

import { idNumerico, mutacion, type EstadoAccion, type EstadoConAviso } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import {
  abrirEdicion,
  adoptarEdicion,
  descartarEdicion,
  editarControlExterno,
  editarEdicion,
  registrarExterno,
  registrarVerificacion,
  retirarExterno,
} from "@/db/consultas/vigencia/externos";
import { ratificar } from "@/db/consultas/vigencia/ratificaciones";
import { ajustarPlazo, fijarProximaRevision, quitarFechaFijada } from "@/db/consultas/vigencia/semaforo";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import { EsquemaSinDatos } from "@/lib/esquemas/documentos";
import {
  EsquemaAdoptar,
  EsquemaAjustarPlazo,
  EsquemaControlExterno,
  EsquemaEdicion,
  EsquemaExterno,
  EsquemaFijarFecha,
  EsquemaQuitarFecha,
  EsquemaRatificar,
  EsquemaRetirar,
  EsquemaVerificacion,
} from "@/lib/esquemas/vigencia";
import { cuenta } from "@/lib/plural";
import { parsearFormulario } from "@/lib/validacion";

/**
 * Saca la clave y el código del formulario y los deja en una copia: `mutacion` le devuelve al navegador lo
 * enviado cuando algo falla, y una clave no vuelve por ahí (como en `acciones-tramites.ts`).
 */
function separarFirma(formData: FormData): FormData {
  const firma = new FormData();
  for (const [campo, valor] of formData) firma.append(campo, valor);
  formData.delete("clave");
  formData.delete("codigo");
  return firma;
}

/** Ratifica con clave y vuelve a la ficha; una firma que cerró la sesión termina en el ingreso. */
export async function ratificarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "documentos.ratificar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(firma, EsquemaRatificar);
    try {
      const { codigo } = await ratificar(
        sesion,
        { documentoId: d.documentoId, nota: d.nota || null, credenciales: { clave: d.clave, codigo: d.codigo } },
        { contexto: await contextoDePeticion() },
      );
      return `/documentos/${encodeURIComponent(codigo.toLowerCase())}`;
    } catch (err) {
      if (err instanceof ErrorFirma && err.sesionCerrada) return err.bloqueada ? "/ingreso?motivo=bloqueo" : "/ingreso";
      throw err;
    }
  });
}

/** Fija la próxima revisión de los documentos elegidos y dice a cuántos; no navega. */
export async function fijarFechaAccion(_prev: EstadoConAviso, formData: FormData): Promise<EstadoConAviso> {
  let fijados = 0;
  const estado = await mutacion(formData, "revision_anual.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaFijarFecha);
    ({ fijados } = await fijarProximaRevision(sesion, d));
  });
  if (estado) return estado;
  return { ok: true, aviso: `Próxima revisión fijada a ${cuenta(fijados, "documento", "documentos")}` };
}

export async function quitarFechaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "revision_anual.gestionar", async (_usuarioId, _formData, sesion) => {
    const { documentoId } = parsearFormulario(formData, EsquemaQuitarFecha);
    await quitarFechaFijada(sesion, documentoId);
  });
}

/** Vacío vuelve al plazo del tipo de documento. */
export async function ajustarPlazoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "revision_anual.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaAjustarPlazo);
    await ajustarPlazo(sesion, { documentoId: d.documentoId, mesesRevision: d.mesesRevision ? Number(d.mesesRevision) : null });
  });
}

// ── Documentos externos (spec 13C §8): cada una vuelve a la página de control del externo ──

const paginaDeExterno = (documentoId: number) => `/vigencia/externos/${documentoId}`;

export async function registrarExternoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaExterno);
    const { documentoId } = await registrarExterno(sesion, d);
    return paginaDeExterno(documentoId);
  });
}

/** `id` es el del documento. */
export async function editarControlExternoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaControlExterno, { omitir: ["id"] });
    const documentoId = idNumerico(formData, "id");
    await editarControlExterno(sesion, documentoId, d);
    return paginaDeExterno(documentoId);
  });
}

/** `id` es el del documento. */
export async function abrirEdicionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaEdicion, { omitir: ["id"] });
    const documentoId = idNumerico(formData, "id");
    await abrirEdicion(sesion, documentoId, d);
    return paginaDeExterno(documentoId);
  });
}

/** `id` es el de la versión en borrador. */
export async function editarEdicionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaEdicion, { omitir: ["id"] });
    const { documentoId } = await editarEdicion(sesion, idNumerico(formData, "id"), d);
    return paginaDeExterno(documentoId);
  });
}

/** `id` es el de la versión en borrador. */
export async function descartarEdicionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    const { documentoId } = await descartarEdicion(sesion, idNumerico(formData, "id"));
    return paginaDeExterno(documentoId);
  });
}

/** Adopta con clave; una firma que cerró la sesión termina en el ingreso. */
export async function adoptarEdicionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(firma, EsquemaAdoptar);
    try {
      const { documentoId } = await adoptarEdicion(
        sesion,
        {
          versionId: d.versionId,
          pedirAcuses: d.pedirAcuses === "on",
          requiereSocializacion: d.requiereSocializacion === "on",
          credenciales: { clave: d.clave, codigo: d.codigo },
        },
        { contexto: await contextoDePeticion() },
      );
      return paginaDeExterno(documentoId);
    } catch (err) {
      if (err instanceof ErrorFirma && err.sesionCerrada) return err.bloqueada ? "/ingreso?motivo=bloqueo" : "/ingreso";
      throw err;
    }
  });
}

/** La verificación es del responsable técnico o de quien gestiona el externo: lo decide el dominio. */
export async function verificarExternoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.verificar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaVerificacion);
    await registrarVerificacion(sesion, d);
    return paginaDeExterno(d.documentoId);
  });
}

export async function retirarExternoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "externos.gestionar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaRetirar);
    await retirarExterno(sesion, d);
    return paginaDeExterno(d.documentoId);
  });
}
