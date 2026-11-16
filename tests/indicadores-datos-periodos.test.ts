/**
 * Los periodos de un dato compartido (anexo 14C, §4.3 y §4.4; Tarea 10 de la 14C): se abren solos cuando un indicador
 * activo los necesita (la versión que rige un periodo ordinario y sin cerrar del indicador cita el dato), no nacen vencidos,
 * se quitan los pendientes que ya nadie necesita, y su responsable los reporta y los corrige antes del cierre, con su tarea
 * en «Mis tareas». Contra la BD de desarrollo, dentro de una transacción que se revierte.
 *
 * El dato de casi todos los casos es «Total facturado en el mes», mensual, con plazo de 10 días, de un proceso que solo
 * existe en la transacción (sin líderes) y con un responsable de rol «consulta».
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { asegurarPeriodosDeDatos, historialDeDato, periodosDeDato, reportarDato } from "@/db/consultas/indicadores/datos-periodos";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { fechaLimiteDeReporte } from "@/lib/indicadores/periodos";
import { ErrorIndicador, SIN_RESPONSABLE } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { agruparTareas, type Tarea } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { datoDePrueba, dimensionDePrueba, indicadorDePrueba, periodoDeDatoDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const NOMBRE = "Total facturado en el mes";
const CERRADO = "El periodo está cerrado: lo reabre el Administrador del SGC";
const NOVIEMBRE = new Date("2026-11-10T15:00:00Z");
const DIC_5 = new Date("2026-12-05T15:00:00Z");
const NOV_20 = new Date("2026-11-20T15:00:00Z");
const DIC_2025 = new Date("2025-12-15T15:00:00Z");

/** Un proceso que solo existe en la transacción: sin líderes, salvo los que la prueba le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

/** El dato de la cabecera con su responsable; `o` cambia lo que haga falta del dato. */
async function entorno(tx: TransactionSql, o: Partial<Parameters<typeof datoDePrueba>[1]> = {}) {
  const procesoId = await procesoNuevo(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const datoId = await datoDePrueba(tx, { procesoId, nombre: NOMBRE, responsables: [responsable.usuarioId], ...o });
  return { procesoId, responsable, datoId };
}

const asegurar = (tx: TransactionSql, datoId: number, ahora: Date) => asegurarPeriodosDeDatos({ sql: tx, ahora, datoIds: [datoId] });

type Fila = {
  id: number;
  periodo: string;
  estado: string;
  vence_en: Date;
  valor: string | null;
  por_categoria: unknown;
  categorias: unknown;
  corregido: boolean;
};

const periodos = async (tx: TransactionSql, datoId: number): Promise<Fila[]> =>
  (await tx`SELECT id, periodo, estado, vence_en, valor, por_categoria, categorias, corregido FROM variable_valores
    WHERE variable_id = ${datoId} ORDER BY desde`).map((f) => ({ ...(f as unknown as Fila), id: Number(f.id) }));

const claves = async (tx: TransactionSql, datoId: number) => (await periodos(tx, datoId)).map((f) => f.periodo);

const eventos = async (tx: TransactionSql, periodoId: number) =>
  (await tx`SELECT tipo, usuario_id, detalle FROM variable_eventos WHERE valor_id = ${periodoId} ORDER BY id`).map((e) => ({
    tipo: e.tipo as string,
    usuarioId: e.usuario_id === null ? null : Number(e.usuario_id),
    detalle: e.detalle as Record<string, unknown>,
  }));

const bitacora = async (tx: TransactionSql, datoId: number) =>
  (await tx`SELECT accion, usuario_id, detalle FROM auditoria WHERE entidad = 'dato_compartido' AND entidad_id = ${datoId}
    AND accion IN ('dato_reportado', 'dato_corregido') ORDER BY id`).map((f) => ({
    accion: f.accion as string,
    usuarioId: Number(f.usuario_id),
    detalle: f.detalle as Record<string, unknown>,
  }));

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, periodoId: number, d: Omit<Parameters<typeof reportarDato>[1], "periodoId">, ahora = NOV_20) =>
  reportarDato(sesion, { periodoId, ...d }, { sql: tx, ahora });

async function rechaza(promesa: Promise<unknown>, tipo: typeof ErrorIndicador | typeof ErrorPermiso, mensaje?: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(tipo);
  if (mensaje !== undefined) expect((err as Error).message).toBe(mensaje);
}

/** Retira el indicador como lo deja `retirar`: con quién, cuándo y por qué. */
async function retirar(tx: TransactionSql, indicadorId: number): Promise<void> {
  const admin = await sesionAdmin(tx);
  await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${admin.usuarioId}, baja_en = ${NOV_20}, baja_motivo = 'Ya no se mide'
    WHERE id = ${indicadorId}`;
}

/** Una versión nueva aprobada (cambio mayor mensual, «porcentaje») que rige desde `rigeDesde`: A propia y B, el dato si se da. */
async function cambioMayor(
  tx: TransactionSql,
  d: { indicadorId: number; usuarioId: number; rigeDesde: string; aprobadaEn: Date; datoId: number | null },
): Promise<void> {
  const [n] = await tx`SELECT max(numero)::int + 1 AS n FROM indicador_versiones WHERE indicador_id = ${d.indicadorId}`;
  const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
      tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
    VALUES (${d.indicadorId}, ${n.n}, 'borrador', 'mayor', 'Cambio de prueba', 'porcentaje', 'A / B * 100', 'mensual', 'ascendente', 90,
      'relativo', 70, ' %', 1, ${d.usuarioId}) RETURNING id`;
  await tx`SELECT id FROM indicador_versiones WHERE id = ${v.id} FOR UPDATE`;
  await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v.id}, 'A', 'Valor glosado en el mes', 1)`;
  if (d.datoId === null) {
    await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${v.id}, 'B', 'Casos evaluados', 2)`;
  } else {
    await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden, origen, variable_compartida_id, dato_periodicidad)
      SELECT ${v.id}, 'B', nombre, 2, 'compartida', id, periodicidad FROM variables_compartidas WHERE id = ${d.datoId}`;
  }
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${d.usuarioId}, huella = ${"3".repeat(64)},
      rige_desde = ${d.rigeDesde}, aprobada_por = ${d.usuarioId}, aprobada_en = ${d.aprobadaEn}
    WHERE id = ${v.id}`;
}

describe("qué periodos del dato se abren (asegurarPeriodosDeDatos)", () => {
  it("un mixto mensual aprobado en noviembre: terminado noviembre, se abre 2026-11 y ningún otro", () =>
    revertida(sql, async (tx) => {
      const zona = zonaHoraria();
      const { procesoId, datoId } = await entorno(tx);
      const ind = await indicadorDePrueba(tx, { procesoId, aprobadaEn: NOVIEMBRE, variables: { B: { datoId } } });
      await asegurarMediciones({ sql: tx, ahora: DIC_5, indicadorId: ind.id });

      expect(await asegurar(tx, datoId, DIC_5)).toEqual({ abiertos: 1, quitados: 0 });
      const [noviembre] = await periodos(tx, datoId);
      expect(await claves(tx, datoId)).toEqual(["2026-11"]);
      expect(noviembre.estado).toBe("pendiente");
      expect(noviembre.categorias).toBeNull();
      expect(noviembre.vence_en).toEqual(fechaLimiteDeReporte(periodoDe("2026-11", zona)!, 10, zona));
      // Idempotente.
      expect(await asegurar(tx, datoId, DIC_5)).toEqual({ abiertos: 0, quitados: 0 });
    }));

  it("un anual aprobado en noviembre pide los meses terminados del año, ninguno vencido", () =>
    revertida(sql, async (tx) => {
      const zona = zonaHoraria();
      const { procesoId, datoId } = await entorno(tx);
      await indicadorDePrueba(tx, { procesoId, periodicidad: "anual", aprobadaEn: NOVIEMBRE, variables: { B: { datoId } } });

      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 10, quitados: 0 });
      const filas = await periodos(tx, datoId);
      expect(filas.map((f) => f.periodo)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((m) => `2026-${m}`));
      for (const f of filas) {
        expect(f.vence_en.getTime()).toBeGreaterThan(NOV_20.getTime());
        // Ya había pasado su fecha: cuenta el plazo desde que empezó a pedirse.
        expect(f.vence_en).toEqual(fechaLimite(NOV_20, 10, zona));
      }
    }));

  it("un cambio mayor que añade el dato y rige desde septiembre pide septiembre y octubre", () =>
    revertida(sql, async (tx) => {
      const { procesoId, datoId } = await entorno(tx);
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId, aprobadaEn: DIC_2025 });
      await asegurarMediciones({ sql: tx, ahora: NOV_20, indicadorId: ind.id });
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 0, quitados: 0 });

      await cambioMayor(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-09", aprobadaEn: NOV_20, datoId });
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 2, quitados: 0 });
      expect(await claves(tx, datoId)).toEqual(["2026-09", "2026-10"]);
    }));

  it("un periodo histórico del indicador no abre periodos del dato; un indicador retirado, tampoco", () =>
    revertida(sql, async (tx) => {
      const { procesoId, datoId } = await entorno(tx);
      // Aprobado en noviembre: enero a octubre son históricos y noviembre aún no termina.
      const nuevo = await indicadorDePrueba(tx, { procesoId, aprobadaEn: NOVIEMBRE, variables: { B: { datoId } } });
      await asegurarMediciones({ sql: tx, ahora: NOV_20, indicadorId: nuevo.id });
      expect((await tx`SELECT count(*)::int AS n FROM mediciones WHERE indicador_id = ${nuevo.id} AND historica`)[0].n).toBe(10);
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 0, quitados: 0 });

      const retirado = await indicadorDePrueba(tx, { procesoId, aprobadaEn: DIC_2025, variables: { B: { datoId } } });
      await asegurarMediciones({ sql: tx, ahora: NOV_20, indicadorId: retirado.id });
      await retirar(tx, retirado.id);
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 0, quitados: 0 });
      expect(await claves(tx, datoId)).toEqual([]);
    }));

  it("un cambio mayor que quita el dato quita el pendiente sin eventos y conserva el reportado", () =>
    revertida(sql, async (tx) => {
      const { procesoId, responsable, datoId } = await entorno(tx);
      const admin = await sesionAdmin(tx);
      const ind = await indicadorDePrueba(tx, { procesoId, aprobadaEn: DIC_2025, variables: { B: { datoId } } });
      await asegurarMediciones({ sql: tx, ahora: NOV_20, indicadorId: ind.id });
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 10, quitados: 0 });
      const septiembre = (await periodos(tx, datoId)).find((f) => f.periodo === "2026-09")!;
      await reportarCon(tx, responsable, septiembre.id, { valor: "1284300000", confirmado: true });

      await cambioMayor(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, rigeDesde: "2026-09", aprobadaEn: NOV_20, datoId: null });
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 0, quitados: 1 });
      const quedan = await periodos(tx, datoId);
      expect(quedan.map((f) => f.periodo)).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09"].map((m) => `2026-${m}`));
      expect(quedan.find((f) => f.periodo === "2026-09")!.estado).toBe("reportado");
    }));

  it("sin ningún indicador activo que lo use, los pendientes sin eventos se quitan", () =>
    revertida(sql, async (tx) => {
      const { procesoId, datoId } = await entorno(tx);
      const ind = await indicadorDePrueba(tx, { procesoId, aprobadaEn: DIC_2025, variables: { B: { datoId } } });
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 10, quitados: 0 });
      await retirar(tx, ind.id);
      expect(await asegurar(tx, datoId, NOV_20)).toEqual({ abiertos: 0, quitados: 10 });
      expect(await claves(tx, datoId)).toEqual([]);
    }));

  it("con dimensión, el periodo fija su lista de categorías (ids numéricos, en orden)", () =>
    revertida(sql, async (tx) => {
      const dimension = await dimensionDePrueba(tx, `ZZ Sedes ${unico()}`, ["Sede norte", "Sede sur"]);
      const { procesoId, datoId } = await entorno(tx, { dimensionId: dimension.id });
      const ind = await indicadorDePrueba(tx, { procesoId, aprobadaEn: NOVIEMBRE, variables: { B: { datoId } } });
      await asegurarMediciones({ sql: tx, ahora: DIC_5, indicadorId: ind.id });
      await asegurar(tx, datoId, DIC_5);

      const [noviembre] = await periodos(tx, datoId);
      expect(noviembre.categorias).toEqual([
        { id: dimension.categorias[0], nombre: "Sede norte", orden: 1, noAplica: null },
        { id: dimension.categorias[1], nombre: "Sede sur", orden: 2, noAplica: null },
      ]);
      const [usada] = await tx`SELECT ${noviembre.id}::bigint IN (
          SELECT id FROM variable_valores WHERE categorias @> jsonb_build_array(jsonb_build_object('id', ${dimension.categorias[0]}::int))
        ) AS si`;
      expect(usada.si).toBe(true);
    }));
});

describe("reportar un periodo del dato (reportarDato)", () => {
  it("el responsable reporta: queda reportado, con su evento y su entrada de bitácora", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });

      expect(await reportarCon(tx, responsable, periodoId, { valor: "1284300000" })).toEqual({ ok: true, corregido: false });
      const [p] = await tx`SELECT estado, valor, reportado_por, reportado_en, corregido FROM variable_valores WHERE id = ${periodoId}`;
      expect({ ...p, valor: Number(p.valor), reportado_por: Number(p.reportado_por) }).toEqual({
        estado: "reportado",
        valor: 1284300000,
        reportado_por: responsable.usuarioId,
        reportado_en: NOV_20,
        corregido: false,
      });
      expect(await eventos(tx, periodoId)).toEqual([{ tipo: "reporte", usuarioId: responsable.usuarioId, detalle: { valor: "1284300000" } }]);
      expect(await bitacora(tx, datoId)).toEqual([
        {
          accion: "dato_reportado",
          usuarioId: responsable.usuarioId,
          detalle: { nombre: NOMBRE, periodo: "2026-10", periodoId, valor: "1284300000" },
        },
      ]);
    }));

  it("quien no responde por el dato no lo reporta; un Admin SGC con responsable activo, tampoco", () =>
    revertida(sql, async (tx) => {
      const { datoId } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      // Para quien no ve el dato, no existe.
      await rechaza(reportarCon(tx, otro, periodoId, { valor: "1" }), ErrorIndicador, "El periodo del dato no existe");
      await rechaza(reportarCon(tx, await sesionAdmin(tx), periodoId, { valor: "1" }), ErrorPermiso);
      expect(await eventos(tx, periodoId)).toEqual([]);
    }));

  it("sin responsable ni líder activos, el Admin SGC lo reporta y el evento lo marca", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const datoId = await datoDePrueba(tx, { procesoId, nombre: NOMBRE });
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });
      const admin = await sesionAdmin(tx);

      expect(await reportarCon(tx, admin, periodoId, { valor: "5" })).toEqual({ ok: true, corregido: false });
      expect(await eventos(tx, periodoId)).toEqual([
        { tipo: "reporte", usuarioId: admin.usuarioId, detalle: { valor: "5", sinResponsable: true } },
      ]);
      expect((await bitacora(tx, datoId))[0].detalle.sinResponsable).toBe(true);
    }));

  it("corregir antes del cierre: otro valor, sin justificación, deja el antes y el después", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });
      await reportarCon(tx, responsable, periodoId, { valor: "1179850000" });

      const despues = new Date("2026-11-21T15:00:00Z");
      expect(await reportarCon(tx, responsable, periodoId, { valor: "1197850000" }, despues)).toEqual({ ok: true, corregido: true });
      const [p] = await tx`SELECT estado, valor, reportado_en, corregido FROM variable_valores WHERE id = ${periodoId}`;
      // Quien lo reportó y cuándo no cambian: quien corrigió queda en el evento.
      expect({ ...p, valor: Number(p.valor) }).toEqual({ estado: "reportado", valor: 1197850000, reportado_en: NOV_20, corregido: true });
      expect((await eventos(tx, periodoId))[1]).toEqual({
        tipo: "correccion",
        usuarioId: responsable.usuarioId,
        detalle: { antes: { valor: "1179850000" }, despues: { valor: "1197850000" } },
      });
      expect((await bitacora(tx, datoId)).map((b) => b.accion)).toEqual(["dato_reportado", "dato_corregido"]);
      expect((await bitacora(tx, datoId))[1].detalle).toEqual({
        nombre: NOMBRE,
        periodo: "2026-10",
        periodoId,
        antes: "1179850000",
        despues: "1197850000",
      });
      // El mismo valor otra vez no es una corrección.
      await rechaza(reportarCon(tx, responsable, periodoId, { valor: "1197850000,0" }), ErrorIndicador, "No hay cambios que corregir");
      expect(await eventos(tx, periodoId)).toHaveLength(2);
    }));

  it("un periodo cerrado no se reporta: lo reabre el Administrador del SGC", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", valor: "3", estado: "cerrado", ahora: NOV_20 });
      await rechaza(reportarCon(tx, responsable, periodoId, { valor: "4" }), ErrorIndicador, CERRADO);
    }));

  it("valida como una variable: negativos, límites de captura, cuatro decimales y que venga el valor", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoId } = await entorno(tx, { capturaMin: "10", capturaMax: "1000" });
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });
      const intento = (valor: string) => reportarCon(tx, responsable, periodoId, { valor });
      await rechaza(intento("-5"), ErrorIndicador, `«${NOMBRE}» no puede ser negativo`);
      await rechaza(intento("5"), ErrorIndicador, `«${NOMBRE}» no puede ser menor que 10`);
      await rechaza(intento("1001"), ErrorIndicador, `«${NOMBRE}» no puede pasar de 1000`);
      await rechaza(intento("12,34567"), ErrorIndicador, `«${NOMBRE}» admite hasta 15 cifras enteras y 4 decimales`);
      await rechaza(intento(" "), ErrorIndicador, `Falta el valor de «${NOMBRE}»`);
      expect(await eventos(tx, periodoId)).toEqual([]);
      expect(await intento("12,3456")).toEqual({ ok: true, corregido: false });
      expect(Number((await tx`SELECT valor FROM variable_valores WHERE id = ${periodoId}`)[0].valor)).toBe(12.3456);
    }));

  it("un valor que se aleja del periodo anterior más que el parámetro pide confirmación; confirmado, pasa", () =>
    revertida(sql, async (tx) => {
      await tx`UPDATE configuracion SET valor = '50' WHERE clave = 'ind_variacion_confirmar_pct'`;
      const { responsable, datoId } = await entorno(tx);
      await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-09", valor: "1000", ahora: NOV_20 });
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });

      expect(await reportarCon(tx, responsable, periodoId, { valor: "1400" })).toEqual({ ok: true, corregido: false });
      expect(await reportarCon(tx, responsable, periodoId, { valor: "2000" })).toEqual({
        ok: false,
        confirmar: "El valor sube 1000 frente a septiembre de 2026. ¿Es correcto?",
      });
      expect(Number((await tx`SELECT valor FROM variable_valores WHERE id = ${periodoId}`)[0].valor)).toBe(1400);
      expect(await reportarCon(tx, responsable, periodoId, { valor: "2000", confirmado: true })).toEqual({ ok: true, corregido: true });
    }));

  it("con dimensión exige el valor de cada categoría del periodo y guarda la suma", () =>
    revertida(sql, async (tx) => {
      const dimension = await dimensionDePrueba(tx, `ZZ Sedes ${unico()}`, ["Sede norte", "Sede sur"]);
      const [norte, sur] = dimension.categorias.map(String);
      const { responsable, datoId } = await entorno(tx, { dimensionId: dimension.id });
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });

      const [leido] = (await periodosDeDato(responsable, datoId, { sql: tx }))!;
      expect(leido.categorias!.map((c) => c.nombre)).toEqual(["Sede norte", "Sede sur"]);

      await rechaza(reportarCon(tx, responsable, periodoId, { porCategoria: { [norte]: "700" } }), ErrorIndicador, "Falta el valor de «Sede sur»");
      await rechaza(
        reportarCon(tx, responsable, periodoId, { porCategoria: { [norte]: "700", [sur]: "-1" } }),
        ErrorIndicador,
        "«Sede sur» no puede ser negativo",
      );
      // Una categoría que el periodo no pide.
      await rechaza(
        reportarCon(tx, responsable, periodoId, { porCategoria: { [norte]: "700", [sur]: "584,3", "999999": "1" } }),
        ErrorIndicador,
        "El formulario no corresponde a este periodo: recargue la página",
      );

      expect(await reportarCon(tx, responsable, periodoId, { porCategoria: { [norte]: "700", [sur]: "584,3" } })).toEqual({ ok: true, corregido: false });
      const [p] = await periodos(tx, datoId);
      expect(Number(p.valor)).toBe(1284.3);
      expect(p.por_categoria).toEqual({ [norte]: "700", [sur]: "584.3" });
      expect((await eventos(tx, periodoId))[0].detalle).toEqual({ valor: "1284.3", porCategoria: { [norte]: "700", [sur]: "584.3" } });
    }));
});

describe("lo que se lee de un dato (periodosDeDato, historialDeDato)", () => {
  it("los periodos, del más reciente al más viejo, con quién reportó; para quien no ve el dato, null", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const septiembre = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-09", ahora: NOV_20 });
      const octubre = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });
      await reportarCon(tx, responsable, septiembre, { valor: "10" });

      const leidos = (await periodosDeDato(responsable, datoId, { sql: tx }))!;
      expect(leidos.map((p) => [p.id, p.periodo, p.estado, p.valor, p.reporto, p.reportadoEn, p.corregido])).toEqual([
        [octubre, "2026-10", "pendiente", null, null, null, false],
        [septiembre, "2026-09", "reportado", "10", responsable.nombre, NOV_20, false],
      ]);
      expect(leidos[0]).toMatchObject({ datoId, porCategoria: null, categorias: null });
      expect(await periodosDeDato(await usuarioDePrueba(tx, { rol: "consulta" }), datoId, { sql: tx })).toBeNull();
    }));

  it("el historial del periodo dice qué, quién y cuándo; para quien no ve el dato, null", () =>
    revertida(sql, async (tx) => {
      const { responsable, datoId } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-10", ahora: NOV_20 });
      await reportarCon(tx, responsable, periodoId, { valor: "10" });
      const despues = new Date("2026-11-21T15:00:00Z");
      await reportarCon(tx, responsable, periodoId, { valor: "12" }, despues);

      const historial = (await historialDeDato(responsable, periodoId, { sql: tx }))!;
      expect(historial.map((e) => [e.tipo, e.quien, e.detalle])).toEqual([
        ["reporte", responsable.nombre, { valor: "10" }],
        ["correccion", responsable.nombre, { antes: { valor: "10" }, despues: { valor: "12" } }],
      ]);
      expect(historial.every((e) => e.cuando instanceof Date)).toBe(true);
      expect(await historialDeDato(await usuarioDePrueba(tx, { rol: "consulta" }), periodoId, { sql: tx })).toBeNull();
    }));
});

describe("la tarea de reportar el dato", () => {
  const deDatos = (r: { tareas: { id: string }[] }) => r.tareas.filter((t) => t.id.startsWith("dato:"));

  it("el responsable la tiene; al reportarlo desaparece; quien no responde por el dato no la tiene", () =>
    revertida(sql, async (tx) => {
      const zona = zonaHoraria();
      const { responsable, datoId } = await entorno(tx);
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-11", ahora: DIC_5 });
      const opciones = { sql: tx, ahora: DIC_5 };

      const suyas = await tareasDeIndicadores(responsable, opciones);
      expect(deDatos(suyas)).toEqual([
        {
          id: `dato:${periodoId}`,
          modulo: "indicadores",
          titulo: `Reportar el dato ${NOMBRE}, noviembre de 2026`,
          detalle: expect.stringMatching(/^Proceso Z/),
          vence: fechaLimiteDeReporte(periodoDe("2026-11", zona)!, 10, zona),
          enlace: `/indicadores/datos/${datoId}`,
        },
      ]);
      expect(suyas.vencidas).toBe(0);
      // Vencida, cuenta en la insignia.
      expect((await tareasDeIndicadores(responsable, { sql: tx, ahora: new Date("2026-12-12T15:00:00Z") })).vencidas).toBe(1);

      expect(deDatos(await tareasDeIndicadores(await usuarioDePrueba(tx, { rol: "consulta" }), opciones))).toEqual([]);
      expect(deDatos(await tareasDeIndicadores(await sesionAdmin(tx), opciones))).toEqual([]);

      await reportarCon(tx, responsable, periodoId, { valor: "1284300000" }, DIC_5);
      expect(deDatos(await tareasDeIndicadores(responsable, opciones))).toEqual([]);
    }));

  it("sin responsable, la tiene el líder del proceso dueño; sin él, el Admin SGC con «sin responsable»", () =>
    revertida(sql, async (tx) => {
      const procesoId = await procesoNuevo(tx);
      const datoId = await datoDePrueba(tx, { procesoId, nombre: NOMBRE });
      const periodoId = await periodoDeDatoDePrueba(tx, { datoId, periodo: "2026-11", ahora: DIC_5 });
      const admin = await sesionAdmin(tx);
      const opciones = { sql: tx, ahora: DIC_5 };

      const delAdmin = deDatos(await tareasDeIndicadores(admin, opciones)).find((t) => t.id === `dato:${periodoId}`);
      expect(delAdmin).toMatchObject({ detalle: SIN_RESPONSABLE });

      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [procesoId] });
      expect(deDatos(await tareasDeIndicadores(lider, opciones)).map((t) => t.id)).toEqual([`dato:${periodoId}`]);
      expect(deDatos(await tareasDeIndicadores(admin, opciones)).map((t) => t.id)).not.toContain(`dato:${periodoId}`);
    }));

  it("más de cinco se agrupan en «Datos compartidos por reportar», que lleva a la pestaña", () => {
    const vence = new Date("2026-12-10T15:00:00Z");
    const varias: Tarea[] = Array.from({ length: 6 }, (_, i) => ({
      id: `dato:${i + 1}`,
      modulo: "indicadores",
      titulo: `Reportar el dato ${NOMBRE}, noviembre de 2026`,
      detalle: null,
      vence,
      enlace: `/indicadores/datos/${i + 1}`,
    }));
    expect(agruparTareas(varias, 5, DIC_5)).toEqual([
      {
        id: "datos-por-reportar",
        modulo: "indicadores",
        titulo: "Datos compartidos por reportar",
        detalle: "El más próximo vence el 10 de diciembre de 2026",
        vence,
        enlace: "/indicadores/datos",
      },
    ]);
    expect(agruparTareas(varias.slice(0, 5), 5, DIC_5)).toHaveLength(5);
  });
});
