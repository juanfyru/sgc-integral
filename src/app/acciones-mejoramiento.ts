"use server";

// Acciones del módulo de mejoramiento (Fase 15). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona (el alcance de proceso, quien tiene el turno) la vuelve a comprobar la consulta dentro de su transacción.
// Las de la configuración viven en `src/app/admin/acciones-mejoramiento.ts`.

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { reasignarActividad, registrarSeguimiento, terminarActividad } from "@/db/consultas/mejoramiento/actividades";
import { guardarAnalisis, guardarCausas, quitarAnalisis, responderPreguntas } from "@/db/consultas/mejoramiento/analisis";
import { aprobarPlan, devolverPlan, enviarPlan, firmarRevision } from "@/db/consultas/mejoramiento/aprobacion";
import { quitarArchivoDeMejora } from "@/db/consultas/mejoramiento/archivos";
import { guardarAccion, guardarCriterio, quitarAccion } from "@/db/consultas/mejoramiento/plan";
import {
  aceptarHallazgo,
  arbitrarHallazgo,
  decidirAccionCorrectiva,
  devolverCorreccion,
  rechazarHallazgo,
  registrarCorreccion,
  retirarHallazgo,
  sostenerHallazgo,
  validarCorreccion,
} from "@/db/consultas/mejoramiento/recorrido";
import {
  anularHallazgo,
  cambiarProceso,
  editarHallazgo,
  enlacesDelHallazgo,
  procesoDelHallazgo,
  reclasificarHallazgo,
  registrarHallazgo,
  registrarOcurrencia,
} from "@/db/consultas/mejoramiento/registro";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import {
  EsquemaActividad,
  EsquemaAnulacion,
  EsquemaCambioDeProceso,
  EsquemaCorreccion,
  EsquemaCriterio,
  EsquemaDevolucion,
  EsquemaDevolverPlan,
  EsquemaFormularioAccion,
  EsquemaFormularioAnalisis,
  EsquemaFormularioArbitraje,
  EsquemaFormularioCausas,
  EsquemaFormularioDecision,
  EsquemaFormularioFirmaDelPlan,
  EsquemaFormularioPreguntas,
  EsquemaFormularioRevisarPlan,
  EsquemaHallazgo,
  EsquemaOcurrencia,
  EsquemaPasoDelHallazgo,
  EsquemaQuitarAccion,
  EsquemaQuitarAnalisis,
  EsquemaReasignar,
  EsquemaRechazo,
  EsquemaReclasificacion,
  EsquemaSeguimiento,
  EsquemaSostener,
  RELACION_DE_REGISTRO,
} from "@/lib/esquemas/mejoramiento";
import { rutaDeHallazgo } from "@/lib/mejoramiento/rutas";
import { parsearFormulario } from "@/lib/validacion";

/**
 * Registra un hallazgo y lleva a su página. Ante los parecidos del mismo proceso, `relacion` dice la salida que se eligió
 * (spec §7.5): `ocurrencia:<id>` no crea un hallazgo, añade una ocurrencia al abierto; `reincidencia:<id>` lo enlaza a uno
 * cerrado; `distinto` (o ausente) nace normal. Las evidencias llegan en la tarea 9.
 */
export async function registrarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaHallazgo, { omitir: ["relacion"] });
    const relacion = RELACION_DE_REGISTRO.exec(String(datos.get("relacion") ?? "distinto"));
    if (!relacion) throw new Error("La salida elegida ante los parecidos no es válida");
    if (relacion[1] === "ocurrencia") {
      const hallazgoId = Number(relacion[2]);
      await registrarOcurrencia(sesion, { hallazgoId, fecha: d.detectadoEn, descripcion: d.descripcion });
      return rutaDeHallazgo(hallazgoId);
    }
    const hallazgo = await registrarHallazgo(sesion, {
      ...d,
      reincidenteDe: relacion[1] === "reincidencia" ? Number(relacion[2]) : null,
    });
    return rutaDeHallazgo(hallazgo.id);
  });
}

/** Una ocurrencia más de un hallazgo abierto, desde su página (spec §7.5). */
export async function registrarOcurrenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaOcurrencia);
    await registrarOcurrencia(sesion, { ...d, origen: "registro", reporteId: null });
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Reclasifica un hallazgo, con justificación: solo el Admin SGC (spec §7.6). */
export async function reclasificarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaReclasificacion);
    await reclasificarHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Anula un hallazgo no terminado, con justificación: solo el Admin SGC (spec §7.6). */
export async function anularHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaAnulacion);
    await anularHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/**
 * Edita la identificación de un hallazgo «Por aceptar» (spec §7.6): solo quien lo registró. El formulario no pinta el
 * subproceso, el documento, el indicador, la medición ni la reincidencia: se conservan (salvo el subproceso y la
 * reincidencia si cambia el proceso, que ya no valen).
 */
export async function editarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const id = idNumerico(datos, "hallazgoId");
    const d = parsearFormulario(datos, EsquemaHallazgo, { omitir: ["hallazgoId"] });
    const enlaces = await enlacesDelHallazgo(id);
    const mismoProceso = d.procesoId === (await procesoDelHallazgo(id));
    await editarHallazgo(sesion, id, {
      ...d,
      ...enlaces,
      subprocesoId: mismoProceso ? enlaces.subprocesoId : null,
      reincidenteDe: mismoProceso ? enlaces.reincidenteDe : null,
    });
    return rutaDeHallazgo(id);
  });
}

/** Cambia el proceso de un hallazgo «Por aceptar», con justificación: solo el Admin SGC (spec §7.6). */
export async function cambiarProcesoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaCambioDeProceso);
    await cambiarProceso(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/**
 * Quita un archivo de mejoramiento (spec 15 §12.2). El permiso de la matriz es el de ejecutar; la condición de persona (quien
 * lo subió mientras su paso sigue abierto, o el Admin SGC mientras el hallazgo no termine) la comprueba
 * `quitarArchivoDeMejora` dentro de su transacción.
 */
export async function quitarArchivoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.ejecutar", async (_usuarioId, datos, sesion) => {
    await quitarArchivoDeMejora(sesion, idNumerico(datos, "archivoId"));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El recorrido hasta el plan (spec 15 §8.3 a §8.5). La condición de persona la comprueba cada función del dominio dentro de
// su transacción. Un acto que dan dos roles con permisos distintos de la matriz tiene una acción por permiso, y las dos
// llaman la misma función.
// ─────────────────────────────────────────────────────────────────────────────

/** El líder del proceso acepta el hallazgo (o el Admin SGC, si el proceso no tiene líder). */
export async function aceptarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaPasoDelHallazgo);
    await aceptarHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** El líder del proceso lo rechaza, con justificación. */
export async function rechazarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaRechazo);
    await rechazarHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Quien lo registró (o el Admin SGC en su lugar) lo retira tras el rechazo. */
export async function retirarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaPasoDelHallazgo);
    await retirarHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Quien lo registró (o el Admin SGC en su lugar) lo sostiene con su réplica: pasa a arbitraje. */
export async function sostenerHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaSostener);
    await sostenerHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** El arbitraje, como Admin SGC. */
export async function arbitrarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioArbitraje);
    await arbitrarHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** El arbitraje, como Gerencia: cuando un Admin SGC registró el hallazgo o lo sostuvo (spec §8.3). */
export async function arbitrarHallazgoGerenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.aprobar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioArbitraje);
    await arbitrarHallazgo(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** El líder del proceso registra la corrección (o el Admin SGC, si el proceso no tiene líder). */
export async function registrarCorreccionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaCorreccion);
    await registrarCorreccion(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** El Admin SGC decide si requiere acción correctiva, o exige la acción después de un «no». */
export async function decidirAccionCorrectivaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioDecision);
    await decidirAccionCorrectiva(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Gerencia exige la acción correctiva después de un «no» (spec §8.5, literal c del SGC-PR-03 §5.2). */
export async function decidirAccionCorrectivaGerenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.aprobar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioDecision);
    await decidirAccionCorrectiva(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Valida la corrección, o el cierre sin acción. */
export async function validarCorreccionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.verificar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaPasoDelHallazgo);
    await validarCorreccion(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Devuelve la corrección con una nota: vuelve a «Por corregir». */
export async function devolverCorreccionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.verificar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaDevolucion);
    await devolverCorreccion(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El análisis de causa raíz (spec 15 §9). Quien formula es quien actúa por el proceso; lo comprueba cada función del
// dominio dentro de su transacción. Guardar no redirige: la página se vuelve a leer y la persona sigue donde estaba.
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda un análisis de la ronda (nuevo, o `analisisId` para reemplazar uno). El contenido lo valida el esquema del método. */
export async function guardarAnalisisAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioAnalisis);
    await guardarAnalisis(sesion, d);
  });
}

/** Quita un análisis de la ronda en curso. */
export async function quitarAnalisisAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaQuitarAnalisis);
    await quitarAnalisis(sesion, d);
  });
}

/** Reemplaza la lista de causas raíz de la ronda. */
export async function guardarCausasAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioCausas);
    // `causas` llega como JSON sin validar: `guardarCausas` lo lee con `EsquemaCausas` antes de escribir.
    await guardarCausas(sesion, d as Parameters<typeof guardarCausas>[1]);
  });
}

/** Las dos preguntas de cierre del análisis. */
export async function responderPreguntasAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioPreguntas);
    await responderPreguntas(sesion, d);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El plan de acción en borrador (spec 15 §10 y §11.2). Quien formula es quien actúa por el proceso; lo comprueba cada
// función del dominio dentro de su transacción. Guardar no redirige: la página se vuelve a leer.
// ─────────────────────────────────────────────────────────────────────────────

/** Guarda una acción del plan con sus actividades (nueva, o `accionId` para reemplazar una de la ronda). */
export async function guardarAccionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioAccion);
    // `actividades` llega como JSON sin validar: `guardarAccion` lo lee con `EsquemaAccion` antes de escribir.
    await guardarAccion(sesion, d as Parameters<typeof guardarAccion>[1]);
  });
}

/** Quita una acción del plan con sus actividades. */
export async function quitarAccionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaQuitarAccion);
    await quitarAccion(sesion, d);
  });
}

/** El criterio de eficacia de la ronda. */
export async function guardarCriterioAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaCriterio);
    await guardarCriterio(sesion, d);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Las firmas del plan (spec 15 §8.6 y §12.1): enviar, devolver, revisar y aprobar. Quién da cada paso lo comprueba la
// función del dominio dentro de su transacción; devolver lo dan dos roles con permisos distintos de la matriz, con una acción
// por permiso que llaman la misma función.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Saca la clave y el código del formulario y los deja en una copia: `mutacion` le devuelve al navegador lo enviado cuando
 * algo falla, y una clave no vuelve por ahí (como en `acciones-indicadores.ts`).
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

/** Envía la causa raíz y el plan con la firma «Elaboró» y lleva a la página del hallazgo (la de formular ya no existe para él). */
export async function enviarPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "mejora.formular", async (_usuarioId, _datos, sesion) => {
    const d = parsearFormulario(firma, EsquemaFormularioFirmaDelPlan);
    try {
      await enviarPlan(sesion, { hallazgoId: d.hallazgoId, credenciales: { clave: d.clave, codigo: d.codigo } }, { contexto: await contextoDePeticion() });
      return rutaDeHallazgo(d.hallazgoId);
    } catch (err) {
      return destinoDeFirma(err);
    }
  });
}

/** El Admin SGC devuelve el plan en revisión, con observaciones. */
export async function devolverPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaDevolverPlan);
    await devolverPlan(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** Gerencia devuelve el plan en aprobación, con observaciones. */
export async function devolverPlanGerenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.aprobar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaDevolverPlan);
    await devolverPlan(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/** El Admin SGC firma «Revisó», con la marca de recursos o impacto institucional y su nota. */
export async function firmarRevisionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, _datos, sesion) => {
    const d = parsearFormulario(firma, EsquemaFormularioRevisarPlan);
    try {
      await firmarRevision(
        sesion,
        {
          hallazgoId: d.hallazgoId,
          requiereRecursos: d.requiereRecursos,
          notaRecursos: d.notaRecursos,
          credenciales: { clave: d.clave, codigo: d.codigo },
        },
        { contexto: await contextoDePeticion() },
      );
      return rutaDeHallazgo(d.hallazgoId);
    } catch (err) {
      return destinoDeFirma(err);
    }
  });
}

/** Gerencia firma «Aprobó»: el plan pasa a ejecución. */
export async function aprobarPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "mejora.aprobar", async (_usuarioId, _datos, sesion) => {
    const d = parsearFormulario(firma, EsquemaFormularioFirmaDelPlan);
    try {
      await aprobarPlan(sesion, { hallazgoId: d.hallazgoId, credenciales: { clave: d.clave, codigo: d.codigo } }, { contexto: await contextoDePeticion() });
      return rutaDeHallazgo(d.hallazgoId);
    } catch (err) {
      return destinoDeFirma(err);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Las actividades del plan aprobado (spec 15 §10.2 a §10.4). La condición de persona (el responsable, o un líder del proceso o
// el Admin SGC para reasignar) la comprueba cada función del dominio dentro de su transacción. No redirigen: la página se
// vuelve a leer.
// ─────────────────────────────────────────────────────────────────────────────

/** El responsable registra un seguimiento de su actividad. */
export async function registrarSeguimientoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.ejecutar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaSeguimiento);
    await registrarSeguimiento(sesion, d);
  });
}

/** El responsable termina su actividad, con el avance en 100 y al menos un archivo de evidencia. */
export async function terminarActividadAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.ejecutar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaActividad);
    await terminarActividad(sesion, d);
  });
}

/** Un líder del proceso o el Admin SGC reasignan una actividad sin terminar, con motivo. */
export async function reasignarActividadAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.formular", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaReasignar);
    await reasignarActividad(sesion, d);
  });
}
