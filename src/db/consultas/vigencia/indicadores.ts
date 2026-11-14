/**
 * Los siete indicadores del proceso documental (spec 13C §11). Las consultas solo traen filas; el cálculo es el de las
 * funciones puras de `src/lib/indicadores-documentales/`. Los de estado (dentro del plazo, vencidos, externos al día y
 * la conformidad actual) se miden a `ahora` sobre la misma lectura filtrada del semáforo; los de flujo (aprobación,
 * acuses, etapas en plazo y la conformidad del periodo), por el periodo elegido (§11.3).
 */
import type { PendingQuery, Row } from "postgres";
import { obtenerSql, type Cliente } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { resumenAcuses } from "@/db/consultas/distribucion/acuses";
import { estadoDePuntos, historialVerificaciones } from "@/db/consultas/distribucion/verificaciones-resumen";
import {
  fichasActivasDeLosCalculos,
  fichasPorProcesoDelCalculo,
  type FichaActivaDelCalculo,
} from "@/db/consultas/indicadores/fichas-de-calculo";
import { porcentajeDeConformidad } from "@/lib/distribucion/verificacion";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, enAlcance, filtroAcceso, puedeVerIndicador, type Alcance } from "@/lib/alcance";
import {
  dentroDelPlazo,
  etapasEnPlazo,
  porcentaje,
  tiempoDeAprobacion,
  unDecimal,
  vencidosPorProceso,
  type Medicion,
} from "@/lib/indicadores-documentales/definiciones";
import {
  NOMBRE_INDICADOR,
  UNIDAD,
  cumple,
  cumplePorcentaje,
  metaDe,
  type Indicador,
  type IndicadorMedido,
  type ResultadoIndicadores,
  type VencidoIndicador,
} from "@/lib/indicadores-documentales/metas";
import { periodoActual, periodoDe } from "@/lib/indicadores-documentales/periodo";
import { textoDias } from "@/lib/indicadores-documentales/textos";
import { CALCULOS, CLAVES_DE_CALCULO, alcanceAdmitido, type AlcanceDeCalculo, type ClaveDeCalculo } from "@/lib/indicadores/calculos/registro";
import { puede } from "@/lib/permisos";
import { cuenta } from "@/lib/plural";
import { EVENTOS_SIN_CAMBIO_DE_ETAPA } from "@/lib/tramites/dia-de-etapa";
import { estadoPlazo } from "@/lib/tramites/plazos";
import { ETAPAS_ABIERTAS } from "@/lib/tramites/tipos";
import { ACCIONES } from "@/lib/tramites/transiciones";
import { zonaHoraria } from "@/lib/zona-horaria";
import { listarSemaforo, type FilaSemaforo } from "./semaforo";

const MS_DIA = 86_400_000;

/**
 * Los pasos que terminan el trámite sin avanzarlo (Ruling 66): el indicador mide el avance del trámite, no su muerte.
 * Contarlos premiaría retirar temprano y castigaría cancelar tarde.
 */
const ACCIONES_QUE_TERMINAN: readonly string[] = ["retirar", "cancelar", "rechazar", "negar_visto_bueno", "negar_eliminacion"];

/**
 * Los pasos que cierran una etapa y cuentan en «etapas del trámite cerradas en plazo»: los de `transicionar`, menos los
 * que dejan el trámite donde estaba y los que lo terminan sin avanzarlo (`ACCIONES_QUE_TERMINAN`). `transicionar`
 * (`tramites-flujo.ts`) decide en ejecución (`hacia !== previo.etapa`) si guarda `venceEn`; esta lista debe decir lo
 * mismo: una acción nueva que no cambie de etapa entra en `EVENTOS_SIN_CAMBIO_DE_ETAPA`, y una que cierre el trámite sin
 * avanzarlo, en `ACCIONES_QUE_TERMINAN`.
 */
export const ACCIONES_QUE_CIERRAN = ACCIONES.filter((a) => !EVENTOS_SIN_CAMBIO_DE_ETAPA.includes(a) && !ACCIONES_QUE_TERMINAN.includes(a));

/**
 * Los trámites de los procesos de la persona y del proceso elegido, sobre `tramites t`; el de un documento restringido
 * que no ve no se cuenta (una creación aún sin documento, sí).
 */
function condicionTramites(sql: Cliente, sesion: SesionFlujo, alcance: Alcance, procesoId: number | undefined): PendingQuery<Row[]> {
  const deAlcance = alcance.todos
    ? sql`true`
    : alcance.procesoIds.length === 0
      ? sql`false`
      : sql`t.proceso_id = ANY(${alcance.procesoIds})`;
  return sql`${deAlcance} AND ${procesoId === undefined ? sql`true` : sql`t.proceso_id = ${procesoId}`}
    AND (t.documento_id IS NULL OR EXISTS (SELECT 1 FROM documentos d WHERE d.id = t.documento_id AND ${filtroAcceso(sql, sesion)}))`;
}

type MetaDeFicha = { meta: number; ficha: { codigo: string } | null };

/** Los cálculos que gobiernan una tarjeta con ese alcance; la conformidad copia la de Distribución (`metaDeConformidad`). */
const calculosDeTarjetas = (alcance: AlcanceDeCalculo) =>
  CLAVES_DE_CALCULO.filter((k) => {
    const tarjeta = CALCULOS[k].documental;
    return tarjeta !== null && tarjeta !== "conformidad" && alcanceAdmitido(CALCULOS[k], alcance);
  });

/**
 * La meta que fija a cada tarjeta una ficha activa de su cálculo (anexo 14B, §6), por la cadena (ronda 1 de la Tarea 8):
 * con un proceso elegido, la ficha de ese proceso; si no la hay, la de la entidad; si tampoco, Configuración documental
 * (quien llama). Sin proceso, la de la entidad. Una ficha sin meta no corta la cadena. El código, solo para quien puede
 * ver la ficha que se aplica. `dentroDeLaEntidad` es la meta de la ficha de la entidad de «dentro del plazo», el eslabón
 * de las filas por proceso que no tienen ficha propia.
 */
async function metasDeFichas(
  sql: Cliente,
  sesion: SesionFlujo,
  c: { procesoId: number | undefined; ahora: Date },
): Promise<{ tarjetas: Map<Indicador, MetaDeFicha>; dentroDeLaEntidad: number | null }> {
  const [entidad, delProceso] = await Promise.all([
    fichasActivasDeLosCalculos(sql, { claves: calculosDeTarjetas("entidad"), alcance: "entidad", procesoId: null, ahora: c.ahora }),
    c.procesoId === undefined
      ? new Map<ClaveDeCalculo, FichaActivaDelCalculo>()
      : fichasActivasDeLosCalculos(sql, { claves: calculosDeTarjetas("proceso"), alcance: "proceso", procesoId: c.procesoId, ahora: c.ahora }),
  ]);
  const tarjetas = new Map<Indicador, MetaDeFicha>();
  for (const clave of calculosDeTarjetas("entidad")) {
    const ficha = [delProceso.get(clave), entidad.get(clave)].find((f) => f !== undefined && f.meta !== null);
    if (!ficha) continue;
    const visible = await puedeVerIndicador(ficha.indicadorId, sesion, { sql });
    tarjetas.set(CALCULOS[clave].documental!, { meta: Number(ficha.meta), ficha: visible ? { codigo: ficha.codigo } : null });
  }
  const dentro = entidad.get("dentro_plazo")?.meta ?? null;
  return { tarjetas, dentroDeLaEntidad: dentro === null ? null : Number(dentro) };
}

/**
 * Los indicadores que la persona puede ver (`documentos.indicadores`), en el periodo elegido; un periodo que no se
 * entiende es el actual. El líder ve solo sus procesos y los totales de ellos: un `procesoId` fuera de su alcance es
 * `null`, como la falta del permiso. Acuses y puntos de uso salen de las consultas de la 13B con la sesión, con el
 * alcance que ya aplican; los puntos de uso no se desglosan por proceso. La meta de una tarjeta es la de la ficha activa
 * de su cálculo, si la tiene (`metasDeFichas`), o la de Configuración documental.
 */
export async function indicadoresDocumentales(
  sesion: SesionFlujo,
  filtro: { periodo: string; procesoId?: number },
  opciones?: { sql?: Cliente; ahora?: Date },
): Promise<ResultadoIndicadores | null> {
  if (!puede(sesion, "documentos.indicadores")) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  const zona = zonaHoraria();
  const alcance = await alcanceProcesos(sesion, { sql });
  const { procesoId } = filtro;
  if (procesoId !== undefined && !enAlcance(alcance, procesoId)) return null;
  const periodo = periodoDe(filtro.periodo, zona) ?? periodoActual(ahora, zona);
  // Las consultas de la 13B cortan el periodo con `<`: el fin es el primer instante después de él.
  const hasta = new Date(periodo.hasta.getTime() + 1);
  const deTramites = condicionTramites(sql, sesion, alcance, procesoId);

  const [config, filas, publicados, cierres, [abiertos], acuses, puntos, verificadas, deFichas, dentroDeProcesos] = await Promise.all([
    obtenerConfigDocumental({ sql }),
    listarSemaforo(sesion, { estado: "todos", procesoId }, { sql, ahora }),
    sql`SELECT t.creado_en AS solicitado_en, t.cerrado_en AS publicado_en,
        (SELECT min(e.creado_en) FROM tramite_eventos e WHERE e.tramite_id = t.id AND e.tipo = 'aceptar') AS aceptado_en
      FROM tramites t
      WHERE t.etapa = 'publicado' AND t.cerrado_en >= ${periodo.desde} AND t.cerrado_en < ${hasta} AND ${deTramites}`,
    sql`SELECT e.creado_en, e.detalle->>'venceEn' AS vence_en
      FROM tramite_eventos e JOIN tramites t ON t.id = e.tramite_id
      WHERE e.tipo = ANY(${ACCIONES_QUE_CIERRAN}) AND e.creado_en >= ${periodo.desde} AND e.creado_en < ${hasta} AND ${deTramites}`,
    sql`SELECT count(*)::int AS n FROM tramites t WHERE t.etapa = ANY(${ETAPAS_ABIERTAS}) AND ${deTramites}`,
    resumenAcuses(sesion, { desde: periodo.desde, hasta, procesoId }, { sql }),
    estadoDePuntos(sesion, { sql, ahora }),
    historialVerificaciones(sesion, { desde: periodo.desde, hasta }, { sql, ahora }),
    metasDeFichas(sql, sesion, { procesoId, ahora }),
    fichasPorProcesoDelCalculo(sql, { clave: "dentro_plazo", ahora }),
  ]);

  const metas = { metas: config.metas, umbralConformidadPct: config.distribucion.umbralConformidadPct };
  const metaDeLaTarjeta = (clave: Indicador) => deFichas.tarjetas.get(clave)?.meta ?? metaDe(clave, metas);
  // Un porcentaje cumple con la razón exacta, no con el entero que se muestra (94,7 % no alcanza 95).
  const medir = (clave: Indicador, m: Medicion, detalle: string | null): IndicadorMedido => {
    const meta = metaDeLaTarjeta(clave);
    const veredicto = UNIDAD[clave] === "pct" ? cumplePorcentaje(clave, m, meta) : cumple(clave, m.valor, meta);
    const ficha = deFichas.tarjetas.get(clave)?.ficha ?? null;
    return { clave, nombre: NOMBRE_INDICADOR[clave], unidad: UNIDAD[clave], ...m, meta, cumple: veredicto, detalle, ficha };
  };

  // Por la fecha, como el porcentaje del semáforo: un documento en trámite sigue vencido o no por debajo.
  const vencida = (f: FilaSemaforo) => (f.proximaRevision === null ? null : estadoPlazo(f.proximaRevision, ahora, zona).estado === "vencido");
  const docs = filas.map((f) => ({ procesoId: f.proceso.id, proceso: f.proceso.nombre, sigla: f.proceso.sigla, vencida: vencida(f) }));
  const dentro = dentroDelPlazo(docs);
  const externos = dentroDelPlazo(filas.filter((f) => f.origen === "externo").map((f) => ({ vencida: vencida(f) })));
  const porProceso = vencidosPorProceso(docs);
  const vencidos: VencidoIndicador[] = filas
    .filter((f) => vencida(f) === true)
    .map((f) => ({
      documentoId: f.documentoId,
      codigo: f.codigo,
      titulo: f.titulo,
      origen: f.origen,
      procesoId: f.proceso.id,
      sigla: f.proceso.sigla,
      proceso: f.proceso.nombre,
      proximaRevision: f.proximaRevision,
      dias: f.proximaRevision === null ? null : estadoPlazo(f.proximaRevision, ahora, zona).dias,
      tramite: f.tramite?.numero ?? null,
    }))
    .sort((a, b) => (b.dias ?? 0) - (a.dias ?? 0) || a.codigo.localeCompare(b.codigo, "es"));
  const sinFechaDeRevision = dentro.sinDato > 0 ? `${cuenta(dentro.sinDato, "documento", "documentos")} sin fecha de revisión` : null;
  const vencidosEnTramite = vencidos.filter((v) => v.tramite !== null).length;

  const aprobados = publicados
    .filter((t) => t.aceptado_en !== null)
    .map((t) => ({ solicitadoEn: t.solicitado_en as Date, aceptadoEn: t.aceptado_en as Date, publicadoEn: t.publicado_en as Date }));
  const tiempo = tiempoDeAprobacion(aprobados);
  const diasSumados = unDecimal(aprobados.reduce((s, t) => s + (t.publicadoEn.getTime() - t.aceptadoEn.getTime()) / MS_DIA, 0));

  const etapas = etapasEnPlazo(
    cierres.map((e) => ({ cerradaEn: e.creado_en as Date, venceEn: e.vence_en === null ? null : new Date(e.vence_en as string) })),
  );

  const { confirmados, pendientes } = acuses.entidad;
  const verificados = puntos.puntos.filter((p) => p.ultima !== null);
  const conformidadActual = porcentaje(verificados.filter((p) => p.ultima!.conforme).length, verificados.length);
  // La del periodo se trunca como la actual (Ruling 59): la tarjeta no dice «66 %» arriba y «67 %» abajo.
  const conformesDelPeriodo = verificadas.filas.filter((v) => v.conforme).length;
  const conformidadPeriodo: Medicion = {
    valor: porcentajeDeConformidad(conformesDelPeriodo, verificadas.filas.length),
    numerador: conformesDelPeriodo,
    denominador: verificadas.filas.length,
  };

  const indicadores: IndicadorMedido[] = [
    medir("dentro_plazo", dentro, sinFechaDeRevision),
    medir(
      "aprobacion",
      { valor: tiempo.promedio, numerador: diasSumados, denominador: tiempo.n },
      tiempo.n === 0 ? null : `mediana ${textoDias(tiempo.mediana!)} · desde la solicitud: ${textoDias(tiempo.desdeSolicitud!)}`,
    ),
    medir(
      "vencidos",
      { valor: vencidos.length, numerador: vencidos.length, denominador: dentro.denominador },
      vencidosEnTramite > 0 ? `${vencidosEnTramite} en trámite` : null,
    ),
    medir(
      "acuses",
      porcentaje(confirmados, confirmados + pendientes),
      acuses.versiones.length === 0
        ? null
        : `${cuenta(acuses.versiones.length, "versión publicada", "versiones publicadas")} en el periodo`,
    ),
    // La cifra, el veredicto, el umbral y su ficha son los de la 13B (spec 13C §11.1): lo mismo que dice Distribución,
    // también con un proceso elegido (los puntos de uso no se desglosan por proceso).
    {
      ...medir("conformidad", conformidadActual, textoConformidad(conformidadPeriodo, procesoId !== undefined)),
      valor: puntos.conformidad.porcentaje,
      meta: puntos.conformidad.umbral,
      cumple: puntos.conformidad.cumple,
      ficha: puntos.conformidad.ficha === null ? null : { codigo: puntos.conformidad.ficha },
    },
    medir("externos", externos, externos.sinDato > 0 ? `${cuenta(externos.sinDato, "externo", "externos")} sin fecha de verificación` : null),
    medir("etapas", etapas, etapas.sinDato > 0 ? `${cuenta(etapas.sinDato, "etapa", "etapas")} sin dato` : null),
  ];

  // Cada fila, con la cadena de su proceso: su ficha con meta → la de la entidad → Configuración documental. Es la meta de
  // la tarjeta con ese proceso elegido. Las filas no muestran el código de ninguna ficha: no hace falta mirar si la ve.
  const dentroDeLaEntidad = deFichas.dentroDeLaEntidad ?? metaDe("dentro_plazo", metas);
  const metaDentroDe = (proceso: number) => {
    const delProceso = dentroDeProcesos.get(proceso)?.meta ?? null;
    return delProceso === null ? dentroDeLaEntidad : Number(delProceso);
  };
  return {
    periodo,
    procesoId: procesoId ?? null,
    indicadores,
    vencidosPorProceso: porProceso
      .filter((p) => p.vencidos > 0)
      .map((p) => ({ procesoId: p.procesoId, sigla: p.sigla, proceso: p.proceso, vencidos: p.vencidos })),
    dentroPorProceso: porProceso
      .map((p) => {
        const meta = metaDentroDe(p.procesoId);
        return {
          procesoId: p.procesoId,
          sigla: p.sigla,
          proceso: p.proceso,
          vigentes: p.vigentes,
          alDia: p.dentro.numerador,
          valor: p.dentro.valor,
          meta,
          cumple: cumplePorcentaje("dentro_plazo", p.dentro, meta),
          sinFecha: p.sinDato,
        };
      })
      // Lo que más falta, primero; sin dato, al final.
      .sort((a, b) => (a.valor ?? 101) - (b.valor ?? 101) || a.proceso.localeCompare(b.proceso, "es")),
    vencidos,
    tramites: { publicados: publicados.length, enCurso: Number(abiertos.n) },
    conformidadDelPeriodo: conformidadPeriodo,
  };
}

/** La conformidad del periodo junto a la actual (el valor), y la advertencia si hay un proceso elegido. */
function textoConformidad(periodo: Medicion, conProceso: boolean): string {
  const enElPeriodo =
    periodo.valor === null
      ? "en el periodo: sin verificaciones cerradas"
      : `en el periodo: ${periodo.valor} % de ${cuenta(periodo.denominador, "verificación cerrada", "verificaciones cerradas")}`;
  return conProceso ? `${enElPeriodo} · no se desglosa por proceso` : enElPeriodo;
}
