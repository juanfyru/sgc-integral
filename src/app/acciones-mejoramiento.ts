"use server";

// Acciones del módulo de mejoramiento (Fase 15). Cada una pasa por `mutacion` con su permiso de la matriz; la condición
// de persona (el alcance de proceso, quien tiene el turno) la vuelve a comprobar la consulta dentro de su transacción.
// Las de la configuración viven en `src/app/admin/acciones-mejoramiento.ts`.

import { idNumerico, mutacion, type EstadoAccion } from "@/app/admin/comun";
import { quitarArchivoDeMejora } from "@/db/consultas/mejoramiento/archivos";
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
import {
  EsquemaAnulacion,
  EsquemaCambioDeProceso,
  EsquemaCorreccion,
  EsquemaDevolucion,
  EsquemaFormularioArbitraje,
  EsquemaFormularioDecision,
  EsquemaHallazgo,
  EsquemaOcurrencia,
  EsquemaPasoDelHallazgo,
  EsquemaRechazo,
  EsquemaReclasificacion,
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
