"use server";

import { idNumerico, mutacion, texto, type EstadoAccion } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { crearLote, importarLote, vistaPrevia, type VistaPrevia } from "@/db/consultas/indicadores/importacion";
import {
  activarEnMaestro,
  borrarDeMaestro,
  guardarEnMaestro,
  guardarParametros,
  type DatosMaestro,
} from "@/db/consultas/indicadores/maestros";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import { EsquemaSinDatos } from "@/lib/esquemas/documentos";
import { EsquemaImportarLote, EsquemaVistaPreviaImportacion, juntarImportacion } from "@/lib/esquemas/indicadores";
import {
  EsquemaActivarMaestro,
  EsquemaMaestro,
  EsquemaParametrosIndicadores,
  ESQUEMAS_MAESTRO,
} from "@/lib/esquemas/indicadores-maestros";
import type { Correspondencias } from "@/lib/indicadores/importacion/revisar";
import { parsearFormulario } from "@/lib/validacion";

/** `maestro` es el maestro; `id`, si viene, el del elemento que se edita (sin él, se crea). */
export async function guardarEnMaestroAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const soloMaestro = new FormData();
    soloMaestro.set("maestro", texto(formData, "maestro"));
    const { maestro } = parsearFormulario(soloMaestro, EsquemaMaestro);
    const datos = parsearFormulario<Record<string, unknown>>(formData, ESQUEMAS_MAESTRO[maestro], {
      omitir: ["id", "maestro"],
    });
    const id = texto(formData, "id") ? idNumerico(formData, "id") : undefined;
    await guardarEnMaestro(sesion, maestro, { ...datos, ...(id ? { id } : {}) } as DatosMaestro);
  });
}

/** `id` es el del elemento. */
export async function activarEnMaestroAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { maestro, activo } = parsearFormulario(formData, EsquemaActivarMaestro, { omitir: ["id"] });
    await activarEnMaestro(sesion, maestro, idNumerico(formData, "id"), activo === "true");
  });
}

/** `id` es el del elemento. */
export async function borrarDeMaestroAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { maestro } = parsearFormulario(formData, EsquemaMaestro, { omitir: ["id"] });
    await borrarDeMaestro(sesion, maestro, idNumerico(formData, "id"));
  });
}

export async function guardarParametrosAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const parametros = parsearFormulario(formData, EsquemaParametrosIndicadores);
    await guardarParametros(sesion, parametros);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// La importación de fichas (spec 14A §5.3)
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que devuelve `crearLoteAccion`: el lote nuevo, al que la pantalla sube la plantilla. */
export type EstadoLoteCreado = EstadoAccion | { ok: true; id: number };
/** Lo que devuelve `vistaPreviaAccion`: la vista previa, que la pantalla pinta. */
export type EstadoVistaPrevia = EstadoAccion | { ok: true; vista: VistaPrevia };

/**
 * Saca la clave y el código del formulario y los deja en una copia: `mutacion` le devuelve al navegador lo enviado
 * cuando algo falla, y una clave no vuelve por ahí (como en `src/app/acciones-indicadores.ts`).
 */
function separarFirma(formData: FormData): FormData {
  const firma = new FormData();
  for (const [campo, valor] of formData) firma.append(campo, valor);
  formData.delete("clave");
  formData.delete("codigo");
  return firma;
}

/** Una firma que cerró la sesión termina en el ingreso; cualquier otro error vuelve al formulario. */
function destinoDeFirma(err: unknown): string {
  if (err instanceof ErrorFirma && err.sesionCerrada) return err.bloqueada ? "/ingreso?motivo=bloqueo" : "/ingreso";
  throw err;
}

/** Un porcentaje de la regla escrito en el formulario: un entero; lo demás no es número y la consulta lo rechaza. */
const porcentaje = (v: string | undefined) => (v !== undefined && /^\d{1,4}$/.test(v) ? Number(v) : Number.NaN);

const SIN_CORRESPONDENCIAS: Correspondencias = { subprocesos: {}, cargos: {}, tipos: {}, unidades: {} };

/** Abre un lote vacío y devuelve su id: la pantalla le sube la plantilla y navega a él. */
export async function crearLoteAccion(_prev: EstadoLoteCreado, formData: FormData): Promise<EstadoLoteCreado> {
  // `mutacion` solo devuelve un destino: el lote creado sale por aquí.
  const creado: { id: number | null } = { id: null };
  const estado = await mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos);
    creado.id = (await crearLote(sesion)).id;
  });
  return estado ?? (creado.id === null ? null : { ok: true, id: creado.id });
}

/** `id` es el del lote. Devuelve la vista previa con las correspondencias y la regla elegidas; no escribe nada. */
export async function vistaPreviaAccion(_prev: EstadoVistaPrevia, formData: FormData): Promise<EstadoVistaPrevia> {
  const leida: { vista: VistaPrevia | null } = { vista: null };
  const estado = await mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(juntarImportacion(formData), EsquemaVistaPreviaImportacion, { omitir: ["id"] });
    leida.vista = await vistaPrevia(sesion, idNumerico(formData, "id"), {
      correspondencias: d.correspondencias ?? SIN_CORRESPONDENCIAS,
      regla: { pctAscendente: porcentaje(d.pctAscendente), pctDescendente: porcentaje(d.pctDescendente) },
    });
    if (leida.vista === null) throw new Error("La importación no existe o aún no tiene su plantilla");
  });
  return estado ?? (leida.vista === null ? null : { ok: true, vista: leida.vista });
}

/**
 * Importa el lote (`id`) con la clave de quien importa y vuelve a su página con cuántas fichas entraron aprobadas y
 * cuántas en borrador (`aprobadas=N&borradores=M`), para que la pantalla lo confirme.
 */
export async function importarLoteAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(juntarImportacion(firma), EsquemaImportarLote, { omitir: ["id"] });
    const loteId = idNumerico(formData, "id");
    try {
      const { aprobadas, borradores } = await importarLote(
        sesion,
        loteId,
        {
          correspondencias: d.correspondencias ?? SIN_CORRESPONDENCIAS,
          regla: { pctAscendente: porcentaje(d.pctAscendente), pctDescendente: porcentaje(d.pctDescendente) },
          aprobacionPrevia: { documento: d.documento ?? "", aprobadoPor: d.aprobadoPor ?? "", fecha: d.fecha ?? "" },
          siglas: Object.fromEntries(Object.entries(d.siglas ?? {}).map(([subprocesoId, sigla]) => [Number(subprocesoId), sigla])),
          credenciales: { clave: d.clave, codigo: d.codigo },
        },
        { contexto: await contextoDePeticion() },
      );
      return `/admin/indicadores/importar/${loteId}?aprobadas=${aprobadas}&borradores=${borradores}`;
    } catch (err) {
      return destinoDeFirma(err);
    }
  });
}
