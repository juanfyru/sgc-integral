"use server";

// Acciones del módulo de mejoramiento (Fase 15). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona (el alcance de proceso, quien tiene el turno) la vuelve a comprobar la consulta dentro de su transacción.
// Las de la configuración viven en `src/app/admin/acciones-mejoramiento.ts`.

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { reasignarActividad, registrarSeguimiento, terminarActividad } from "@/db/consultas/mejoramiento/actividades";
import { decidirAjuste, escalarAGerencia, pedirAjuste, responderEscalada } from "@/db/consultas/mejoramiento/ajustes";
import { guardarAnalisis, guardarCausas, quitarAnalisis, responderPreguntas } from "@/db/consultas/mejoramiento/analisis";
import { aprobarPlan, devolverPlan, enviarPlan, firmarRevision } from "@/db/consultas/mejoramiento/aprobacion";
import { quitarArchivoDeMejora } from "@/db/consultas/mejoramiento/archivos";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { resolverConOcurrencia, resolverNoRequiere } from "@/db/consultas/mejoramiento/marcas";
import { cambiarDePlan, ponerEnPlan, ponerObjetivo, sacarDelPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { guardarAccion, guardarCriterio, quitarAccion } from "@/db/consultas/mejoramiento/plan";
import { anularPlan, crearPlan, editarPlan } from "@/db/consultas/mejoramiento/planes";
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
  fijosDelEnvio,
  procesoDelHallazgo,
  reclasificarHallazgo,
  registrarHallazgo,
  registrarOcurrencia,
  registrarRespuestaAlEnte,
} from "@/db/consultas/mejoramiento/registro";
import { descartarReporte, enviarReporte, hallazgoPorCodigo, sumarReporte } from "@/db/consultas/mejoramiento/reportes";
import { registrarRespuestaDelPlan } from "@/db/consultas/mejoramiento/respuesta-plan";
import { enlazarTramite, quitarEnlace } from "@/db/consultas/mejoramiento/tramites-enlace";
import { cerrarHallazgo, evaluarEficacia, LO_VISTO_CAMBIO, verificarImplementacion } from "@/db/consultas/mejoramiento/verificacion";
import { contextoDePeticion } from "@/lib/contexto-peticion";
import {
  CAMPOS_DE_LA_CARGA,
  EsquemaActividad,
  EsquemaAnulacion,
  EsquemaAnulacionDePlan,
  EsquemaCambioDeProceso,
  EsquemaCorreccion,
  EsquemaCriterio,
  EsquemaDescarte,
  EsquemaDevolucion,
  EsquemaDevolverPlan,
  EsquemaEdicionDePlan,
  EsquemaEnlazarTramite,
  EsquemaEscalar,
  EsquemaFormularioAccion,
  EsquemaFormularioAjuste,
  EsquemaFormularioAnalisis,
  EsquemaFormularioArbitraje,
  EsquemaFormularioCarga,
  EsquemaFormularioCambiarDePlan,
  EsquemaFormularioCausas,
  EsquemaFormularioCierre,
  EsquemaFormularioDecidirAjuste,
  EsquemaFormularioDecision,
  EsquemaFormularioEvaluacion,
  EsquemaFormularioFirmaDelPlan,
  EsquemaFormularioPonerEnPlan,
  EsquemaFormularioPreguntas,
  EsquemaFormularioRespuestaDelPlan,
  EsquemaFormularioResponderEscalada,
  EsquemaFormularioRevisarPlan,
  EsquemaFormularioSumarReporte,
  EsquemaFormularioVerificacion,
  EsquemaHallazgo,
  EsquemaObjetivoDelHallazgo,
  EsquemaOcurrencia,
  EsquemaPasoDelHallazgo,
  EsquemaPlan,
  EsquemaQuitarAccion,
  EsquemaQuitarAnalisis,
  EsquemaQuitarEnlace,
  EsquemaReasignar,
  EsquemaRechazo,
  EsquemaMarcaConOcurrencia,
  EsquemaMarcaNoRequiere,
  EsquemaReclasificacion,
  EsquemaReporte,
  EsquemaRespuestaAlEnte,
  EsquemaSacarDelPlan,
  EsquemaSeguimiento,
  EsquemaSostener,
  RELACION_DE_REGISTRO,
  camposDeLaVerificacion,
  decisionesDeLaVerificacion,
  idsDeLaVerificacion,
} from "@/lib/esquemas/mejoramiento";
import { RUTA_REPORTES_RECIBIDOS, rutaDeReportar } from "@/lib/mejoramiento/reportes";
import { FIJOS_DE_VERIFICACION, OCURRENCIA_DESDE_UN_IMPACTO, OCURRENCIA_DESDE_UNA_VERIFICACION } from "@/lib/mejoramiento/enganches";
import { OCURRENCIA_DESDE_EL_PANEL } from "@/lib/mejoramiento/marcas";
import { LISTOS_CAMBIARON } from "@/lib/mejoramiento/planes";
import { ANCLA_RESPUESTA_AL_ENTE, rutaDeActividad, rutaDeHallazgo, rutaDePlan } from "@/lib/mejoramiento/rutas";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { parsearFormulario } from "@/lib/validacion";

/**
 * Registra un hallazgo y lleva a su página. Ante los parecidos del mismo proceso, `relacion` dice la salida que se eligió
 * (spec §7.5): `ocurrencia:<id>` no crea un hallazgo, añade una ocurrencia al abierto; `reincidencia:<id>` lo enlaza a uno
 * cerrado; `distinto` (o ausente) nace normal. Desde un reporte (`reporteId`, spec §7.3), registrar lo convierte y elegir una
 * ocurrencia lo suma a ese hallazgo: el reporte nunca queda sin clasificar. El plan oculto (`planId`) y el objetivo (Fase 15B)
 * los vuelve a validar `registrarHallazgo` dentro de su transacción; una ocurrencia no los usa: no nace ningún hallazgo. Desde el
 * panel de la marca de un indicador (`marcaMedicionId`, anexo 15B §6.2) no se añade una ocurrencia a un parecido: se rechaza con
 * `OCURRENCIA_DESDE_EL_PANEL` (el formulario ya no la ofrece), porque así no quedaría la salida de la marca. Desde un hallazgo de
 * verificación (`verificacionHallazgoId`, anexo 15B §7.2) la clase y el origen son fijos: lo que traiga el envío no cuenta; y la
 * ocurrencia de un parecido se rechaza igual (`OCURRENCIA_DESDE_UNA_VERIFICACION`): perdería el enlace y la justificación. Desde un
 * impacto de norma (`impactoId` o `impactoIndicadorId`, anexo 15B §8) el origen, la norma y el proceso son los del impacto
 * (`fijosDelEnvio`), y la ocurrencia se rechaza igual (`OCURRENCIA_DESDE_UN_IMPACTO`): el impacto se quedaría sin su hallazgo.
 */
export async function registrarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const texto = (campo: string) => String(datos.get(campo) ?? "");
    if (texto("verificacionHallazgoId") !== "") {
      for (const [campo, valor] of Object.entries(FIJOS_DE_VERIFICACION)) datos.set(campo, valor);
    }
    const delImpacto = await fijosDelEnvio(sesion, {
      impactoId: texto("impactoId"),
      impactoIndicadorId: texto("impactoIndicadorId"),
      verificacionHallazgoId: texto("verificacionHallazgoId"),
      marcaMedicionId: texto("marcaMedicionId"),
    });
    for (const [campo, valor] of Object.entries(delImpacto ?? {})) datos.set(campo, valor);
    const d = parsearFormulario(datos, EsquemaHallazgo, { omitir: ["relacion"] });
    const relacion = RELACION_DE_REGISTRO.exec(String(datos.get("relacion") ?? "distinto"));
    if (!relacion) throw new Error("La salida elegida ante los parecidos no es válida");
    if (relacion[1] === "ocurrencia") {
      // Desde el panel de la marca, la ocurrencia se añade en el panel (`resolverConOcurrencia`), que deja la salida de la marca.
      if (d.marcaMedicionId !== null) throw new ErrorMejora(OCURRENCIA_DESDE_EL_PANEL);
      // Desde un hallazgo de verificación, la ocurrencia perdería el enlace y la justificación de la acción (anexo 15B §7.2).
      if (d.verificacionHallazgoId !== null) throw new ErrorMejora(OCURRENCIA_DESDE_UNA_VERIFICACION);
      // Desde un impacto de norma, la ocurrencia no lleva el enlace: el impacto se quedaría sin su hallazgo (anexo 15B §8).
      if (d.impactoId !== null || d.impactoIndicadorId !== null) throw new ErrorMejora(OCURRENCIA_DESDE_UN_IMPACTO);
      const hallazgoId = Number(relacion[2]);
      if (d.reporteId !== null) {
        await sumarReporte(sesion, { reporteId: d.reporteId, hallazgoId });
      } else {
        await registrarOcurrencia(sesion, { hallazgoId, fecha: d.detectadoEn, descripcion: d.descripcion });
      }
      return rutaDeHallazgo(hallazgoId);
    }
    const hallazgo = await registrarHallazgo(sesion, {
      ...d,
      reincidenteDe: relacion[1] === "reincidencia" ? Number(relacion[2]) : null,
    });
    return rutaDeHallazgo(hallazgo.id);
  });
}

/**
 * Carga un hallazgo ya en curso (spec §15): solo el Admin SGC. La identificación la lee `EsquemaHallazgo` y lo hecho en papel
 * `EsquemaFormularioCarga`, cada uno sin los campos del otro (los dos son estrictos); `cargarHallazgo` lo vuelve a validar todo.
 * Lleva a la página del hallazgo, que pide el formato firmado.
 */
export async function cargarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const deLaCarga = new Set<string>(CAMPOS_DE_LA_CARGA);
    const identificacion = parsearFormulario(datos, EsquemaHallazgo, { omitir: CAMPOS_DE_LA_CARGA });
    const enPapel = parsearFormulario(datos, EsquemaFormularioCarga, { omitir: [...datos.keys()].filter((k) => !deLaCarga.has(k)) });
    const { id } = await cargarHallazgo(sesion, { ...identificacion, ...enPapel });
    return rutaDeHallazgo(id);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Los reportes de funcionarios (spec 15 §7.3). Reportar lo hace cualquiera (`mejora.reportar`); clasificar, el Admin SGC
// (`mejora.gestionar`). Convertir va por `registrarHallazgoAccion`, con el `reporteId` del registro.
// ─────────────────────────────────────────────────────────────────────────────

/** Envía el reporte de una posible no conformidad y lleva al paso de sus archivos (hasta tres). */
export async function enviarReporteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.reportar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaReporte);
    const { id } = await enviarReporte(sesion, d);
    return rutaDeReportar(id);
  });
}

/**
 * El Admin SGC añade un reporte como ocurrencia de un hallazgo abierto: uno de los parecidos o cualquier otro que vea, por su
 * código (spec §7.3). `sumarReporte` vuelve a exigir que esté abierto y que lo vea.
 */
export async function sumarReporteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioSumarReporte);
    const hallazgoId = d.hallazgoId ?? (await hallazgoPorCodigo(sesion, d.codigo ?? ""));
    await sumarReporte(sesion, { reporteId: d.reporteId, hallazgoId });
    return RUTA_REPORTES_RECIBIDOS;
  });
}

/** El Admin SGC descarta un reporte con su motivo, que quien reportó lee. */
export async function descartarReporteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    await descartarReporte(sesion, parsearFormulario(datos, EsquemaDescarte));
    return RUTA_REPORTES_RECIBIDOS;
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
 * reincidencia si cambia el proceso, que ya no valen). La no conformidad de un hallazgo de verificación (anexo 15B §7.2) tiene la
 * clase y el origen fijos: se ponen en el envío antes de leerlo, así lo que traiga no cuenta ni en la validación. El hallazgo de un
 * impacto de norma (anexo 15B §8), igual con el origen, la norma y el proceso de su fila.
 */
export async function editarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    const id = idNumerico(datos, "hallazgoId");
    const { verificacionHallazgoId, fijosDelImpacto, ...enlaces } = await enlacesDelHallazgo(id);
    if (verificacionHallazgoId !== null) for (const [campo, valor] of Object.entries(FIJOS_DE_VERIFICACION)) datos.set(campo, valor);
    if (fijosDelImpacto) {
      datos.set("origen", fijosDelImpacto.origen);
      datos.set("requisitoNormaId", fijosDelImpacto.requisitoNormaId === null ? "" : String(fijosDelImpacto.requisitoNormaId));
      datos.set("procesoId", String(fijosDelImpacto.procesoId));
    }
    const d = parsearFormulario(datos, EsquemaHallazgo, { omitir: ["hallazgoId"] });
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

/**
 * El Admin SGC registra la respuesta al ente de un hallazgo externo con el plan aprobado (spec 15 §13.4): la fecha en que se
 * envió; el oficio es un archivo del hallazgo subido después de aprobado el plan, que `registrarRespuestaAlEnte` exige.
 */
export async function registrarRespuestaAlEnteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaRespuestaAlEnte);
    await registrarRespuestaAlEnte(sesion, d);
    return rutaDeHallazgo(d.hallazgoId);
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

// ─────────────────────────────────────────────────────────────────────────────
// Los ajustes al plan aprobado y la escalada a Gerencia (spec 15 §10.6 y §10.7). Quién pide qué, quién decide y si la actividad
// sigue vencida lo comprueba cada función del dominio dentro de su transacción. Decidir lo dan dos roles con permisos distintos
// de la matriz: una acción por permiso, y las dos llaman la misma función. No redirigen: la página se vuelve a leer.
// ─────────────────────────────────────────────────────────────────────────────

/** Pide un ajuste: el responsable, reprogramar la suya; un líder del proceso o el Admin SGC, también añadir y cancelar. */
export async function pedirAjusteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.ejecutar", async (_usuarioId, datos, sesion) => {
    // Los campos llegan como texto, en la forma de entrada de `EsquemaPedirAjuste`, con el que `pedirAjuste` los valida.
    await pedirAjuste(sesion, parsearFormulario(datos, EsquemaFormularioAjuste));
  });
}

/** El Admin SGC decide un ajuste de un plan que valió la revisión (o que pidió Gerencia, si nadie más puede). */
export async function decidirAjusteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    await decidirAjuste(sesion, parsearFormulario(datos, EsquemaFormularioDecidirAjuste));
  });
}

/** Gerencia decide un ajuste de un plan que aprobó (o que pidió el único Admin SGC activo). */
export async function decidirAjusteGerenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.aprobar", async (_usuarioId, datos, sesion) => {
    await decidirAjuste(sesion, parsearFormulario(datos, EsquemaFormularioDecidirAjuste));
  });
}

/** El Admin SGC escala a Gerencia una actividad vencida, con una nota. */
export async function escalarAGerenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    await escalarAGerencia(sesion, parsearFormulario(datos, EsquemaEscalar));
  });
}

/** Gerencia responde una escalada, con su nota y, si quiere, el acta del Comité. */
export async function responderEscaladaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.aprobar", async (_usuarioId, datos, sesion) => {
    await responderEscalada(sesion, parsearFormulario(datos, EsquemaFormularioResponderEscalada));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Verificar la implementación, evaluar la eficacia y cerrar (spec 15 §11.4 y §11.5). Quien ejecutó no verifica: lo comprueba
// `puedeVerificar` dentro de cada transacción; evaluar firma «Verificó» y cerrar «Cerró» (F13A-R4).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Quien no ejecutó verifica la implementación en un solo acto: cada actividad terminada conforme o devuelta (con su nota y su
 * fecha para corregir) y cómo verificó. Cada fila manda `actividad` (su id); lo que se decidió de ella viaja en sus propios
 * campos (`camposDeLaVerificada`), que se leen aquí y el dominio vuelve a validar.
 */
export async function verificarImplementacionAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.verificar", async (_usuarioId, datos, sesion) => {
    const ids = idsDeLaVerificacion(datos);
    const d = parsearFormulario(datos, EsquemaFormularioVerificacion, { omitir: camposDeLaVerificacion(ids) });
    await verificarImplementacion(sesion, {
      hallazgoId: d.hallazgoId,
      // Una fila sin decidir llega sin `conforme`: `verificarImplementacion` la rechaza con `SIN_DECIDIR`.
      actividades: decisionesDeLaVerificacion(datos, d.actividad),
      metodos: d.metodos,
      nota: d.nota ?? null,
    });
    return rutaDeHallazgo(d.hallazgoId);
  });
}

/**
 * Evalúa la eficacia con la firma «Verificó» (y, si evalúa «eficaz» un Admin SGC, también «Cerró»). Si cambió lo que la pantalla
 * mostró, el dominio lo rechaza sin escribir nada; la página se vuelve a leer, con los datos nuevos y su huella, para revisarlo.
 */
export async function evaluarEficaciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "mejora.verificar", async (_usuarioId, _datos, sesion) => {
    const d = parsearFormulario(firma, EsquemaFormularioEvaluacion);
    try {
      await evaluarEficacia(
        sesion,
        {
          hallazgoId: d.hallazgoId,
          // Texto del formulario: `evaluarEficacia` lo valida con `EsquemaEvaluacion` antes de nada.
          resultado: (d.resultado ?? "") as "eficaz" | "no_eficaz",
          criterios: d.criterios,
          desde: d.desde ?? "",
          hasta: d.hasta ?? "",
          justificacion: d.justificacion ?? "",
          confirmaOcurrencias: d.confirmaOcurrencias,
          lecciones: d.lecciones ?? null,
          cambiosAtendidos: d.cambiosAtendidos ?? null,
          vistoHuella: d.vistoHuella ?? "",
          credenciales: { clave: d.clave, codigo: d.codigo },
        },
        { contexto: await contextoDePeticion() },
      );
      return rutaDeHallazgo(d.hallazgoId);
    } catch (err) {
      // Cambió lo que se mostró: nada se escribió. La página vuelve con los datos nuevos, su huella y el aviso de que los revise.
      if (err instanceof ErrorMejora && err.message === LO_VISTO_CAMBIO) return `${rutaDeHallazgo(d.hallazgoId)}?visto=cambio#evaluar`;
      return destinoDeFirma(err);
    }
  });
}

/** El Admin SGC cierra un hallazgo eficaz con las lecciones aprendidas y la firma «Cerró». */
export async function cerrarHallazgoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  const firma = separarFirma(formData);
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, _datos, sesion) => {
    const d = parsearFormulario(firma, EsquemaFormularioCierre);
    try {
      await cerrarHallazgo(
        sesion,
        {
          hallazgoId: d.hallazgoId,
          lecciones: d.lecciones ?? "",
          cambiosAtendidos: d.cambiosAtendidos ?? null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Los planes de mejoramiento y la clasificación de un hallazgo (Fase 15B, anexo §3.2 a §3.4 y §10.4). Todas con `mejora.planes`;
// el dominio lo vuelve a exigir y comprueba, dentro de su transacción y con el plan bloqueado, que exista y no esté anulado. Es
// clasificación: ninguna avisa a nadie. Las que no navegan dejan que la página se vuelva a leer.
// ─────────────────────────────────────────────────────────────────────────────

/** Crea un plan (`PM-AAAA-NN`) y lleva a su página. */
export async function crearPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    const { id } = await crearPlan(sesion, parsearFormulario(datos, EsquemaPlan));
    return rutaDePlan(id);
  });
}

/** Edita todo menos el código y la vigencia, y vuelve a la página del plan. No cambia ningún hallazgo. */
export async function editarPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    const id = idNumerico(datos, "id");
    await editarPlan(sesion, id, parsearFormulario(datos, EsquemaEdicionDePlan, { omitir: ["id"] }));
    return rutaDePlan(id);
  });
}

/** Anula un plan sin hallazgos, con su motivo (al historial del plan, no a la bitácora). */
export async function anularPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    await anularPlan(sesion, parsearFormulario(datos, EsquemaAnulacionDePlan));
  });
}

/**
 * Pone uno o varios hallazgos en un plan: desde el selector del plan (vuelve a su página) o desde la página de un hallazgo. La
 * casilla del objetivo desmarcada llega como «no» explícito: el dominio, por omisión, entiende «sí».
 */
export async function ponerEnPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    const { volverAlPlan, ...d } = parsearFormulario(datos, EsquemaFormularioPonerEnPlan);
    await ponerEnPlan(sesion, d);
    return volverAlPlan ? rutaDePlan(d.planId) : undefined;
  });
}

/** Saca un hallazgo de su plan, con motivo. */
export async function sacarDelPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    await sacarDelPlan(sesion, parsearFormulario(datos, EsquemaSacarDelPlan));
  });
}

/** Mueve un hallazgo de su plan a otro, con motivo y un evento en cada plan. */
export async function cambiarDePlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    await cambiarDePlan(sesion, parsearFormulario(datos, EsquemaFormularioCambiarDePlan));
  });
}

/** Pone, cambia o quita (vacío) el objetivo de un hallazgo, en cualquier estado; su rastro va a la bitácora. */
export async function ponerObjetivoAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.planes", async (_usuarioId, datos, sesion) => {
    await ponerObjetivo(sesion, parsearFormulario(datos, EsquemaObjetivoDelHallazgo));
  });
}

/**
 * El Admin SGC registra la respuesta al ente desde el plan (anexo §3.8): la fecha de envío, el oficio (un archivo del plan) y los
 * hallazgos que el formulario mostró como listos (`vistos`), que `registrarRespuestaDelPlan` compara con los de verdad con todo
 * bloqueado. Si cambiaron, no se escribió nada: vuelve al bloque de la respuesta con la lista nueva y el aviso de que la revise
 * (Review Focus 4, como «lo visto cambió» de la evaluación de la eficacia).
 */
export async function registrarRespuestaDelPlanAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaFormularioRespuestaDelPlan);
    try {
      await registrarRespuestaDelPlan(sesion, d);
    } catch (err) {
      if (err instanceof ErrorMejora && err.message === LISTOS_CAMBIARON) {
        return `${rutaDePlan(d.planId)}?respuesta=cambio#${ANCLA_RESPUESTA_AL_ENTE}`;
      }
      throw err;
    }
    return `${rutaDePlan(d.planId)}#${ANCLA_RESPUESTA_AL_ENTE}`;
  });
}

/**
 * Resuelve el pendiente «Requiere acción de mejora» de una medición como una ocurrencia más de un hallazgo abierto que cita el
 * indicador (anexo 15B §6.2). No navega: la página del indicador se vuelve a pintar con la medición ya decidida.
 */
export async function resolverMarcaConOcurrenciaAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.registrar", async (_usuarioId, datos, sesion) => {
    await resolverConOcurrencia(sesion, parsearFormulario(datos, EsquemaMarcaConOcurrencia));
  });
}

/** Resuelve el pendiente con «No requiere acción de mejora» y su justificación (anexo 15B §6.2); solo el Admin SGC. */
export async function resolverMarcaNoRequiereAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "mejora.gestionar", async (_usuarioId, datos, sesion) => {
    await resolverNoRequiere(sesion, parsearFormulario(datos, EsquemaMarcaNoRequiere));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// El cambio documental desde una actividad (Fase 15B, anexo §9.3). Con `tramites.solicitar`, el permiso de pedir un trámite; que la
// persona vea la actividad y el trámite, que la actividad lo admita y quién quita un enlace lo comprueba el dominio en su transacción.
// Pedir el trámite es `crearSolicitudAccion` (`acciones-tramites.ts`), con el campo oculto `actividadId`.
// ─────────────────────────────────────────────────────────────────────────────

/** Enlaza a una actividad un trámite que ya existe, desde el selector, y vuelve a la actividad. */
export async function enlazarTramiteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.solicitar", async (_usuarioId, datos, sesion) => {
    const d = parsearFormulario(datos, EsquemaEnlazarTramite);
    await enlazarTramite(sesion, d);
    return rutaDeActividad(d.actividadId);
  });
}

/** Quita el enlace de un trámite puesto después (quien lo puso o el Admin SGC). No navega: la actividad se vuelve a pintar. */
export async function quitarEnlaceDeTramiteAccion(_previo: EstadoAccion, formData: FormData): Promise<EstadoAccion> {
  return mutacion(formData, "tramites.solicitar", async (_usuarioId, datos, sesion) => {
    await quitarEnlace(sesion, parsearFormulario(datos, EsquemaQuitarEnlace));
  });
}
