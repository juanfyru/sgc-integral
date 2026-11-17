/**
 * Los indicadores de la demo (spec 14 §22, sobre la demo de la 13C): los ocho del SGC del Excel del usuario, elaborados por
 * `coordinadora.sgc` y aprobados en bloque por `gerente`, con dos trimestres históricos y el primero que se reporta; uno
 * más del SGC que se retira; el de urgencias que mide `jefe.urgencias` (rol Consulta), el restringido de talento humano
 * (lo aprueba `lider.gth`), el regulatorio de consulta externa con la Resolución 256 de 2016, uno por aprobar y el de
 * cartera en borrador; los objetivos; y, en las mediciones, «Bien», «Atención» con análisis, «Crítico» con causa, acción
 * y la marca, una sin dato, una vencida, una «no aplica», una meta programada, una observación de `control.interno` sin
 * respuesta, el cierre de un mes anterior y una medición reabierta, corregida y cerrada de nuevo.
 *
 * La historia está en `indicadores-demo-agenda.ts`, como datos y en el orden de su hora; aquí se corre hecho por hecho por
 * las funciones del dominio, con esa hora (`opciones.ahora`) y las firmas con la clave de la demo (`firmaDeLaDemo`): cada
 * versión aprobada tiene sus filas de `firmas`. La bitácora y los avisos llevan la hora de la siembra: `registrarAuditoria`
 * y `avisarA` no reciben otra. Al final, los avisos de lo que la historia ya resolvió quedan leídos.
 *
 * Desde la 14B (anexo §11), la historia trae lo que calcula el sistema (la pasada de fotos de una hora, `fotos`) y, al
 * final, `indicadores-demo-14b.ts` toma las fotos que tocan a la hora de la siembra, analiza el mes de conformidad y deja
 * las constancias de `CEX-IND-01`.
 *
 * Desde la 14C (anexo §10), la historia trae también la dimensión «Sede», el dato compartido y sus periodos, las fichas que
 * los usan, la rejilla de la desagregada y los dos compuestos. Las funciones del dominio no propagan (lo hacen las acciones):
 * después de cada hecho que cambia una fuente, aquí se abren las mediciones de las fichas con variables ajenas y se propaga a
 * esa hora (`propagarALaHora`), como lo haría la acción. Al final, `indicadores-demo-14c.ts` hace la pasada de la hora de la
 * siembra y sube el soporte del dato.
 *
 * Desde el complemento de la 14C, la historia activa además el soporte obligatorio de `CEX-ID-001` a mitad del plazo de un
 * mes (`cambiarOperacion`, `activarSoporte`): ese mes lo debe y el anterior, reportado y vencido, no.
 */
import type { Sql } from "postgres";
import type { NivelAcceso, Semaforo } from "../../lib/indicadores/tipos";
import { zonaHoraria } from "../../lib/zona-horaria";
import { enTransaccion, type SesionFlujo } from "../consultas/flujo/contrato";
import { asignarSiglaASubproceso } from "../consultas/mapa-admin";
import { analizar } from "../consultas/indicadores/analisis";
import { aprobarFichas, enviarAAprobacion } from "../consultas/indicadores/aprobacion";
import { desgloseDe } from "../consultas/indicadores/categorias";
import { cerrarDeNuevo, cerrarMes, reabrirMedicion } from "../consultas/indicadores/cierre";
import { designarResponsablesDeDato, guardarDato } from "../consultas/indicadores/datos";
import { asegurarPeriodosDeDatos, reportarDato } from "../consultas/indicadores/datos-periodos";
import { guardarCategoria, guardarDimension } from "../consultas/indicadores/dimensiones";
import { abrirCambio, crearIndicador, guardarBorrador } from "../consultas/indicadores/fichas";
import { tomarFotos } from "../consultas/indicadores/fotos";
import { registrarHistoricos } from "../consultas/indicadores/historicos";
import { guardarEnMaestro } from "../consultas/indicadores/maestros";
import { asegurarMediciones, listaDe, marcarNoAplica, reportar } from "../consultas/indicadores/mediciones";
import { programarMeta } from "../consultas/indicadores/metas";
import { observar } from "../consultas/indicadores/observaciones";
import { cambiarOperacion, designar, retirar } from "../consultas/indicadores/operacion";
import { propagar } from "../consultas/indicadores/propagacion";
import { momentoHace, minutosDespues, sesionDe, type ContextoDistribucion } from "./distribucion-demo";
import {
  agendaDeIndicadores,
  calendarioDeIndicadores,
  type FilaDeRejilla,
  type FilaHistorica,
  type Hecho,
  type Quien,
} from "./indicadores-demo-agenda";
import { exigirFoto, sembrarFinalDe14B } from "./indicadores-demo-14b";
import { sembrarFinalDe14C } from "./indicadores-demo-14c";
import {
  datosDeFicha,
  OBJETIVOS,
  type Catalogo,
  type ClaveObjetivo,
  type DatoDemo,
  type FichaDemo,
  type OperacionDemo,
} from "./indicadores-demo-fichas";
import { sembrarLoteImportado } from "./indicadores-demo-importacion";
import { FIRMA, firmaDeLaDemo } from "./vigencia-demo";

const USUARIO: Record<Quien, string> = {
  coordinadora: "coordinadora.sgc",
  gerente: "gerente",
  controlInterno: "control.interno",
  liderGth: "lider.gth",
  liderCex: "lider.cex",
  jefeUrgencias: "jefe.urgencias",
  consulta: "consulta",
};

/** Lo que comparten los hechos: la conexión, los catálogos, las sesiones y lo que se va creando. */
type Siembra = {
  sql: Sql;
  cat: Catalogo;
  sesion: Record<Quien, SesionFlujo>;
  /** Cada indicador creado, por su código, con la versión que se le abrió de último y sus datos de operación. */
  creados: Map<string, { indicadorId: number; versionId: number; op: OperacionDemo }>;
  /** Los maestros de la 14C ya creados, por su nombre. */
  datos: Map<string, number>;
  dimensiones: Map<string, number>;
  /** Los indicadores con alguna variable ajena (un dato compartido o un componente): los que reciben la propagación. */
  conFuentes: Set<number>;
};

/** Los hechos después de los cuales una acción propagaría: cambian un dato, un resultado, una meta o lo que rige. */
const CAMBIAN_UNA_FUENTE: ReadonlySet<Hecho["tipo"]> = new Set([
  "aprobar",
  "cambiar",
  "historicos",
  "meta",
  "reportar",
  "rejilla",
  "reportarDato",
  "noAplica",
  "reabrir",
  "cerrarDeNuevo",
  "fotos",
]);

export async function sembrarIndicadores(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando indicadores, sus mediciones y el cierre del mes…");
  const s = await prepararSiembra(sql, c);
  for (const { momento, hecho } of agendaDeIndicadores(c.ahora, zonaHoraria())) {
    if (momento.getTime() >= c.ahora.getTime()) throw new Error(`Paso de la semilla de indicadores en el futuro: ${momento.toISOString()}`);
    await hacer(s, hecho, momento);
    if (CAMBIAN_UNA_FUENTE.has(hecho.tipo)) await propagarALaHora(s, momento);
  }
  // Los periodos que terminaron hasta hoy, como los abre la primera lectura (spec §8.1).
  await asegurarMediciones({ sql, ahora: c.ahora });
  // El lote importado entra ayer, en el mes en curso: sus fichas aprobadas aún no tienen periodos terminados.
  const cal = calendarioDeIndicadores(c.ahora, zonaHoraria());
  await sembrarLoteImportado(sql, s.sesion.coordinadora, cal.mesEnCurso.clave, momentoHace(1, c.ahora));
  await sembrarFinalDe14B(sql, { coordinadora: s.sesion.coordinadora, liderCex: s.sesion.liderCex }, c.ahora);
  await sembrarFinalDe14C(sql, { consulta: s.sesion.consulta }, c.ahora);
  await leerAvisosResueltos(sql);
}

/**
 * Lo que haría la acción después de un hecho que cambia una fuente (anexo 14C, §3.3): abre las mediciones terminadas de los
 * indicadores con variables ajenas, como al leer su página, y les propaga a esa hora. Una propagación que falla detiene la
 * semilla: `propagar` la registra y la salta, y la demo no debe seguir sin ella.
 */
async function propagarALaHora(s: Siembra, ahora: Date): Promise<void> {
  if (s.conFuentes.size === 0) return;
  const indicadorIds = [...s.conFuentes];
  await asegurarMediciones({ sql: s.sql, ahora, indicadorIds });
  const r = await propagar({ sql: s.sql, ahora, indicadorIds });
  if (r.fallidas > 0) throw new Error(`La propagación de las ${ahora.toISOString()} falló en ${r.fallidas} mediciones`);
}

/**
 * Los avisos que la historia sembrada ya resolvió quedan leídos, para que no tapen los que importan en el recorrido: las
 * fichas aprobadas, las designaciones, el retiro y los «por aprobar» de las fichas que ya no lo están. Siguen sin leer
 * las alertas, la observación, la reapertura y el «por aprobar» de la ficha que sigue esperando. La marca de lectura no
 * se audita (F12-D35).
 */
async function leerAvisosResueltos(sql: Sql): Promise<void> {
  await sql`UPDATE notificaciones n SET leida_en = now()
    WHERE n.leida_en IS NULL
      AND (n.tipo IN ('indicadores.aprobada', 'indicadores.designacion', 'indicadores.retirado')
        OR (n.tipo = 'indicadores.por_aprobar' AND n.entidad = 'indicador' AND NOT EXISTS (
          SELECT 1 FROM indicador_versiones v WHERE v.indicador_id = n.entidad_id AND v.estado = 'por_aprobar')))`;
}

async function prepararSiembra(sql: Sql, c: ContextoDistribucion): Promise<Siembra> {
  const sesion = {} as Record<Quien, SesionFlujo>;
  for (const [quien, usuario] of Object.entries(USUARIO) as [Quien, string][]) sesion[quien] = await sesionDe(sql, usuario);
  const porNombre = async (tabla: "tipos_indicador" | "clasificaciones_indicador" | "unidades_indicador" | "cargos") =>
    new Map((await sql`SELECT id, nombre FROM ${sql(tabla)}`).map((f) => [f.nombre as string, Number(f.id)]));
  const [tipos, clasificaciones, unidades, cargos] = await Promise.all([
    porNombre("tipos_indicador"),
    porNombre("clasificaciones_indicador"),
    porNombre("unidades_indicador"),
    porNombre("cargos"),
  ]);
  const subprocesos = new Map(
    (await sql`SELECT s.id, p.sigla, s.slug FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id`).map((f) => [
      `${f.sigla}/${f.slug}`,
      Number(f.id),
    ]),
  );
  const normas = new Map(
    (await sql`SELECT n.id, concat_ws(' ', tn.nombre, n.numero, 'de', n.anio::text) AS nombre FROM normas n
      JOIN tipos_norma tn ON tn.id = n.tipo_norma_id`).map((f) => [f.nombre as string, Number(f.id)]),
  );

  // Los objetivos van antes que las fichas que los citan.
  const objetivos = new Map<ClaveObjetivo, number>();
  for (const o of OBJETIVOS) {
    const { id } = await guardarEnMaestro(sesion.coordinadora, "objetivos", { clase: o.clase, enunciado: o.enunciado }, { sql });
    objetivos.set(o.clave, id);
  }

  // La sigla del subproceso «Gestión Contable»: da el código `CNT-ID-001` de la ficha de los rangos (spec 14A §6).
  const [contable] = await sql`SELECT id FROM subprocesos WHERE nombre = 'Gestión Contable'`;
  if (!contable) throw new Error("La demo no trae el subproceso Gestión Contable");
  await enTransaccion(sql, (tx) => asignarSiglaASubproceso(tx, Number(contable.id), "CNT", sesion.coordinadora.usuarioId));

  const exigir = (mapa: ReadonlyMap<string, number>, clave: string, que: string) => {
    const id = mapa.get(clave);
    if (id === undefined) throw new Error(`${que} de la demo no encontrado: ${clave}`);
    return id;
  };
  const procesos = new Map(Object.entries(c.procesoPorSigla));
  const documentos = new Map(Object.entries(c.documentoPorCodigo));
  // Lo de la 14C lo va creando la historia: el catálogo lo lee cuando una ficha lo cita.
  const creados: Siembra["creados"] = new Map();
  const datos = new Map<string, number>();
  const dimensiones = new Map<string, number>();
  const cat: Catalogo = {
    proceso: (sigla) => exigir(procesos, sigla, "Proceso"),
    subproceso: (sigla, slug) => exigir(subprocesos, `${sigla}/${slug}`, "Subproceso"),
    tipo: (nombre) => exigir(tipos, nombre, "Tipo de indicador"),
    clasificacion: (nombre) => exigir(clasificaciones, nombre, "Clasificación"),
    unidad: (nombre) => exigir(unidades, nombre, "Unidad"),
    cargo: (nombre) => exigir(cargos, nombre, "Cargo"),
    norma: (nombre) => exigir(normas, nombre, "Norma"),
    documento: (codigo) => exigir(documentos, codigo, "Documento"),
    objetivo: (clave) => objetivos.get(clave)!,
    dato: (nombre) => exigir(datos, nombre, "Dato compartido"),
    dimension: (nombre) => exigir(dimensiones, nombre, "Dimensión"),
    indicador: (codigo) => {
      const i = creados.get(codigo);
      if (!i) throw new Error(`Indicador de la demo aún no creado: ${codigo}`);
      return i.indicadorId;
    },
  };
  return { sql, cat, sesion, creados, datos, dimensiones, conFuentes: new Set() };
}

// ── Cada hecho, por las funciones del dominio ───────────────────────────────────────────────────────────────────────

function creado(s: Siembra, codigo: string) {
  const c = s.creados.get(codigo);
  if (!c) throw new Error(`La semilla aún no creó ${codigo}`);
  return c;
}

async function hacer(s: Siembra, h: Hecho, ahora: Date): Promise<void> {
  const opciones = { sql: s.sql, ahora };
  const conFirma = { ...opciones, verificar: firmaDeLaDemo };
  const coordinadora = s.sesion.coordinadora;
  switch (h.tipo) {
    case "crear": {
      const personas = h.responsable ? [s.sesion[h.responsable].usuarioId] : [];
      const op: OperacionDemo = { inicio: h.inicio, mide: personas, analiza: personas };
      const { indicadorId, versionId } = await crearIndicador(coordinadora, datosDeFicha(s.cat, h.ficha, op), opciones);
      s.creados.set(h.ficha.codigo, { indicadorId, versionId, op });
      if ("variables" in h.ficha && h.ficha.variables.some((v) => v.origen !== "propia")) s.conFuentes.add(indicadorId);
      return;
    }
    case "dimension": {
      const { id } = await guardarDimension(coordinadora, { nombre: h.nombre }, opciones);
      for (const nombre of h.categorias) await guardarCategoria(coordinadora, { dimensionId: id, nombre }, opciones);
      s.dimensiones.set(h.nombre, id);
      return;
    }
    case "dato":
      await crearDato(s, h.dato, h.responsables, ahora);
      return;
    case "reportarDato":
      await reportarElDato(s, s.sesion[h.quien], h.dato, h.periodo, h.valor, ahora);
      return;
    case "rejilla":
      await reportarRejilla(s, s.sesion[h.quien], h, ahora);
      return;
    case "enviar":
      await enviarAAprobacion(coordinadora, { versionId: creado(s, h.codigo).versionId, credenciales: FIRMA }, conFirma);
      return;
    case "aprobar":
      await aprobarFichas(s.sesion[h.quien], { versionIds: h.codigos.map((c) => creado(s, c).versionId), credenciales: FIRMA }, conFirma);
      return;
    case "seguimiento":
      await designar(
        coordinadora,
        { indicadorId: creado(s, h.codigo).indicadorId, funcion: "seguimiento", usuarioIds: [s.sesion[h.quien].usuarioId] },
        opciones,
      );
      return;
    case "historicos":
      await registrarHistoricosDe(s, h.codigo, h.filas, ahora);
      return;
    case "meta":
      await programarMeta(coordinadora, { indicadorId: creado(s, h.codigo).indicadorId, periodo: h.periodo, meta: h.meta }, opciones);
      return;
    case "reportar":
      await reportarPeriodo(s, s.sesion[h.quien], h.codigo, h.periodo, h.valores, h.esperado, ahora);
      return;
    case "noAplica":
      await marcarNoAplica(s.sesion[h.quien], { medicionId: await medicionDe(s, h.codigo, h.periodo, ahora), motivo: h.motivo }, opciones);
      return;
    case "analizar":
      await analizar(s.sesion[h.quien], { medicionId: await medicionDe(s, h.codigo, h.periodo, ahora), ...h.textos }, opciones);
      return;
    case "observar":
      await observar(s.sesion[h.quien], { medicionId: await medicionDe(s, h.codigo, h.periodo, ahora), texto: h.texto }, opciones);
      return;
    case "retirar":
      await retirar(coordinadora, { indicadorId: creado(s, h.codigo).indicadorId, motivo: h.motivo }, opciones);
      return;
    case "cerrarMes":
      await cerrarMes(coordinadora, h.mes, opciones);
      return;
    case "reabrir":
      await reabrirMedicion(coordinadora, { medicionId: await medicionDe(s, h.codigo, h.periodo, ahora), justificacion: h.justificacion }, opciones);
      return;
    case "cerrarDeNuevo":
      await cerrarDeNuevo(coordinadora, await medicionDe(s, h.codigo, h.periodo, ahora), opciones);
      return;
    case "cambiar":
      await cambiarFicha(s, h.codigo, h.ficha, h.motivo, ahora, h.rigeDesde);
      return;
    case "fotos":
      await fotosDeLaPasada(s, h.esperado, ahora);
      return;
    case "soporte":
      await activarSoporte(s, h, ahora);
      return;
  }
}

/**
 * La coordinadora activa «Pedir un soporte (archivo) con cada reporte» en los datos de operación (complemento de la 14C, §4),
 * con el plazo, el inicio de medición y el nivel de acceso como están, y se comprueba la marca que deja en las mediciones en
 * curso (`debe_soporte`): si la de `debe` no lo debe o la de `noDebe` sí, la semilla no sigue.
 */
async function activarSoporte(s: Siembra, h: Extract<Hecho, { tipo: "soporte" }>, ahora: Date): Promise<void> {
  const { indicadorId } = creado(s, h.codigo);
  const [i] = await s.sql`SELECT plazo_reporte_dias, inicio_medicion, nivel_acceso FROM indicadores WHERE id = ${indicadorId}`;
  await cambiarOperacion(
    s.sesion.coordinadora,
    {
      indicadorId,
      plazoReporteDias: Number(i.plazo_reporte_dias),
      inicioMedicion: i.inicio_medicion as string,
      soporteObligatorio: true,
      nivelAcceso: i.nivel_acceso as NivelAcceso,
    },
    { sql: s.sql, ahora },
  );
  const marcas = new Map(
    (await s.sql`SELECT periodo, debe_soporte FROM mediciones WHERE indicador_id = ${indicadorId}`).map((m) => [m.periodo as string, m.debe_soporte as boolean]),
  );
  if (marcas.get(h.debe) !== true || marcas.get(h.noDebe) !== false) {
    throw new Error(`${h.codigo}: al activar el soporte, ${h.debe} debía deberlo y ${h.noDebe} no`);
  }
}

/**
 * La pasada de esa hora toma las fotos que tocan (anexo 14B, §5.4) de las mediciones abiertas, y se comprueba el color de
 * las esperadas: `tomarFotos` registra y salta la que falla, y la semilla no debe seguir sin ella. Los periodos de las
 * esperadas se abren antes, como al leer su página; los demás, no: el mes de conformidad debe fotografiarse a la hora de
 * la siembra, con las dos verificaciones ya cerradas (`indicadores-demo-14b.ts`).
 */
async function fotosDeLaPasada(s: Siembra, esperado: { codigo: string; periodo: string; semaforo: Semaforo }[], ahora: Date): Promise<void> {
  for (const e of esperado) await asegurarMediciones({ sql: s.sql, ahora, indicadorId: creado(s, e.codigo).indicadorId });
  await tomarFotos({ sql: s.sql, ahora });
  for (const e of esperado) await exigirFoto(s.sql, { ...e, indicadorId: creado(s, e.codigo).indicadorId });
}

/**
 * Un cambio sobre la ficha vigente (spec §7.6.5): abre la versión siguiente, guarda el formulario con lo que cambia y la
 * envía. El sistema decide si es mayor (queda por aprobar, y rige desde `rigeDesde` o desde el periodo por omisión) o
 * menor (queda aprobada sin aprobador).
 */
async function cambiarFicha(s: Siembra, codigo: string, ficha: FichaDemo, motivoCambio: string, momento: Date, rigeDesde?: string): Promise<void> {
  const actual = creado(s, codigo);
  const coordinadora = s.sesion.coordinadora;
  const { versionId } = await abrirCambio(coordinadora, actual.indicadorId, { sql: s.sql, ahora: momento });
  const op = { ...actual.op, motivoCambio };
  await guardarBorrador(coordinadora, versionId, datosDeFicha(s.cat, ficha, op), { sql: s.sql, ahora: minutosDespues(momento, 10) });
  await enviarAAprobacion(
    coordinadora,
    { versionId, credenciales: FIRMA, ...(rigeDesde ? { rigeDesde } : {}) },
    { sql: s.sql, ahora: minutosDespues(momento, 30), verificar: firmaDeLaDemo },
  );
  s.creados.set(codigo, { ...actual, versionId, op });
}

/** La medición del periodo, abierta como la abriría la lectura de ese momento. */
async function medicionDe(s: Siembra, codigo: string, clave: string, momento: Date): Promise<number> {
  const { indicadorId } = creado(s, codigo);
  await asegurarMediciones({ sql: s.sql, ahora: momento, indicadorId });
  const [m] = await s.sql`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${clave}`;
  if (!m) throw new Error(`${codigo} no tiene medición de ${clave}`);
  return Number(m.id);
}

/**
 * Reporta A y B (o, en un mixto, solo lo propio) y comprueba el color que deja, o que queda en «Falta un dato»: si la
 * semilla se equivoca de umbral o de hora, no siembra.
 */
async function reportarPeriodo(
  s: Siembra,
  quien: SesionFlujo,
  codigo: string,
  clave: string,
  valores: [string, string] | Record<string, string>,
  esperado: Semaforo | "falta_dato",
  momento: Date,
): Promise<void> {
  const medicionId = await medicionDe(s, codigo, clave, momento);
  const porLetra = Array.isArray(valores) ? { A: valores[0], B: valores[1] } : valores;
  const r = await reportar(quien, { medicionId, valores: porLetra, parcial: false, confirmado: true }, { sql: s.sql, ahora: momento });
  const quedo = r.ok ? (r.faltaDato && r.semaforo === null ? "falta_dato" : r.semaforo) : null;
  if (quedo !== esperado) {
    throw new Error(`${codigo} ${clave}: se esperaba ${esperado} y quedó ${r.ok ? quedo : `por confirmar (${r.confirmar})`}`);
  }
}

/** La coordinadora crea el dato compartido y designa a quienes responden por él, a la hora del paso. */
async function crearDato(s: Siembra, d: DatoDemo, responsables: Quien[], ahora: Date): Promise<void> {
  const opciones = { sql: s.sql, ahora };
  const { id } = await guardarDato(
    s.sesion.coordinadora,
    {
      procesoId: s.cat.proceso(d.proceso),
      nombre: d.nombre,
      descripcion: d.descripcion,
      fuente: d.fuente,
      unidad: d.unidad,
      periodicidad: d.periodicidad,
      consolidacion: d.consolidacion,
      admiteNegativos: false,
      plazoReporteDias: d.plazoReporteDias,
    },
    opciones,
  );
  await designarResponsablesDeDato(s.sesion.coordinadora, { datoId: id, usuarioIds: responsables.map((q) => s.sesion[q].usuarioId) }, opciones);
  s.datos.set(d.nombre, id);
}

/**
 * Reporta (o corrige) un periodo del dato, abierto como lo abriría su página a esa hora (`asegurarPeriodosDeDatos`): un
 * periodo se pide desde que alguien lo abre, y no nace vencido.
 */
async function reportarElDato(s: Siembra, quien: SesionFlujo, nombre: string, clave: string, valor: string, ahora: Date): Promise<void> {
  const datoId = s.cat.dato(nombre);
  await asegurarPeriodosDeDatos({ sql: s.sql, ahora, datoIds: [datoId] });
  const [p] = await s.sql`SELECT id FROM variable_valores WHERE variable_id = ${datoId} AND periodo = ${clave}`;
  if (!p) throw new Error(`El dato «${nombre}» no tiene periodo ${clave}`);
  const r = await reportarDato(quien, { periodoId: Number(p.id), valor, confirmado: true }, { sql: s.sql, ahora });
  if (!r.ok) throw new Error(`El dato «${nombre}» ${clave} quedó por confirmar: ${r.confirmar}`);
}

/**
 * Reporta un desagregado por su rejilla (anexo 14C, §5.4), con cada categoría por su nombre en la lista de la medición, y
 * comprueba el color del total y las categorías que quedan en Crítico.
 */
async function reportarRejilla(
  s: Siembra,
  quien: SesionFlujo,
  h: { codigo: string; periodo: string; filas: FilaDeRejilla[]; esperado: Semaforo; enCritico: string[] },
  ahora: Date,
): Promise<void> {
  const medicionId = await medicionDe(s, h.codigo, h.periodo, ahora);
  const [m] = await s.sql`SELECT * FROM mediciones WHERE id = ${medicionId}`;
  const lista = listaDe(m) ?? [];
  const filas = h.filas.map((f) => {
    const categoria = lista.find((c) => c.nombre === f.categoria);
    if (!categoria) throw new Error(`${h.codigo} ${h.periodo}: la lista no trae la categoría ${f.categoria}`);
    return "noAplica" in f
      ? { categoriaId: categoria.id, valores: {}, noAplica: f.noAplica }
      : { categoriaId: categoria.id, valores: { A: f.valores[0], B: f.valores[1] } };
  });
  const r = await reportar(quien, { medicionId, valores: {}, parcial: false, confirmado: true, filas }, { sql: s.sql, ahora });
  const desglose = await desgloseDe(s.sql, medicionId);
  if (!r.ok || r.semaforo !== h.esperado || JSON.stringify(desglose?.enCritico) !== JSON.stringify(h.enCritico)) {
    throw new Error(`${h.codigo} ${h.periodo}: se esperaba ${h.esperado} con ${h.enCritico.join(", ") || "ninguna"} en Crítico`);
  }
}

/** La coordinadora registra los históricos en la tabla del año (spec §8.8) y se comprueba el color de cada uno. */
async function registrarHistoricosDe(s: Siembra, codigo: string, filas: FilaHistorica[], momento: Date): Promise<void> {
  const { indicadorId } = creado(s, codigo);
  const { registrados } = await registrarHistoricos(
    s.sesion.coordinadora,
    { indicadorId, filas: filas.map(([clave, A, B]) => ({ periodo: clave, valores: { A, B } })) },
    { sql: s.sql, ahora: momento },
  );
  const quedaron = await s.sql`SELECT periodo, semaforo FROM mediciones
    WHERE indicador_id = ${indicadorId} AND historica AND periodo IN ${s.sql(filas.map(([clave]) => clave))}`;
  for (const [clave, , , esperado] of filas) {
    const m = quedaron.find((f) => f.periodo === clave);
    if (registrados !== filas.length || m?.semaforo !== esperado) throw new Error(`${codigo} ${clave}: el histórico no quedó en ${esperado}`);
  }
}
