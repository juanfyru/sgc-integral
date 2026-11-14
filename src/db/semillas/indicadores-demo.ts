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
 */
import type { Sql } from "postgres";
import type { Semaforo } from "../../lib/indicadores/tipos";
import { zonaHoraria } from "../../lib/zona-horaria";
import { enTransaccion, type SesionFlujo } from "../consultas/flujo/contrato";
import { asignarSiglaASubproceso } from "../consultas/mapa-admin";
import { analizar } from "../consultas/indicadores/analisis";
import { aprobarFichas, enviarAAprobacion } from "../consultas/indicadores/aprobacion";
import { cerrarDeNuevo, cerrarMes, reabrirMedicion } from "../consultas/indicadores/cierre";
import { abrirCambio, crearIndicador, guardarBorrador } from "../consultas/indicadores/fichas";
import { registrarHistoricos } from "../consultas/indicadores/historicos";
import { guardarEnMaestro } from "../consultas/indicadores/maestros";
import { asegurarMediciones, marcarNoAplica, reportar } from "../consultas/indicadores/mediciones";
import { programarMeta } from "../consultas/indicadores/metas";
import { observar } from "../consultas/indicadores/observaciones";
import { designar, retirar } from "../consultas/indicadores/operacion";
import { momentoHace, minutosDespues, sesionDe, type ContextoDistribucion } from "./distribucion-demo";
import { agendaDeIndicadores, calendarioDeIndicadores, type FilaHistorica, type Hecho, type Quien } from "./indicadores-demo-agenda";
import { datosDeFicha, OBJETIVOS, type Catalogo, type ClaveObjetivo, type FichaDemo, type OperacionDemo } from "./indicadores-demo-fichas";
import { sembrarLoteImportado } from "./indicadores-demo-importacion";
import { FIRMA, firmaDeLaDemo } from "./vigencia-demo";

const USUARIO: Record<Quien, string> = {
  coordinadora: "coordinadora.sgc",
  gerente: "gerente",
  controlInterno: "control.interno",
  liderGth: "lider.gth",
  liderCex: "lider.cex",
  jefeUrgencias: "jefe.urgencias",
};

/** Lo que comparten los hechos: la conexión, los catálogos, las sesiones y lo que se va creando. */
type Siembra = {
  sql: Sql;
  cat: Catalogo;
  sesion: Record<Quien, SesionFlujo>;
  /** Cada indicador creado, por su código, con la versión que se le abrió de último y sus datos de operación. */
  creados: Map<string, { indicadorId: number; versionId: number; op: OperacionDemo }>;
};

export async function sembrarIndicadores(sql: Sql, c: ContextoDistribucion): Promise<void> {
  console.log("Sembrando indicadores, sus mediciones y el cierre del mes…");
  const s = await prepararSiembra(sql, c);
  for (const { momento, hecho } of agendaDeIndicadores(c.ahora, zonaHoraria())) {
    if (momento.getTime() >= c.ahora.getTime()) throw new Error(`Paso de la semilla de indicadores en el futuro: ${momento.toISOString()}`);
    await hacer(s, hecho, momento);
  }
  // Los periodos que terminaron hasta hoy, como los abre la primera lectura (spec §8.1).
  await asegurarMediciones({ sql, ahora: c.ahora });
  // El lote importado entra ayer, en el mes en curso: sus fichas aprobadas aún no tienen periodos terminados.
  const cal = calendarioDeIndicadores(c.ahora, zonaHoraria());
  await sembrarLoteImportado(sql, s.sesion.coordinadora, cal.mesEnCurso.clave, momentoHace(1, c.ahora));
  await leerAvisosResueltos(sql);
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
  };
  return { sql, cat, sesion, creados: new Map() };
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
      return;
    }
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
      await cambiarFicha(s, h.codigo, h.ficha, h.motivo, ahora);
      return;
  }
}

/**
 * Un cambio sobre la ficha vigente (spec §7.6.5): abre la versión siguiente, guarda el formulario con lo que cambia y la
 * envía. El sistema decide si es mayor (queda por aprobar) o menor (queda aprobada sin aprobador).
 */
async function cambiarFicha(s: Siembra, codigo: string, ficha: FichaDemo, motivoCambio: string, momento: Date): Promise<void> {
  const actual = creado(s, codigo);
  const coordinadora = s.sesion.coordinadora;
  const { versionId } = await abrirCambio(coordinadora, actual.indicadorId, { sql: s.sql, ahora: momento });
  const op = { ...actual.op, motivoCambio };
  await guardarBorrador(coordinadora, versionId, datosDeFicha(s.cat, ficha, op), { sql: s.sql, ahora: minutosDespues(momento, 10) });
  await enviarAAprobacion(
    coordinadora,
    { versionId, credenciales: FIRMA },
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

/** Reporta A y B y comprueba el color que deja: si la semilla se equivoca de umbral, no siembra. */
async function reportarPeriodo(
  s: Siembra,
  quien: SesionFlujo,
  codigo: string,
  clave: string,
  [a, b]: [string, string],
  esperado: Semaforo,
  momento: Date,
): Promise<void> {
  const medicionId = await medicionDe(s, codigo, clave, momento);
  const r = await reportar(quien, { medicionId, valores: { A: a, B: b }, parcial: false, confirmado: true }, { sql: s.sql, ahora: momento });
  if (!r.ok || r.semaforo !== esperado) {
    throw new Error(`${codigo} ${clave}: se esperaba ${esperado} y quedó ${r.ok ? r.semaforo : `por confirmar (${r.confirmar})`}`);
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
