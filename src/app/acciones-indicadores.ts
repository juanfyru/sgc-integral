"use server";

// Acciones del módulo de indicadores (Fase 14). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona la vuelve a comprobar la consulta. Las de los maestros viven en `src/app/admin/acciones-indicadores.ts`.

import { rutaDeEdicion, rutaDeIndicador } from "@/app/(app)/indicadores/_comun";
import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, descartarBorrador, devolverFicha, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { abrirCambio, crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import {
  borrarIndicador,
  cambiarOperacion,
  descartarIndicador,
  designar,
  duplicar,
  retirar,
} from "@/db/consultas/indicadores/operacion";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import { EsquemaSinDatos } from "@/lib/esquemas/documentos";
import {
  EsquemaAprobarFichas,
  EsquemaDesignar,
  EsquemaDevolverFicha,
  EsquemaDuplicar,
  EsquemaEnviarFicha,
  EsquemaFicha,
  EsquemaMotivoDeBaja,
  EsquemaOperacion,
} from "@/lib/esquemas/indicadores";
import { rutaInterna } from "@/lib/rutas";
import { parsearFormulario } from "@/lib/validacion";

const POR_APROBAR = "/indicadores/por-aprobar";

/**
 * Saca la clave y el código del formulario y los deja en una copia: `mutacion` le devuelve al navegador lo enviado
 * cuando algo falla, y una clave no vuelve por ahí (como en `acciones-vigencia.ts`).
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

/** Crea el indicador en borrador y lleva a su ficha para seguir editándola. */
export async function crearIndicadorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaFicha);
    const { codigo } = await crearIndicador(sesion, d);
    return rutaDeEdicion(codigo);
  });
}

/** `id` es el de la versión en borrador. El formulario siempre manda el código: si cambió, la página es otra. */
export async function guardarBorradorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaFicha, { omitir: ["id"] });
    await guardarBorrador(sesion, idNumerico(formData, "id"), d);
    return d.codigo ? rutaDeEdicion(d.codigo) : "/indicadores";
  });
}

/** `id` es el del indicador. No navega: la página vuelve a pintarse con el borrador abierto. */
export async function abrirCambioAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await abrirCambio(sesion, idNumerico(formData, "id"));
  });
}

/**
 * Envía el borrador guardado (`id`, de la versión) con la firma «Elaboró»: a aprobación o, si el cambio es menor,
 * publicado de inmediato. Lleva a la página del indicador.
 */
export async function enviarAAprobacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(firma, EsquemaEnviarFicha, { omitir: ["id"] });
    try {
      const { codigo } = await enviarAAprobacion(
        sesion,
        {
          versionId: idNumerico(formData, "id"),
          rigeDesde: d.rigeDesde,
          motivo: d.motivo,
          credenciales: { clave: d.clave, codigo: d.codigo },
        },
        { contexto: await contextoDePeticion() },
      );
      return rutaDeIndicador(codigo);
    } catch (err) {
      return destinoDeFirma(err);
    }
  });
}

/**
 * Aprueba con una clave las fichas elegidas (todo o nada) y vuelve a `volver` o a «Por aprobar», con `aprobadas=N` para
 * que la página lo confirme. Quien aprueba sigue viendo el indicador aprobado: Gerencia ve todos y el líder, los de sus
 * procesos.
 */
export async function aprobarFichasAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "indicadores.aprobar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(firma, EsquemaAprobarFichas, { omitir: ["volver"] });
    try {
      const { aprobadas } = await aprobarFichas(
        sesion,
        { versionIds: d.versionIds, credenciales: { clave: d.clave, codigo: d.codigo } },
        { contexto: await contextoDePeticion() },
      );
      const destino = rutaInterna(firma.get("volver"), POR_APROBAR);
      return `${destino}${destino.includes("?") ? "&" : "?"}aprobadas=${aprobadas}`;
    } catch (err) {
      return destinoDeFirma(err);
    }
  });
}

/**
 * Devuelve la ficha (`id`, de la versión) con nota. Siempre a «Por aprobar»: devuelta, la ficha de un indicador nuevo ya
 * no existe para quien la devolvió.
 */
export async function devolverFichaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.aprobar", async (_usuarioId, _formData, sesion) => {
    const { nota } = parsearFormulario(formData, EsquemaDevolverFicha, { omitir: ["id"] });
    await devolverFicha(sesion, { versionId: idNumerico(formData, "id"), nota });
    return POR_APROBAR;
  });
}

/** Descarta el borrador de un cambio (`id`, de la versión) y vuelve a `volver` o a la lista. */
export async function descartarBorradorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id", "volver"] });
    await descartarBorrador(sesion, idNumerico(formData, "id"));
    return rutaInterna(formData.get("volver"), "/indicadores");
  });
}

/** `id` es el del indicador. Reemplaza la lista de una función; no navega: el diálogo se cierra y la página se repinta. */
export async function designarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaDesignar, { omitir: ["id"] });
    await designar(sesion, { indicadorId: idNumerico(formData, "id"), funcion: d.funcion, usuarioIds: d.usuarioIds });
  });
}

/** `id` es el del indicador. No crea versión ni cambia la huella de la ficha. */
export async function cambiarOperacionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaOperacion, { omitir: ["id"] });
    await cambiarOperacion(sesion, { indicadorId: idNumerico(formData, "id"), ...d });
  });
}

/** `id` es el del indicador original; lleva a la edición del borrador nuevo. */
export async function duplicarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaDuplicar, { omitir: ["id"] });
    const { codigo } = await duplicar(sesion, { indicadorId: idNumerico(formData, "id"), procesoId: d.procesoId });
    return rutaDeEdicion(codigo);
  });
}

/** `id` es el del indicador. Motivo obligatorio y sin clave. */
export async function retirarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaMotivoDeBaja, { omitir: ["id"] });
    await retirar(sesion, { indicadorId: idNumerico(formData, "id"), motivo });
  });
}

/** `id` es el del indicador. Solo un borrador que ya se envió a aprobación. */
export async function descartarIndicadorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaMotivoDeBaja, { omitir: ["id"] });
    await descartarIndicador(sesion, { indicadorId: idNumerico(formData, "id"), motivo });
  });
}

/** `id` es el del indicador. Solo un borrador que nunca se envió a aprobación; lleva a la lista. */
export async function borrarIndicadorAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await borrarIndicador(sesion, idNumerico(formData, "id"));
    return "/indicadores";
  });
}
