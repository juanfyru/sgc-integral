"use server";

// Acciones de vigencia y revisión anual (Fase 13C). Cada una pasa por `mutacion` con su permiso; la
// condición de persona (líder sobre sus procesos, Gerencia solo estratégicos) la comprueba el dominio.

import { mutacion, type EstadoAccion, type EstadoConAviso } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { ratificar } from "@/db/consultas/vigencia/ratificaciones";
import { ajustarPlazo, fijarProximaRevision, quitarFechaFijada } from "@/db/consultas/vigencia/semaforo";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import { EsquemaAjustarPlazo, EsquemaFijarFecha, EsquemaQuitarFecha, EsquemaRatificar } from "@/lib/esquemas/vigencia";
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
