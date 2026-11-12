"use server";

// Acciones del módulo de indicadores (Fase 14). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona la vuelve a comprobar la consulta. Las de los maestros viven en `src/app/admin/acciones-indicadores.ts`.

import { rutaDeEdicion, rutaDeIndicador } from "@/app/(app)/indicadores/_comun";
import { idNumerico, mutacion, valoresDeFormulario, type EstadoAccion } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { analizar } from "@/db/consultas/indicadores/analisis";
import { aprobarFichas, descartarBorrador, devolverFicha, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import { cerrarDeNuevo, cerrarMes, reabrirMedicion } from "@/db/consultas/indicadores/cierre";
import { abrirCambio, crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { registrarHistoricos } from "@/db/consultas/indicadores/historicos";
import { marcarNoAplica, quitarNoAplica, reportar } from "@/db/consultas/indicadores/mediciones";
import { programarMeta } from "@/db/consultas/indicadores/metas";
import { observar, responder } from "@/db/consultas/indicadores/observaciones";
import {
  borrarIndicador,
  cambiarOperacion,
  descartarIndicador,
  designar,
  duplicar,
  retirar,
} from "@/db/consultas/indicadores/operacion";
import { quitarSoporte } from "@/db/consultas/indicadores/soportes";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import { EsquemaSinDatos } from "@/lib/esquemas/documentos";
import {
  analisisDelFormulario,
  EsquemaAprobarFichas,
  EsquemaCierreMes,
  EsquemaDesignar,
  EsquemaDevolverFicha,
  EsquemaDuplicar,
  EsquemaEnviarFicha,
  EsquemaFicha,
  EsquemaHistoricos,
  EsquemaMeta,
  EsquemaMotivoDeBaja,
  EsquemaNoAplica,
  EsquemaObservacion,
  EsquemaOperacion,
  EsquemaReapertura,
  EsquemaReporte,
  EsquemaRespuesta,
  juntarHistoricos,
  juntarValoresDeReporte,
} from "@/lib/esquemas/indicadores";
import { destinoTrasReportar, type EstadoReporte } from "@/lib/indicadores/reporte";
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

/**
 * `id` es el de la medición. Reporta (o corrige) y lleva a `volver`; «Guardar sin reportar» (`intencion=parcial`) se
 * queda en la pantalla con su aviso. Un salto grande frente al periodo anterior no escribe nada y vuelve con la
 * pregunta (`confirmar`), que la persona responde con `confirmado`.
 */
export async function reportarAccion(_prev: EstadoReporte, formData: FormData): Promise<EstadoReporte> {
  // `mutacion` solo devuelve un destino: lo demás que dice `reportar` sale por aquí.
  const dicho: { confirmar: string | null; parcial: boolean } = { confirmar: null, parcial: false };
  const estado = await mutacion(formData, "indicadores.medir", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(juntarValoresDeReporte(formData), EsquemaReporte, { omitir: ["id", "volver", "periodo"] });
    dicho.parcial = d.intencion === "parcial";
    const r = await reportar(sesion, {
      medicionId: idNumerico(formData, "id"),
      valores: d.valores,
      parcial: dicho.parcial,
      confirmado: d.confirmado,
    });
    if (!r.ok) {
      dicho.confirmar = r.confirmar;
      return;
    }
    if (dicho.parcial) return;
    // Si el periodo quedó pidiendo su análisis, la página a la que se vuelve lleva el foco a él (Tarea 19, D-12).
    return destinoTrasReportar(rutaInterna(formData.get("volver"), "/indicadores"), String(formData.get("periodo") ?? ""), r);
  });
  if (dicho.confirmar) return { ok: false, error: dicho.confirmar, confirmar: dicho.confirmar, valores: valoresDeFormulario(formData) };
  if (estado === null && dicho.parcial) return { ok: true, aviso: "Se guardó sin reportar: la medición sigue abierta." };
  return estado;
}

/** `id` es el de la medición. Pide el motivo y lleva a `volver`. */
export async function marcarNoAplicaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.medir", async (_usuarioId, _formData, sesion) => {
    const { motivo } = parsearFormulario(formData, EsquemaNoAplica, { omitir: ["id", "volver"] });
    await marcarNoAplica(sesion, { medicionId: idNumerico(formData, "id"), motivo });
    return rutaInterna(formData.get("volver"), "/indicadores");
  });
}

/** `id` es el de la medición. No navega: la pantalla vuelve a pintarse por reportar. */
export async function quitarNoAplicaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.medir", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await quitarNoAplica(sesion, idNumerico(formData, "id"));
  });
}

/**
 * `id` es el de la medición. Escribe el análisis (o la causa y la acción propuesta) y lleva a `volver`. Un campo que no
 * llega queda como estaba; uno vacío se borra.
 */
export async function analizarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.medir", async (_usuarioId, _formData, sesion) => {
    await analizar(sesion, { medicionId: idNumerico(formData, "id"), ...analisisDelFormulario(formData) });
    return rutaInterna(formData.get("volver"), "/indicadores");
  });
}

/** `id` es el de la medición. No navega: la lista de observaciones vuelve a pintarse con la nueva. */
export async function observarAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.observar", async (_usuarioId, _formData, sesion) => {
    const { texto } = parsearFormulario(formData, EsquemaObservacion, { omitir: ["id"] });
    await observar(sesion, { medicionId: idNumerico(formData, "id"), texto });
  });
}

/** `id` es el de la observación que se responde. No navega. */
export async function responderAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.observar", async (_usuarioId, _formData, sesion) => {
    const { texto } = parsearFormulario(formData, EsquemaRespuesta, { omitir: ["id"] });
    await responder(sesion, { observacionId: idNumerico(formData, "id"), texto });
  });
}

/**
 * `id` es el del soporte (la fila de `archivos`). No navega: la pantalla vuelve a pintarse sin él. Solo antes del cierre y
 * de quien puede medir el indicador: la consulta lo comprueba.
 */
export async function quitarSoporteAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.medir", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await quitarSoporte(sesion, { archivoId: idNumerico(formData, "id") });
  });
}

/** `id` es el del indicador. Programa la meta de un periodo; no navega: el diálogo sigue abierto con la tabla al día. */
export async function programarMetaAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const d = parsearFormulario(formData, EsquemaMeta, { omitir: ["id"] });
    await programarMeta(sesion, { indicadorId: idNumerico(formData, "id"), ...d });
  });
}

/**
 * `id` es el del indicador. Registra (o corrige) los históricos de la tabla del año, que manda cada celda en su campo
 * (`h_2025-T3_A`), y vuelve a `volver` con cuántos registró (`registrados=N`).
 */
export async function registrarHistoricosAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.medir", async (_usuarioId, _formData, sesion) => {
    const { filas } = parsearFormulario(juntarHistoricos(formData), EsquemaHistoricos, { omitir: ["id", "volver"] });
    const { registrados } = await registrarHistoricos(sesion, { indicadorId: idNumerico(formData, "id"), filas });
    const destino = rutaInterna(formData.get("volver"), "/indicadores");
    return `${destino}${destino.includes("?") ? "&" : "?"}registrados=${registrados}`;
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

/**
 * Cierra el mes elegido (spec §9), sin clave (F14-DC9), y vuelve a «Cierre del mes» con cuántas mediciones cerró
 * (`cerrado=AAAA-MM&cerradas=N`).
 */
export async function cerrarMesAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { mes } = parsearFormulario(formData, EsquemaCierreMes);
    const { cerradas } = await cerrarMes(sesion, mes);
    return `/indicadores/cierre?cerrado=${mes}&cerradas=${cerradas}`;
  });
}

/** `id` es el de la medición cerrada. La reabre con justificación y sin clave; no navega: la tabla se repinta. */
export async function reabrirMedicionAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    const { justificacion } = parsearFormulario(formData, EsquemaReapertura, { omitir: ["id"] });
    await reabrirMedicion(sesion, { medicionId: idNumerico(formData, "id"), justificacion });
  });
}

/** `id` es el de la medición reabierta. Vuelve a cerrada con el último cierre; no navega. */
export async function cerrarDeNuevoAccion(_prev: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "indicadores.administrar", async (_usuarioId, _formData, sesion) => {
    parsearFormulario(formData, EsquemaSinDatos, { omitir: ["id"] });
    await cerrarDeNuevo(sesion, idNumerico(formData, "id"));
  });
}
