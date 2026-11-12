/**
 * Lo que lee cada vista de la página de un indicador (spec §12.3): la página decide la sesión, la visibilidad y la vista;
 * aquí se leen los datos de la elegida y se responde «no encontrada» a un parámetro que esa vista no admite.
 */
import { notFound } from "next/navigation";
import type { FilaHistoricaVista } from "@/componentes/indicadores/medicion/EdicionDeHistoricos";
import type { DatosDeFicha } from "@/componentes/indicadores/vistas/VistaFicha";
import type { DatosDeObservaciones } from "@/componentes/indicadores/vistas/VistaObservaciones";
import type { DatosDeResultados, RangoDeGrafica } from "@/componentes/indicadores/vistas/VistaResultados";
import type { DatosDeVersiones } from "@/componentes/indicadores/vistas/VistaVersiones";
import type { FilaPorAprobar } from "@/componentes/indicadores/ficha/ListaPorAprobar";
import { obtenerSql } from "@/db/cliente";
import { datosDeAnalisis, type DatosDeAnalisis } from "@/db/consultas/indicadores/analisis";
import {
  cambiosFrenteALaVigente,
  enlaceDeVersion,
  fichaDeVersion,
  operacionDeIndicador,
  versionesDe,
  type FichaLeida,
  type VersionVisible,
} from "@/db/consultas/indicadores/aprobacion";
import { historialDeCorregidas } from "@/db/consultas/indicadores/cierre";
import { obtenerIndicador, resultadosDelAnio } from "@/db/consultas/indicadores/lectura";
import { obtenerParametros } from "@/db/consultas/indicadores/maestros";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { observacionesDe, type ResumenDeObservaciones } from "@/db/consultas/indicadores/observaciones";
import { soportesDeVarias } from "@/db/consultas/indicadores/soportes";
import { puedeAnalizar, puedeObservar, puedeRegistrarHistoricos } from "@/lib/alcance";
import type { EstadoIndicador, Periodicidad } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";
import type { SesionValida } from "@/lib/sesion";
import { fechaYHora } from "@/lib/indicadores/ficha-en-texto";
import { fechaHoraLarga } from "@/lib/zona-horaria";

type Parametros = Record<string, string | string[] | undefined>;

/** Lo que la página ya sabe del indicador y de la persona. */
export type ContextoDeVista = {
  sesion: SesionValida;
  indicador: { id: number; codigo: string; estado: EstadoIndicador };
  ve: boolean;
  versiones: VersionVisible[];
  vigente: VersionVisible | null;
  /** La versión que se muestra. */
  ficha: FichaLeida;
  administra: boolean;
  ahora: Date;
};

const RANGOS: readonly RangoDeGrafica[] = ["anio", "dos", "todo"];

/**
 * Las variables de la ficha vigente más las letras que solo tiene la versión que rige algún histórico (una variable que
 * un cambio mayor quitó), con el nombre que tienen en esa versión, para que el modo edición pida todas las de cada
 * periodo.
 */
function conLetrasDe(variables: { letra: string; nombre: string }[], filas: FilaHistoricaVista[]): { letra: string; nombre: string }[] {
  const extra = new Map<string, string>();
  for (const v of filas.flatMap((f) => f.valores)) {
    if (!variables.some((x) => x.letra === v.letra) && !extra.has(v.letra)) extra.set(v.letra, v.nombre);
  }
  return [...variables, ...[...extra].sort(([a], [b]) => a.localeCompare(b)).map(([letra, nombre]) => ({ letra, nombre }))];
}

/**
 * «Se registraron 3 históricos.» tras guardar el modo edición (`?registrados=N`); `null` sin el parámetro. «No cambió
 * ningún histórico.» no es un éxito: va en texto neutro.
 */
function avisoDeHistoricos(r: Parametros["registrados"]): { texto: string; exito: boolean } | null {
  if (typeof r !== "string" || !/^\d{1,3}$/.test(r)) return null;
  const n = Number(r);
  if (n === 0) return { texto: "No cambió ningún histórico.", exito: false };
  return { texto: `Se ${n === 1 ? "registró" : "registraron"} ${cuenta(n, "histórico", "históricos")}.`, exito: true };
}

/**
 * «Resultados»: antes de leer se abren los periodos que hayan terminado (F14-DC12). El rango de la gráfica (`?rango=dos`,
 * `?rango=todo`), el análisis pedido (`?analizar=`) y el modo edición de históricos (`?historicos=editar`) existen solo
 * cuando la persona puede usarlos; si no, «no encontrada».
 */
export async function datosDeResultados(
  c: ContextoDeVista,
  sp: Parametros,
  a: { anio: number; primerAnio: number; anioEnCurso: number },
): Promise<DatosDeResultados> {
  const rango = sp.rango === undefined ? "anio" : RANGOS.find((x) => x === sp.rango && x !== "anio");
  if (rango === undefined) notFound();
  const { sesion, indicador, ahora } = c;
  await asegurarMediciones({ indicadorId: indicador.id, ahora });
  const vista = await obtenerIndicador(sesion, indicador.codigo);
  if (!vista) notFound();
  const desde = rango === "dos" ? a.anio - 1 : rango === "todo" ? a.primerAnio : a.anio;
  const resultados = await resultadosDelAnio(sesion, indicador.id, a.anio, { ahora, desde });
  const filas = resultados.filas;
  const medidas = filas.flatMap((f) => (f.medicionId === null ? [] : [f.medicionId]));
  // La columna de soportes, solo a quien los ve (spec §6.4 y §12.3); «Corregida» con su historial, a quien ve el indicador.
  const [soportes, historial, parametros] = await Promise.all([
    soportesDeVarias(sesion, indicador.id, medidas),
    historialDeCorregidas(sesion, indicador.id, filas.flatMap((f) => (f.corregida && f.medicionId !== null ? [f.medicionId] : []))),
    obtenerParametros(),
  ]);
  const { puedeMedir: mide, puedeAnalizar: analiza } = vista.permisos;
  const activo = indicador.estado === "activo";

  // Analizar: lo pedido con `?analizar=`, o la primera medición del año a la que le falta el análisis (spec §8.4).
  let analisis: DatosDeAnalisis | null = null;
  const analizables = filas.filter((x) => x.medicionId !== null && x.deOtraPeriodicidad !== true);
  if (sp.analizar !== undefined) {
    const f = analiza && typeof sp.analizar === "string" ? analizables.find((x) => x.periodo === sp.analizar) : undefined;
    analisis = f ? await datosDeAnalisis(sesion, f.medicionId!) : null;
    if (!analisis) notFound();
  } else if (analiza) {
    const falta = analizables.find((x) => x.estado === "falta_analisis");
    if (falta) analisis = await datosDeAnalisis(sesion, falta.medicionId!);
  }

  // Los históricos del año, a quien los registra (spec §8.8): el modo edición existe si alguno sigue abierto.
  const registra = activo && (await puedeRegistrarHistoricos(indicador.id, sesion)).puede;
  const editables: FilaHistoricaVista[] = filas
    .filter((f) => f.historica && f.medicionId !== null && f.deOtraPeriodicidad !== true)
    .map((f) => ({
      periodo: f.periodo,
      etiqueta: f.etiqueta,
      cerrada: f.estado === "cerrada",
      valores: f.valores,
      noAplica: f.noAplica,
      motivo: f.motivo,
      resultado: f.resultado,
    }));
  const editando = sp.historicos !== undefined;
  if (editando && (sp.historicos !== "editar" || !registra || !editables.some((f) => !f.cerrada))) notFound();
  const vigentes = vista.ficha.contenido.variables.map((v) => ({ letra: v.letra, nombre: v.nombre ?? v.letra }));

  return {
    codigo: indicador.codigo,
    indicadorId: indicador.id,
    anio: a.anio,
    // Los años con mediciones (dentro de los que la página admite), más el en curso y el que se muestra.
    anios: [...new Set([...resultados.anios.filter((x) => x >= a.primerAnio && x <= a.anioEnCurso), a.anioEnCurso, a.anio])].sort((x, y) => y - x),
    rango,
    periodicidad: (vista.ficha.contenido.periodicidad as Periodicidad | null) ?? null,
    resultados,
    ultimo: vista.ultimo,
    periodosSinCumplir: parametros.incumplimientoPeriodos,
    mide,
    analiza,
    analisis,
    enfocarAnalisis: sp.foco === "analisis" && analisis !== null,
    historicos: registra ? { editables, editando, variables: conLetrasDe(vigentes, editables) } : null,
    aviso: avisoDeHistoricos(sp.registrados),
    soportes,
    cierre: { reabre: c.administra && activo, cierraDeNuevo: c.administra, historial },
  };
}

/**
 * «Observaciones», a quien ve los soportes (la página ya lo decidió con `resumen`): el periodo de `?periodo=`; por
 * omisión, el primero con alguna sin respuesta, o con alguna, o el más reciente.
 */
export async function datosDeObservaciones(c: ContextoDeVista, sp: Parametros, resumen: ResumenDeObservaciones): Promise<DatosDeObservaciones> {
  const { sesion, indicador } = c;
  const pedida = sp.periodo;
  const elegida =
    pedida === undefined
      ? (resumen.mediciones.find((m) => m.sinRespuesta > 0) ?? resumen.mediciones.find((m) => m.total > 0) ?? resumen.mediciones[0] ?? null)
      : typeof pedida === "string"
        ? (resumen.mediciones.find((m) => m.periodo === pedida) ?? null)
        : null;
  if (pedida !== undefined && !elegida) notFound();
  const enVista = (r: { id: number; autor: string; creadoEn: Date; texto: string }) => ({ id: r.id, autor: r.autor, fecha: fechaHoraLarga(r.creadoEn), texto: r.texto });
  const lista = elegida ? ((await observacionesDe(sesion, elegida.medicionId)) ?? []) : [];
  return {
    codigo: indicador.codigo,
    resumen,
    elegida,
    observaciones: lista.map((o) => ({ ...enVista(o), respuestas: o.respuestas.map(enVista) })),
    puedeObservar: await puedeObservar(indicador.id, sesion),
    puedeResponder: c.administra || (await puedeAnalizar(indicador.id, sesion)).puede,
  };
}

/** «Ficha técnica»: lo que «Aprobar» firma, si la versión está por aprobar, y los datos de operación a quien los ve. */
export async function datosDeFicha(c: ContextoDeVista): Promise<DatosDeFicha> {
  const { ficha, indicador } = c;
  const codigo = indicador.codigo;
  let porAprobar: FilaPorAprobar | null = null;
  if (ficha.estado === "por_aprobar") {
    porAprobar = {
      versionId: ficha.versionId,
      codigo,
      nombre: ficha.contenido.nombre ?? codigo,
      proceso: ficha.contenido.procesoNombre ?? "",
      numero: ficha.numero,
      tipoCambio: ficha.tipoCambio,
      cambios: ficha.tipoCambio === "inicial" ? [] : await cambiosFrenteALaVigente(obtenerSql(), indicador.id, ficha.versionId),
      motivo: ficha.motivo,
      elaboro: ficha.firmas.elaboro?.nombre ?? "",
      enviada: ficha.firmas.elaboro ? fechaYHora(ficha.firmas.elaboro.fecha) : "",
      enlace: enlaceDeVersion(codigo, ficha.numero),
    };
  }
  return {
    ficha,
    codigo,
    vigente: c.vigente,
    enCurso: c.versiones.find((v) => v.estado === "borrador" || v.estado === "por_aprobar") ?? null,
    administra: c.administra,
    porAprobar,
    pideCodigo: c.sesion.totpActivo,
    operacion: c.ve || ficha.aprueba ? await operacionDeIndicador(indicador.id) : null,
  };
}

/** «Versiones»: el control de cambios y cada versión aprobada anterior a la vigente, completa. */
export async function datosDeVersiones(c: ContextoDeVista): Promise<DatosDeVersiones> {
  const resumen = await versionesDe(c.indicador.id);
  const anteriores: FichaLeida[] = [];
  for (const v of resumen) {
    if (v.id === c.vigente?.id) continue;
    const anterior = await fichaDeVersion(c.sesion, v.id);
    if (anterior) anteriores.push(anterior);
  }
  return { resumen, anteriores, vigente: c.vigente?.id ?? null };
}
