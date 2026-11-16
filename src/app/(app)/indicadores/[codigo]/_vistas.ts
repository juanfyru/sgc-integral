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
  restringidosQueToma,
  versionesDe,
  type FichaLeida,
  type VersionVisible,
} from "@/db/consultas/indicadores/aprobacion";
import type { DatosDeReportes } from "@/componentes/indicadores/vistas/ReportesAlEnte";
import { historialDeCorregidas } from "@/db/consultas/indicadores/cierre";
import {
  asegurarConstancias,
  constanciasDe,
  historialDeConstancias,
  puedeRegistrarConstancia,
  resultadoDelPeriodoExterno,
  soportesDeConstancias,
  type EnteDeLaFicha,
  type ResultadoExterno,
} from "@/db/consultas/indicadores/constancias";
import { desgloseDe } from "@/db/consultas/indicadores/categorias";
import { soportesDeDatosDeMediciones } from "@/db/consultas/indicadores/datos-soporte";
import { loToman } from "@/db/consultas/indicadores/componentes";
import { desagregacionDelAnio, obtenerIndicador, resultadosDelAnio } from "@/db/consultas/indicadores/lectura";
import { obtenerParametros } from "@/db/consultas/indicadores/maestros";
import { observacionesDe, type ResumenDeObservaciones } from "@/db/consultas/indicadores/observaciones";
import { asegurarMedicionesConFuentes } from "@/db/consultas/indicadores/propagacion";
import { reaperturaEnTexto, type ReaperturaEnTexto } from "@/db/consultas/indicadores/reapertura";
import { soportesDeVarias } from "@/db/consultas/indicadores/soportes";
import { puedeAnalizar, puedeObservar, puedeRegistrarHistoricos } from "@/lib/alcance";
import { soportesDeDatosDeLaMedicion, type SoporteDeDatoEnPantalla } from "@/lib/indicadores/soportes";
import type { EstadoIndicador, Periodicidad } from "@/lib/indicadores/tipos";
import { cuenta } from "@/lib/plural";
import type { SesionValida } from "@/lib/sesion";
import { fechaYHora, periodoEnPalabras } from "@/lib/indicadores/ficha-en-texto";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { fechaHoraLarga, zonaHoraria } from "@/lib/zona-horaria";

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
 * «Resultados»: antes de leer se abren los periodos que hayan terminado (F14-DC12) y las constancias de envío al ente (anexo
 * 14B, §8). El rango de la gráfica (`?rango=dos`, `?rango=todo`), el análisis pedido (`?analizar=`) y el modo edición de
 * históricos (`?historicos=editar`) existen solo cuando la persona puede usarlos; si no, «no encontrada». El periodo del
 * desglose por categoría (`?desglose=`) que no es uno medido del año cae al último medido, sin decir nada.
 */
export async function datosDeResultados(
  c: ContextoDeVista,
  sp: Parametros,
  a: { anio: number; primerAnio: number; anioEnCurso: number },
): Promise<DatosDeResultados> {
  const rango = sp.rango === undefined ? "anio" : RANGOS.find((x) => x === sp.rango && x !== "anio");
  if (rango === undefined) notFound();
  const { sesion, indicador, ahora } = c;
  await asegurarMedicionesConFuentes({ indicadorId: indicador.id, ahora });
  await asegurarConstancias({ sql: obtenerSql(), ahora, indicadorId: indicador.id });
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
  // En esa misma columna, los soportes de los datos compartidos que usó cada medición (anexo 14C, §4.6): la evidencia de un
  // indicador sin variables propias son esos (§3.1).
  const soportesDeDatos = new Map<number, SoporteDeDatoEnPantalla[]>();
  if (soportes) {
    const zona = zonaHoraria();
    const periodoDeMedicion = new Map(filas.flatMap((f) => (f.medicionId === null ? [] : [[f.medicionId, f.periodo] as const])));
    for (const [medicionId, variables] of await soportesDeDatosDeMediciones(sesion, indicador.id, medidas)) {
      const deLaMedicion = soportesDeDatosDeLaMedicion(variables, periodoDeMedicion.get(medicionId) ?? "", zona);
      if (deLaMedicion.length > 0) soportesDeDatos.set(medicionId, deLaMedicion);
    }
  }
  const { puedeMedir: mide, puedeAnalizar: analiza } = vista.permisos;
  const activo = indicador.estado === "activo";
  // Lo que se reabriría con cada cerrada del año que otras mediciones cerradas usaron (anexo 14C, §3.5), a quien reabre.
  const reaperturas = new Map<number, ReaperturaEnTexto>();
  if (c.administra && activo) {
    for (const f of filas) {
      if (f.estado !== "cerrada" || f.medicionId === null || f.deOtraPeriodicidad === true) continue;
      const lista = await reaperturaEnTexto(sesion, { clase: "medicion", medicionId: f.medicionId });
      if (lista) reaperturas.set(f.medicionId, lista);
    }
  }

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

  // Los históricos del año, a quien los registra (spec §8.8): el modo edición existe si alguno sigue abierto. Los que
  // calcula el sistema (la versión que rige su periodo es automática, anexo 14B §4) no se digitan: no entran. Los de un
  // compuesto con un componente que la persona no ve tampoco: los registra quien administra (F14C-DC38, `registrarHistoricos`).
  const historicos = filas.filter((f) => f.historica && f.medicionId !== null && f.deOtraPeriodicidad !== true && !f.automatica);
  const conOculta = historicos.some((f) => f.valores.some((v) => v.oculta === true));
  const registra = activo && !conOculta && (await puedeRegistrarHistoricos(indicador.id, sesion)).puede;
  const editables: FilaHistoricaVista[] = historicos
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

  // «Por {dimensión}» (anexo 14C, §5.6), a quien ve el indicador (ya lo decidió `obtenerIndicador`), si el año tiene periodos
  // medidos por categoría o lo rige una versión desagregada: el periodo de `?desglose=` si es uno medido del año; si no, sin
  // decir nada, el último medido. Solo se lee el desglose del elegido.
  const desagregacion = await desagregacionDelAnio(obtenerSql(), indicador.id, a.anio);
  const pedido = typeof sp.desglose === "string" ? desagregacion.medidos.find((x) => x.periodo === sp.desglose) : undefined;
  const medida = pedido ?? desagregacion.medidos.at(-1);
  const elegido = medida ? await desgloseDe(obtenerSql(), medida.medicionId) : null;
  const dimension = elegido?.dimension || desagregacion.dimension;

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
    soportesDeDatos,
    cierre: {
      reabre: c.administra && activo,
      cierraDeNuevo: c.administra,
      recalcula: c.administra && activo,
      actualizaCategorias: c.administra && activo,
      historial,
      reaperturas,
    },
    desglose: dimension
      ? { dimension, periodos: desagregacion.medidos.map((x) => ({ periodo: x.periodo, etiqueta: periodoEnPalabras(x.periodo) })), elegido }
      : null,
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

/**
 * «Reportes al ente» (anexo 14B, §8): antes de leer se abren los periodos y las constancias que hayan terminado, como en
 * «Resultados» (la tarea de la constancia enlaza directo aquí). Los soportes y el historial, a quien ve los soportes; el
 * resultado del periodo de cada pendiente, que el formulario muestra antes de registrar, solo a quien puede registrar. En un
 * retirado se sigue registrando y corrigiendo lo conservado, sin adjuntar ni quitar soportes (`soportesEditables`).
 */
export async function datosDeReportes(c: ContextoDeVista, ente: EnteDeLaFicha): Promise<DatosDeReportes> {
  const { sesion, indicador, ahora } = c;
  const sql = obtenerSql();
  await asegurarMedicionesConFuentes({ indicadorId: indicador.id, ahora });
  await asegurarConstancias({ sql, ahora, indicadorId: indicador.id });
  const [constancias, soportes, historial] = await Promise.all([
    constanciasDe(sesion, indicador.id, { ahora }),
    soportesDeConstancias(sesion, indicador.id),
    historialDeConstancias(sesion, indicador.id),
  ]);
  if (!constancias) notFound();
  // El retiro no impide terminar de registrar ni corregir lo conservado; sí adjuntar o quitar soportes.
  let registro: DatosDeReportes["registro"] = null;
  if (await puedeRegistrarConstancia(indicador.id, sesion)) {
    const pendientes = constancias.filter((x) => x.estado === "pendiente");
    const leidos = await Promise.all(pendientes.map((k) => resultadoDelPeriodoExterno(sql, indicador.id, k.periodo, ahora)));
    const resultados = new Map<number, ResultadoExterno>(pendientes.map((k, i) => [k.id, leidos[i]]));
    registro = { hoy: fechaEnZona(ahora, zonaHoraria()), soportesEditables: indicador.estado === "activo", resultados };
  }
  return { codigo: indicador.codigo, ente, constancias, soportes, historial, registro };
}

/**
 * «Ficha técnica»: lo que «Aprobar» firma, si la versión está por aprobar, los datos de operación a quien los ve y, a quien
 * ve el indicador, «Lo toman»: los compuestos que toman su resultado y que la persona ve (`loToman`, anexo 14C §6.5).
 */
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
      restringidos: await restringidosQueToma(obtenerSql(), ficha.versionId, c.sesion),
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
    loToman: c.ve ? await loToman(obtenerSql(), c.sesion, indicador.id) : [],
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
