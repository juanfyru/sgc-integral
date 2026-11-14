/**
 * Las constancias de envío al ente (anexo 14B, §8; Tarea 10): «se reporta a un ente» es un estado completo, las constancias
 * nacen solo para los periodos externos que terminan después de que la ficha vigente empezó a reportarse (`ente_desde`),
 * guardan el ente y la fecha límite de cuando nacieron, se registran con su resultado congelado, se corrigen con
 * justificación y vencen, avisan y escalan como una medición. Contra la BD de desarrollo, dentro de una transacción que se
 * revierte.
 *
 * Hoy, a efectos de la prueba, es el 14 de noviembre de 2026 (las 10 de la mañana en Bogotá). Cada caso usa personas y
 * procesos nuevos y cuenta solo las constancias de los indicadores que crea.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion } from "@/db/consultas/indicadores/aprobacion";
import {
  asegurarConstancias,
  constanciasDe,
  corregirConstancia,
  puedeRegistrarConstancia,
  registrarConstancia,
  resultadoDelPeriodoExterno,
} from "@/db/consultas/indicadores/constancias";
import { constanciasVencidas } from "@/db/consultas/indicadores/constancias-vencidas";
import { abrirCambio, crearIndicador, fichaParaEditar, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import { retirar } from "@/db/consultas/indicadores/operacion";
import { alPublicarVersion } from "@/db/consultas/indicadores/publicacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import * as demo from "@/db/semillas/indicadores-demo-fichas";
import type { FichaDemo } from "@/db/semillas/indicadores-demo-fichas";
import { responsablesDeMedir } from "@/lib/alcance";
import { EsquemaFicha, type DatosFicha } from "@/lib/esquemas/indicadores";
import { enteCompleto, errorDeEnte, seReportaAlEnte } from "@/lib/indicadores/constancias";
import { ErrorIndicador, type Periodicidad } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, loteImportado, silenciarIndicadores, type OpcionesIndicadorDePrueba } from "./utiles/indicadores";
import { sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const AHORA = new Date("2026-11-14T15:00:00Z");
/** Ya terminó el cuarto trimestre de 2026. */
const ENERO = new Date("2027-01-02T15:00:00Z");
/** Terminó el tercer trimestre de 2026; su envío, con 15 días de plazo, vence el 15 de octubre. */
const OCTUBRE = new Date("2026-10-05T15:00:00Z");
const VENCE_T3 = new Date("2026-10-16T04:59:59.999Z");
const ENTE = "Superintendencia Nacional de Salud";
const SUPERSALUD = { nombre: ENTE, periodicidad: "trimestral" as const, plazoDias: 15 };
const CLAVE = { clave: "ok" };
const firmar = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA, verificar: firmaDePrueba });
const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

/** Un proceso que solo existe en la transacción: sus líderes son los que el test le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<{ id: number; nombre: string }> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id, nombre`;
  return { id: Number(p.id), nombre: p.nombre as string };
}

/** Un indicador mensual desde enero de 2026 que se reporta trimestral a la Superintendencia, con 15 días, desde el 10 de enero. */
const conEnte = (tx: TransactionSql, procesoId: number, o: OpcionesIndicadorDePrueba = {}) =>
  indicadorDePrueba(tx, {
    procesoId,
    periodicidad: "mensual",
    inicioMedicion: "2026-01",
    aprobadaEn: new Date("2026-01-10T15:00:00Z"),
    ente: SUPERSALUD,
    ...o,
  });

type FilaConstancia = { periodo: string; ente: string; estado: string; vence_en: Date };

const constanciasDeBD = async (tx: TransactionSql, indicadorId: number) =>
  (await tx`SELECT periodo, ente, estado, vence_en FROM reportes_externos WHERE indicador_id = ${indicadorId} ORDER BY hasta`) as unknown as FilaConstancia[];

const idDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM reportes_externos WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

const enteDesde = async (tx: TransactionSql, indicadorId: number) =>
  ((await tx`SELECT ente_desde FROM indicadores WHERE id = ${indicadorId}`)[0].ente_desde as Date | null) ?? null;

/** Un soporte (PDF) de la constancia, por SQL: la ruta de subida es de la Tarea 11. */
async function soporte(tx: TransactionSql, reporteId: number): Promise<void> {
  await tx`INSERT INTO archivos (contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
    VALUES ('reporte_externo', ${reporteId}, 'evidencia', ${`reportes-externos/${reporteId}/${unico()}.pdf`}, 'radicado.pdf', 'pdf',
      'application/pdf', 1024, ${"a".repeat(64)})`;
}

/**
 * Un cambio menor aprobado con el ente dado (o sin ente), publicado por `alPublicarVersion` como lo deja
 * `enviarAAprobacion`: la versión siguiente rige los mismos periodos que la vigente.
 */
async function publicarCambio(
  tx: TransactionSql,
  d: { indicadorId: number; usuarioId: number; ahora: Date; ente: { nombre: string; periodicidad: Periodicidad; plazoDias: number } | null },
): Promise<number> {
  const [vigente] = await tx`SELECT numero, rige_desde, periodicidad FROM indicador_versiones
    WHERE indicador_id = ${d.indicadorId} AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1`;
  const [v] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
      tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, ente, periodicidad_externa, plazo_externo_dias, creado_por)
    VALUES (${d.indicadorId}, ${Number(vigente.numero) + 1}, 'borrador', 'menor', 'Con el ente al día', 'porcentaje', 'A / B * 100',
      ${vigente.periodicidad}, 'ascendente', 90, 'relativo', 70, ' %', 1, ${d.ente?.nombre ?? null}, ${d.ente?.periodicidad ?? null},
      ${d.ente?.plazoDias ?? null}, ${d.usuarioId}) RETURNING id`;
  const versionId = Number(v.id);
  await tx`SELECT id FROM indicador_versiones WHERE id = ${versionId} FOR UPDATE`;
  for (const [orden, letra] of [[1, "A"], [2, "B"]] as const) {
    await tx`INSERT INTO indicador_variables (version_id, letra, nombre, orden) VALUES (${versionId}, ${letra}, ${letra}, ${orden})`;
  }
  await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${d.usuarioId}, elaborada_en = ${d.ahora},
      huella = ${"3".repeat(64)}, rige_desde = ${vigente.rige_desde}
    WHERE id = ${versionId}`;
  await tx`SELECT id FROM indicadores WHERE id = ${d.indicadorId} FOR UPDATE`;
  await alPublicarVersion(tx, { indicadorId: d.indicadorId, versionId, elaboradaPor: d.usuarioId, elaboradaEn: d.ahora, actorId: d.usuarioId, ahora: d.ahora });
  return versionId;
}

const reportarCon = (tx: TransactionSql, sesion: SesionFlujo, medicionId: number, valores: Record<string, string>) =>
  reportar(sesion, { medicionId, valores, parcial: false, confirmado: true }, { sql: tx, ahora: AHORA });

const medicionDe = async (tx: TransactionSql, indicadorId: number, periodo: string) =>
  Number((await tx`SELECT id FROM mediciones WHERE indicador_id = ${indicadorId} AND periodo = ${periodo}`)[0].id);

// ─────────────────────────────────────────────────────────────────────────────
// La ficha real: crear, enviar, aprobar y un cambio menor
// ─────────────────────────────────────────────────────────────────────────────

type Base = { admin: SesionFlujo; gerente: SesionFlujo; sgc: number; tipoId: number; estrategico: number; porcentaje: number; cargoId: number };

async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    gerente: await usuarioDePrueba(tx, { rol: "gerencia" }),
    sgc: Number(p.id),
    tipoId: Number(t.id),
    estrategico: Number(es.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

/** Una ficha manual mensual, ya probada; la aprueba Gerencia (estratégica). */
const manual = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.sgc,
  nombre: "Oportunidad en la asignación de citas",
  proposito: "Saber cuántas citas se asignan a tiempo",
  tipoId: b.tipoId,
  clasificacionId: b.estrategico,
  forma: "porcentaje",
  variables: [
    { letra: "A", nombre: "Citas asignadas a tiempo", consolidacion: "suma", admiteNegativos: false },
    { letra: "B", nombre: "Citas asignadas", consolidacion: "suma", admiteNegativos: false },
  ],
  unidadId: b.porcentaje,
  decimales: 1,
  periodicidad: "mensual",
  tendencia: "ascendente",
  meta: "90",
  semaforoModo: "rangos",
  rangos: RANGOS_90,
  cargosMedir: [b.cargoId],
  cargosAnalizar: [b.cargoId],
  normaIds: [],
  plazoReporteDias: 10,
  inicioMedicion: "2026-01",
  soporteObligatorio: false,
  nivelAcceso: "general",
  mide: [],
  analiza: [],
  prueba: { valores: { A: "9", B: "10" } },
  ...parcial,
});

/** Crea, envía y aprueba con Gerencia: la versión 1 aprobada y el indicador activo, con sus periodos abiertos. */
async function aprobada(tx: TransactionSql, b: Base, d: DatosFicha) {
  const creado = await crearIndicador(b.admin, d, { sql: tx, ahora: AHORA });
  await enviarAAprobacion(b.admin, { versionId: creado.versionId, credenciales: CLAVE }, firmar(tx));
  await aprobarFichas(b.gerente, { versionIds: [creado.versionId], credenciales: CLAVE }, firmar(tx));
  return creado;
}

/** «Editar ficha», el ente nuevo y «Publicar cambio menor». */
async function cambioMenor(tx: TransactionSql, b: Base, d: { indicadorId: number; codigo: string }, ente: Partial<DatosFicha>) {
  const { versionId } = await abrirCambio(b.admin, d.indicadorId, { sql: tx, ahora: AHORA });
  const ficha = await fichaParaEditar(b.admin, d.codigo, { sql: tx });
  await guardarBorrador(b.admin, versionId, EsquemaFicha.parse({ ...ficha!.valores, ...ente, motivoCambio: "Se reporta al ente" }), { sql: tx, ahora: AHORA });
  return enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
}

describe("cuándo nace una constancia", () => {
  it("el ente va completo y su periodicidad contiene a la de medición", () =>
    revertida(sql, async (tx) => {
      const mensual = { periodicidad: "mensual" as const };
      expect(errorDeEnte({ ...mensual, periodicidadExterna: "trimestral" })).toBe("Escriba el ente al que se reporta");
      expect(errorDeEnte({ ...mensual, plazoExternoDias: 15 })).toBe("Escriba el ente al que se reporta");
      expect(errorDeEnte({ ...mensual, ente: ENTE, plazoExternoDias: 15 })).toBe("Diga con qué periodicidad se reporta al ente");
      expect(errorDeEnte({ ...mensual, ente: ENTE, periodicidadExterna: "trimestral" })).toBe("Diga el plazo del ente en días");
      expect(errorDeEnte(mensual)).toBeNull();
      // Un mensual se puede reportar trimestral; un trimestral, no mensual, y un bimestral no cabe en un trimestre.
      expect(errorDeEnte({ ...mensual, ente: ENTE, periodicidadExterna: "trimestral", plazoExternoDias: 15 })).toBeNull();
      expect(errorDeEnte({ ...mensual, ente: ENTE, periodicidadExterna: "mensual", plazoExternoDias: 0 })).toBeNull();
      const noContiene = "La periodicidad del ente debe ser la de medición o una que la contenga";
      expect(errorDeEnte({ periodicidad: "trimestral", ente: ENTE, periodicidadExterna: "mensual", plazoExternoDias: 15 })).toBe(noContiene);
      expect(errorDeEnte({ periodicidad: "bimestral", ente: ENTE, periodicidadExterna: "trimestral", plazoExternoDias: 15 })).toBe(noContiene);
      expect(enteCompleto({ ente: ENTE, periodicidadExterna: "trimestral", plazoExternoDias: 0 })).toBe(true);
      expect(enteCompleto({ ente: ENTE, periodicidadExterna: "trimestral", plazoExternoDias: null })).toBe(false);
      expect(seReportaAlEnte({ ente: ENTE, periodicidadExterna: "mensual", plazoExternoDias: 15, periodicidad: "trimestral" })).toBe(false);
      // Las fichas de la demo pasan: el regulatorio trae su periodicidad y su plazo.
      const fichasDemo = Object.values(demo).filter((x): x is FichaDemo => typeof x === "object" && x !== null && "codigo" in x && "periodicidad" in x);
      expect(fichasDemo.filter((f) => f.ente).map((f) => f.codigo)).toEqual(["CEX-IND-01"]);
      for (const f of fichasDemo) expect(errorDeEnte(f), f.codigo).toBeNull();

      // La ficha lo exige al guardarse.
      const b = await base(tx);
      await rechaza(crearIndicador(b.admin, manual(b, { ente: ENTE }), { sql: tx }), "Diga con qué periodicidad se reporta al ente");
      await rechaza(
        crearIndicador(b.admin, manual(b, { periodicidad: "trimestral", inicioMedicion: "2026-T1", ente: ENTE, periodicidadExterna: "mensual", plazoExternoDias: 15 }), { sql: tx }),
        noContiene,
      );
    }));

  it("añadir el ente a una ficha con años de historia no abre constancias vencidas", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const creado = await aprobada(tx, b, manual(b, { inicioMedicion: "2024-01" }));
      expect(await tx`SELECT id FROM mediciones WHERE indicador_id = ${creado.indicadorId}`).toHaveLength(34);
      expect(await enteDesde(tx, creado.indicadorId)).toBeNull();

      expect(await cambioMenor(tx, b, creado, { ente: ENTE, periodicidadExterna: "trimestral", plazoExternoDias: 15 })).toMatchObject({ menor: true });
      // La publicación lo deja contando desde ahora, antes de que nadie mire las constancias.
      expect(await enteDesde(tx, creado.indicadorId)).toEqual(AHORA);
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: creado.indicadorId })).toBe(0);
      expect(await constanciasDeBD(tx, creado.indicadorId)).toEqual([]);

      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: creado.indicadorId })).toBe(1);
      expect(await constanciasDeBD(tx, creado.indicadorId)).toEqual([
        { periodo: "2026-T4", ente: ENTE, estado: "pendiente", vence_en: new Date("2027-01-16T04:59:59.999Z") },
      ]);
    }));

  it("una ficha importada tampoco", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const importadaEn = new Date("2026-03-02T15:00:00Z");
      const lote = await loteImportado(tx, { usuarioId: admin.usuarioId, importadoEn: importadaEn });
      const ind = await indicadorDePrueba(tx, { importacionId: lote, periodicidad: "mensual", inicioMedicion: "2024-01", aprobadaEn: importadaEn });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(0);

      await publicarCambio(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, ahora: AHORA, ente: SUPERSALUD });
      expect(await enteDesde(tx, ind.id)).toEqual(AHORA);
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(0);
      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: ind.id })).toBe(1);
      expect((await constanciasDeBD(tx, ind.id)).map((c) => c.periodo)).toEqual(["2026-T4"]);
    }));

  it("una ficha aprobada antes de esta entrega con el ente completo empieza a contar desde que el sistema la ve", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const antigua = await conEnte(tx, proceso.id, { inicioMedicion: "2025-01", aprobadaEn: new Date("2025-01-10T15:00:00Z"), ente: { ...SUPERSALUD, desde: null } });
      expect(await enteDesde(tx, antigua.id)).toBeNull();
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: antigua.id })).toBe(0);
      expect(await enteDesde(tx, antigua.id)).toEqual(AHORA);
      expect(await constanciasDeBD(tx, antigua.id)).toEqual([]);
      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: antigua.id })).toBe(1);

      // Trimestral que se reportaba mensual (lo que la ficha ya no admite): ni cuenta ni genera.
      const alReves = await conEnte(tx, proceso.id, {
        periodicidad: "trimestral",
        inicioMedicion: "2025-T1",
        aprobadaEn: new Date("2025-01-10T15:00:00Z"),
        ente: { ...SUPERSALUD, periodicidad: "mensual", desde: null },
      });
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: alReves.id })).toBe(0);
      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: alReves.id })).toBe(0);
      expect(await enteDesde(tx, alReves.id)).toBeNull();
      expect(await constanciasDeBD(tx, alReves.id)).toEqual([]);
    }));

  it("asegurarConstancias es idempotente y guarda el ente y la fecha límite de cuando nació", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const ind = await conEnte(tx, proceso.id);
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(3);
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(0);
      const filas = await tx`SELECT periodo, desde, hasta, vence_en, ente, estado FROM reportes_externos WHERE indicador_id = ${ind.id} ORDER BY hasta`;
      expect(filas).toEqual([
        {
          periodo: "2026-T1",
          desde: new Date("2026-01-01T05:00:00Z"),
          hasta: new Date("2026-04-01T04:59:59.999Z"),
          vence_en: new Date("2026-04-16T04:59:59.999Z"),
          ente: ENTE,
          estado: "pendiente",
        },
        expect.objectContaining({ periodo: "2026-T2", vence_en: new Date("2026-07-16T04:59:59.999Z") }),
        expect.objectContaining({ periodo: "2026-T3", vence_en: VENCE_T3 }),
      ]);
      // Sin pedir un indicador, también: pero la pasada entera no abre dos veces lo mismo.
      await asegurarConstancias({ sql: tx, ahora: AHORA });
      expect(await constanciasDeBD(tx, ind.id)).toHaveLength(3);
    }));

  it("cambiar el ente no toca las constancias que ya existen; las nuevas llevan el nombre nuevo", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const ind = await conEnte(tx, proceso.id);
      await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const antes = await constanciasDeBD(tx, ind.id);

      // Otro ente, semestral y con 30 días: el primer semestre, que ya terminó, no se abre vencido.
      const otro = "Secretaría de Salud Departamental";
      await publicarCambio(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, ahora: AHORA, ente: { nombre: otro, periodicidad: "semestral", plazoDias: 30 } });
      expect(await enteDesde(tx, ind.id)).toEqual(AHORA);
      expect(await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id })).toBe(0);
      expect(await constanciasDeBD(tx, ind.id)).toEqual(antes);

      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: ind.id })).toBe(1);
      expect(await constanciasDeBD(tx, ind.id)).toEqual([
        ...antes,
        { periodo: "2026-S2", ente: otro, estado: "pendiente", vence_en: new Date("2027-01-31T04:59:59.999Z") },
      ]);
      expect(antes.map((c) => c.ente)).toEqual([ENTE, ENTE, ENTE]);

      // Un cambio que no toca el ente no vuelve a contar.
      const desde = await enteDesde(tx, ind.id);
      await publicarCambio(tx, { indicadorId: ind.id, usuarioId: admin.usuarioId, ahora: ENERO, ente: { nombre: otro, periodicidad: "semestral", plazoDias: 30 } });
      expect(await enteDesde(tx, ind.id)).toEqual(desde);
    }));

  it("quitar el ente o retirar el indicador quita las pendientes sin soporte y conserva las registradas", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      /** El primer trimestre registrado y el segundo con un soporte; los demás, pendientes sin nada. */
      const preparar = async (ahora: Date) => {
        const ind = await conEnte(tx, proceso.id, { mide: [mide.usuarioId] });
        await asegurarConstancias({ sql: tx, ahora, indicadorId: ind.id });
        const [t1, t2] = await Promise.all(["2026-T1", "2026-T2"].map((p) => idDe(tx, ind.id, p)));
        await soporte(tx, t1);
        await registrarConstancia(mide, { reporteId: t1, fechaEnvio: "2026-04-10", radicado: "SNS-2026-0001" }, { sql: tx, ahora: AHORA });
        await soporte(tx, t2);
        return ind;
      };

      // Hasta el cuarto trimestre; el tercero, con un evento (el de un soporte subido y quitado, de la Tarea 11).
      const a = await preparar(ENERO);
      const conEvento = await idDe(tx, a.id, "2026-T3");
      await tx`INSERT INTO reporte_externo_eventos (reporte_id, tipo, usuario_id, detalle)
        VALUES (${conEvento}, 'soporte', ${mide.usuarioId}, ${tx.json({ nombre: "borrador.pdf", accion: "quitado" })})`;
      await publicarCambio(tx, { indicadorId: a.id, usuarioId: admin.usuarioId, ahora: ENERO, ente: null });
      expect(await enteDesde(tx, a.id)).toBeNull();
      expect((await constanciasDeBD(tx, a.id)).map((c) => [c.periodo, c.estado])).toEqual([
        ["2026-T1", "registrada"],
        ["2026-T2", "pendiente"],
        ["2026-T3", "pendiente"],
      ]);
      // Sin ente, no nace ninguna más.
      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: a.id })).toBe(0);

      const b = await preparar(AHORA);
      await retirar(admin, { indicadorId: b.id, motivo: "Ya no se mide" }, { sql: tx, ahora: AHORA });
      expect((await constanciasDeBD(tx, b.id)).map((c) => [c.periodo, c.estado])).toEqual([
        ["2026-T1", "registrada"],
        ["2026-T2", "pendiente"],
      ]);
      expect((await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_retirado' AND entidad_id = ${b.id}`)[0].detalle).toMatchObject({
        constanciasQuitadas: 1,
      });
      expect(await asegurarConstancias({ sql: tx, ahora: ENERO, indicadorId: b.id })).toBe(0);
    }));
});

describe("registrar y corregir", () => {
  it("registrar: fecha no futura, radicado, soporte y resultado congelado", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await conEnte(tx, proceso.id, { mide: [mide.usuarioId] });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      // Tres meses reportados, dos cerrados: 26 de 30.
      const [julio, agosto, septiembre] = await Promise.all(["2026-07", "2026-08", "2026-09"].map((p) => medicionDe(tx, ind.id, p)));
      await reportarCon(tx, mide, julio, { A: "9", B: "10" });
      await reportarCon(tx, mide, agosto, { A: "7", B: "10" });
      await reportarCon(tx, mide, septiembre, { A: "10", B: "10" });
      await tx`UPDATE mediciones SET estado = 'cerrada' WHERE id IN ${tx([julio, agosto])}`;
      const t3 = await idDe(tx, ind.id, "2026-T3");
      const opciones = { sql: tx, ahora: AHORA };
      const envio = { reporteId: t3, fechaEnvio: "2026-11-14", radicado: "SNS-2026-0042", nota: "Cargado en la plataforma del ente" };

      expect(await resultadoDelPeriodoExterno(tx, ind.id, "2026-T3", AHORA)).toEqual({
        texto: "86,7 %",
        exacto: "260/3",
        parcial: true,
        faltan: [],
        sinCerrar: ["septiembre de 2026"],
      });
      expect(await resultadoDelPeriodoExterno(tx, ind.id, "2026-T2", AHORA)).toEqual({
        texto: null,
        exacto: null,
        parcial: true,
        faltan: ["abril de 2026", "mayo de 2026", "junio de 2026"],
        sinCerrar: ["abril de 2026", "mayo de 2026", "junio de 2026"],
      });

      await rechaza(registrarConstancia(mide, { ...envio, fechaEnvio: "2026-11-15" }, opciones), "La fecha de envío no puede ser futura");
      await rechaza(registrarConstancia(mide, { ...envio, radicado: "   " }, opciones), "Escriba el radicado o número de constancia");
      await rechaza(registrarConstancia(mide, { ...envio, radicado: "x".repeat(101) }, opciones), "Escriba el radicado o número de constancia");
      await rechaza(registrarConstancia(mide, envio, opciones), "Adjunte al menos un soporte antes de registrar");
      expect((await tx`SELECT estado FROM reportes_externos WHERE id = ${t3}`)[0].estado).toBe("pendiente");

      await soporte(tx, t3);
      await registrarConstancia(mide, envio, opciones);
      const [fila] = await tx`SELECT estado, to_char(fecha_envio, 'YYYY-MM-DD') AS fecha_envio, radicado, nota, resultado_enviado,
          resultado_detalle, registrada_por, registrada_en, corregida
        FROM reportes_externos WHERE id = ${t3}`;
      expect(fila).toEqual({
        estado: "registrada",
        fecha_envio: "2026-11-14",
        radicado: "SNS-2026-0042",
        nota: "Cargado en la plataforma del ente",
        resultado_enviado: "86,7 %",
        resultado_detalle: { exacto: "260/3", parcial: true, faltan: [], sinCerrar: ["septiembre de 2026"] },
        registrada_por: mide.usuarioId,
        registrada_en: AHORA,
        corregida: false,
      });
      const eventos = await tx`SELECT tipo, usuario_id, detalle FROM reporte_externo_eventos WHERE reporte_id = ${t3} ORDER BY id`;
      expect(eventos).toEqual([
        {
          tipo: "registro",
          usuario_id: mide.usuarioId,
          detalle: expect.objectContaining({ fechaEnvio: "2026-11-14", radicado: "SNS-2026-0042", resultado: "86,7 %", parcial: true }),
        },
      ]);
      const [bitacora] = await tx`SELECT entidad, detalle FROM auditoria WHERE accion = 'constancia_registrada' AND entidad_id = ${t3}`;
      expect(bitacora).toEqual({
        entidad: "reporte_externo",
        detalle: { codigo: ind.codigo, periodo: "2026-T3", ente: ENTE, radicado: "SNS-2026-0042", fechaEnvio: "2026-11-14", resultado: "86,7 %" },
      });

      await rechaza(registrarConstancia(mide, envio, opciones), "La constancia ya está registrada: corríjala");
      // Lo enviado no cambia aunque la medición se corrija después.
      await reportarCon(tx, mide, septiembre, { A: "5", B: "10" });
      expect((await resultadoDelPeriodoExterno(tx, ind.id, "2026-T3", AHORA)).exacto).toBe("70/1");
      expect((await tx`SELECT resultado_enviado FROM reportes_externos WHERE id = ${t3}`)[0].resultado_enviado).toBe("86,7 %");
    }));

  it("registra quien mide y quien administra; quien solo ve el indicador, no", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const solo = await usuarioDePrueba(tx, { rol: "consulta" });
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const admin = await sesionAdmin(tx);
      const ind = await conEnte(tx, proceso.id, { mide: [mide.usuarioId] });
      await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      const [t1, t2, t3] = await Promise.all(["2026-T1", "2026-T2", "2026-T3"].map((p) => idDe(tx, ind.id, p)));
      for (const id of [t1, t2, t3]) await soporte(tx, id);
      const opciones = { sql: tx, ahora: AHORA };
      const envio = (reporteId: number) => ({ reporteId, fechaEnvio: "2026-11-10", radicado: `SNS-${reporteId}` });

      for (const quien of [mide, lider, admin]) expect(await puedeRegistrarConstancia(ind.id, quien, { sql: tx })).toBe(true);
      for (const quien of [solo, gerente]) expect(await puedeRegistrarConstancia(ind.id, quien, { sql: tx })).toBe(false);
      await expect(registrarConstancia(solo, envio(t1), opciones)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(registrarConstancia(gerente, envio(t1), opciones)).rejects.toBeInstanceOf(ErrorPermiso);

      await registrarConstancia(mide, envio(t1), opciones);
      await registrarConstancia(lider, envio(t2), opciones);
      await registrarConstancia(admin, envio(t3), opciones);
      const quienes = await tx`SELECT registrada_por FROM reportes_externos WHERE id IN ${tx([t1, t2, t3])} ORDER BY hasta`;
      expect(quienes.map((f) => Number(f.registrada_por))).toEqual([mide.usuarioId, lider.usuarioId, admin.usuarioId]);
    }));

  it("corregir exige justificación, no cambia el resultado y deja el antes y el después", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ind = await conEnte(tx, proceso.id, { mide: [mide.usuarioId] });
      await asegurarMediciones({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      await asegurarConstancias({ sql: tx, ahora: AHORA, indicadorId: ind.id });
      for (const p of ["2026-07", "2026-08", "2026-09"]) await reportarCon(tx, mide, await medicionDe(tx, ind.id, p), { A: "9", B: "10" });
      const [t2, t3] = await Promise.all(["2026-T2", "2026-T3"].map((p) => idDe(tx, ind.id, p)));
      await soporte(tx, t3);
      const opciones = { sql: tx, ahora: AHORA };
      await registrarConstancia(mide, { reporteId: t3, fechaEnvio: "2026-11-10", radicado: "SNS-2026-0042" }, opciones);
      const correccion = { reporteId: t3, fechaEnvio: "2026-11-09", radicado: "SNS-2026-0024", nota: "Radicado por correo", justificacion: "El radicado tenía las cifras invertidas" };

      await rechaza(corregirConstancia(mide, { ...correccion, justificacion: "Mal" }, opciones), "La justificación debe tener al menos 10 caracteres");
      await rechaza(corregirConstancia(mide, { ...correccion, justificacion: "x".repeat(501) }, opciones), "La justificación no puede pasar de 500 caracteres");
      await rechaza(corregirConstancia(mide, { ...correccion, reporteId: t2 }, opciones), "La constancia aún no está registrada: regístrela");
      await rechaza(corregirConstancia(mide, { ...correccion, fechaEnvio: "2026-11-20" }, opciones), "La fecha de envío no puede ser futura");
      await rechaza(
        corregirConstancia(mide, { reporteId: t3, fechaEnvio: "2026-11-10", radicado: "SNS-2026-0042", justificacion: "Nada que cambiar aquí" }, opciones),
        "No hay cambios que corregir",
      );

      // La medición cambia; la corrección no recalcula lo enviado.
      await reportarCon(tx, mide, await medicionDe(tx, ind.id, "2026-09"), { A: "3", B: "10" });
      const ahora = new Date("2026-11-14T16:00:00Z");
      await corregirConstancia(mide, correccion, { sql: tx, ahora });
      const [fila] = await tx`SELECT estado, to_char(fecha_envio, 'YYYY-MM-DD') AS fecha_envio, radicado, nota, resultado_enviado, resultado_detalle,
          registrada_por, registrada_en, corregida
        FROM reportes_externos WHERE id = ${t3}`;
      expect(fila).toEqual({
        estado: "registrada",
        fecha_envio: "2026-11-09",
        radicado: "SNS-2026-0024",
        nota: "Radicado por correo",
        resultado_enviado: "90 %",
        resultado_detalle: { exacto: "90/1", parcial: true, faltan: [], sinCerrar: ["julio de 2026", "agosto de 2026", "septiembre de 2026"] },
        registrada_por: mide.usuarioId,
        registrada_en: AHORA,
        corregida: true,
      });
      const [evento] = await tx`SELECT tipo, usuario_id, detalle, creado_en FROM reporte_externo_eventos WHERE reporte_id = ${t3} AND tipo = 'correccion'`;
      expect(evento).toEqual({
        tipo: "correccion",
        usuario_id: mide.usuarioId,
        creado_en: ahora,
        detalle: {
          justificacion: "El radicado tenía las cifras invertidas",
          antes: { fechaEnvio: "2026-11-10", radicado: "SNS-2026-0042", nota: null },
          despues: { fechaEnvio: "2026-11-09", radicado: "SNS-2026-0024", nota: "Radicado por correo" },
        },
      });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'constancia_corregida' AND entidad_id = ${t3}`;
      expect(bitacora.detalle).toEqual({
        codigo: ind.codigo,
        periodo: "2026-T3",
        ente: ENTE,
        justificacion: "El radicado tenía las cifras invertidas",
        antes: { fechaEnvio: "2026-11-10", radicado: "SNS-2026-0042", nota: null },
        despues: { fechaEnvio: "2026-11-09", radicado: "SNS-2026-0024", nota: "Radicado por correo" },
      });

      // La página la lee de la más reciente a la más antigua.
      const lista = await constanciasDe(mide, ind.id, { sql: tx, ahora: AHORA });
      expect(lista?.map((c) => c.periodo)).toEqual(["2026-T3", "2026-T2", "2026-T1"]);
      expect(lista?.[0]).toEqual({
        id: t3,
        periodo: "2026-T3",
        etiqueta: "Tercer trimestre de 2026",
        ente: ENTE,
        venceEn: VENCE_T3,
        estado: "registrada",
        vencida: false,
        fechaEnvio: "2026-11-09",
        radicado: "SNS-2026-0024",
        resultadoEnviado: "90 %",
        parcial: true,
        nota: "Radicado por correo",
        registradaPor: mide.nombre,
        registradaEn: AHORA,
        corregida: true,
      });
      expect(lista?.[1]).toMatchObject({ estado: "pendiente", vencida: true, fechaEnvio: null, radicado: null, registradaPor: null, corregida: false });
    }));
});

describe("tareas, vencimientos y visibilidad", () => {
  it("la tarea es de quien mide, con su respaldo, y cuenta en la insignia cuando vence", () =>
    revertida(sql, async (tx) => {
      const proceso = await procesoNuevo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const desdeJulio = { ...SUPERSALUD, desde: new Date("2026-07-05T15:00:00Z") };
      // Desde julio: solo nace el tercer trimestre. Sin abrir sus mediciones: las tareas son solo las constancias.
      const designado = await conEnte(tx, proceso.id, { mide: [mide.usuarioId], ente: desdeJulio });
      const delLider = await conEnte(tx, proceso.id, { ente: desdeJulio });
      // Uno que calcula el sistema: nadie lo mide y la tarea cae en el líder.
      const automatico = await conEnte(tx, proceso.id, { calculo: { clave: "dentro_plazo", alcance: "proceso" }, ente: desdeJulio });
      const sinLider = await procesoNuevo(tx);
      const admin = await sesionAdmin(tx);
      const huerfano = await conEnte(tx, sinLider.id, { ente: desdeJulio });
      for (const i of [designado, delLider, automatico, huerfano]) {
        expect(await asegurarConstancias({ sql: tx, ahora: OCTUBRE, indicadorId: i.id })).toBe(1);
      }
      expect(await responsablesDeMedir(automatico.id, { sql: tx })).toEqual([lider.usuarioId]);
      const tarea = (i: { id: number; codigo: string }, c: number, detalle: string) => ({
        id: `constancia:${c}`,
        modulo: "indicadores",
        titulo: `Registrar el reporte a ${ENTE}: ${i.codigo}, tercer trimestre de 2026`,
        detalle,
        vence: VENCE_T3,
        enlace: `/indicadores/${encodeURIComponent(i.codigo)}?vista=reportes`,
      });
      const constancia = (i: { id: number }) => idDe(tx, i.id, "2026-T3");
      const deConstancias = (r: { tareas: { id: string }[] }) => r.tareas.filter((t) => t.id.startsWith("constancia:"));

      const deMide = await tareasDeIndicadores(mide, { sql: tx, ahora: OCTUBRE });
      expect(deConstancias(deMide)).toEqual([tarea(designado, await constancia(designado), proceso.nombre)]);
      expect(deMide.vencidas).toBe(0);
      expect((await tareasDeIndicadores(mide, { sql: tx, ahora: AHORA })).vencidas).toBe(1);

      const deLider = deConstancias(await tareasDeIndicadores(lider, { sql: tx, ahora: AHORA }));
      expect(deLider.map((t) => t.id).sort()).toEqual([`constancia:${await constancia(delLider)}`, `constancia:${await constancia(automatico)}`].sort());
      expect(deConstancias(await tareasDeIndicadores(admin, { sql: tx, ahora: AHORA }))).toContainEqual(
        tarea(huerfano, await constancia(huerfano), "Sin responsable: designe a alguien"),
      );

      // Registrada, deja de ser tarea.
      const c = await constancia(designado);
      await soporte(tx, c);
      await registrarConstancia(mide, { reporteId: c, fechaEnvio: "2026-10-10", radicado: "SNS-1" }, { sql: tx, ahora: AHORA });
      const despues = await tareasDeIndicadores(mide, { sql: tx, ahora: AHORA });
      expect(deConstancias(despues)).toEqual([]);
      expect(despues.vencidas).toBe(0);
    }));

  it("vencido: un aviso por persona y otro al líder; escalamiento al jefe sin nombrar el indicador", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const zona = zonaHoraria();
      const pasada = (ahora: Date) => constanciasVencidas({ sql: tx, ahora, zona, escalamientoDias: 3 });
      const proceso = await procesoNuevo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso.id] });
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const mide = await usuarioDePrueba(tx, { rol: "consulta", jefeId: jefe.usuarioId });
      const desdeJulio = { ...SUPERSALUD, desde: new Date("2026-07-05T15:00:00Z") };
      const a = await conEnte(tx, proceso.id, { mide: [mide.usuarioId], ente: desdeJulio });
      const b = await conEnte(tx, proceso.id, { mide: [mide.usuarioId], ente: desdeJulio });
      // Sin designado ni líder: lo tiene el Admin SGC de respaldo, que no se escala.
      const sinLider = await procesoNuevo(tx);
      const jefeDelAdmin = await usuarioDePrueba(tx, { rol: "consulta" });
      const admin = await usuarioDePrueba(tx, { rol: "admin_sgc", jefeId: jefeDelAdmin.usuarioId });
      const huerfano = await conEnte(tx, sinLider.id, { ente: desdeJulio });
      for (const i of [a, b, huerfano]) await asegurarConstancias({ sql: tx, ahora: OCTUBRE, indicadorId: i.id });
      const ids = await Promise.all([a, b, huerfano].map((i) => idDe(tx, i.id, "2026-T3")));
      const avisos = async (usuarioId: number) =>
        tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones
          WHERE usuario_id = ${usuarioId} AND tipo IN ('indicadores.envio_vencido', 'indicadores.envio_escalado') ORDER BY id`;

      expect(await pasada(new Date("2026-10-14T15:00:00Z"))).toEqual({ avisados: 0, escalados: 0 });
      const dia17 = new Date("2026-10-17T15:00:00Z");
      expect(await pasada(dia17)).toEqual({ avisados: 3, escalados: 0 });
      expect(await avisos(mide.usuarioId)).toEqual([
        {
          tipo: "indicadores.envio_vencido",
          titulo: "Tiene 2 reportes al ente con el plazo vencido",
          cuerpo: "El plazo venció el 15 de octubre.",
          enlace: "/indicadores?envio=pendiente&participo=1",
          entidad: "usuario",
          entidad_id: mide.usuarioId,
        },
      ]);
      expect(await avisos(lider.usuarioId)).toEqual([
        {
          tipo: "indicadores.envio_vencido",
          titulo: `2 reportes al ente de ${proceso.nombre} con el plazo vencido`,
          cuerpo: "El plazo venció el 15 de octubre.",
          enlace: `/indicadores?envio=pendiente&proceso=${proceso.id}`,
          entidad: "proceso",
          entidad_id: proceso.id,
        },
      ]);
      expect((await avisos(admin.usuarioId)).map((x) => x.titulo)).toEqual(["Tiene 1 reporte al ente con el plazo vencido"]);
      const marcas = await tx`SELECT aviso_vencido_en, escalado_en FROM reportes_externos WHERE id IN ${tx(ids)} ORDER BY id`;
      expect(marcas).toEqual(ids.map(() => ({ aviso_vencido_en: dia17, escalado_en: null })));

      const dia20 = new Date("2026-10-20T15:00:00Z");
      expect(await pasada(dia20)).toEqual({ avisados: 0, escalados: 2 });
      const escalados = await avisos(jefe.usuarioId);
      expect(escalados).toEqual([
        {
          tipo: "indicadores.envio_escalado",
          titulo: "Reportes al ente vencidos",
          cuerpo: `2 reportes al ente a cargo de ${mide.nombre} siguen vencidos. Vencieron hace 5 días.`,
          enlace: null,
          entidad: "usuario",
          entidad_id: mide.usuarioId,
        },
      ]);
      // Ni el código, ni el nombre, ni el proceso del indicador.
      for (const i of [a, b]) expect(JSON.stringify(escalados)).not.toContain(i.codigo);
      expect(JSON.stringify(escalados)).not.toContain("Indicador de prueba");
      expect(JSON.stringify(escalados)).not.toContain(proceso.nombre);
      expect(await avisos(jefeDelAdmin.usuarioId)).toEqual([]);
      expect((await tx`SELECT escalado_en FROM reportes_externos WHERE id = ${ids[2]}`)[0].escalado_en).toBeNull();

      // Cada aviso sale una vez, y lo hace el sistema: sin fila en `auditoria`.
      expect(await pasada(new Date("2026-10-21T15:00:00Z"))).toEqual({ avisados: 0, escalados: 0 });
      expect(await tx`SELECT 1 FROM auditoria WHERE entidad = 'reporte_externo' AND entidad_id IN ${tx(ids)}`).toHaveLength(0);
    }));

  it("una constancia de un indicador restringido no le sale a quien no lo ve", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const proceso = await procesoNuevo(tx);
      const otro = await procesoNuevo(tx);
      const mide = await usuarioDePrueba(tx, { rol: "consulta" });
      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const liderDeOtro = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [otro.id] });
      const ind = await conEnte(tx, proceso.id, { nivelAcceso: "restringido", mide: [mide.usuarioId], ente: { ...SUPERSALUD, desde: new Date("2026-07-05T15:00:00Z") } });
      await asegurarConstancias({ sql: tx, ahora: OCTUBRE, indicadorId: ind.id });
      const t3 = await idDe(tx, ind.id, "2026-T3");
      await soporte(tx, t3);

      expect(await constanciasDe(mide, ind.id, { sql: tx, ahora: AHORA })).toHaveLength(1);
      for (const quien of [ajeno, liderDeOtro]) {
        expect(await constanciasDe(quien, ind.id, { sql: tx, ahora: AHORA })).toBeNull();
        expect(await puedeRegistrarConstancia(ind.id, quien, { sql: tx })).toBe(false);
        await rechaza(registrarConstancia(quien, { reporteId: t3, fechaEnvio: "2026-11-10", radicado: "SNS-1" }, { sql: tx, ahora: AHORA }), "La constancia no existe");
        await rechaza(
          corregirConstancia(quien, { reporteId: t3, fechaEnvio: "2026-11-10", radicado: "SNS-1", justificacion: "Una justificación cualquiera" }, { sql: tx, ahora: AHORA }),
          "La constancia no existe",
        );
        const tareas = await tareasDeIndicadores(quien, { sql: tx, ahora: AHORA });
        expect(tareas.tareas.filter((t) => t.id.startsWith("constancia:"))).toEqual([]);
        expect(tareas.vencidas).toBe(0);
      }
      await constanciasVencidas({ sql: tx, ahora: AHORA, zona: zonaHoraria(), escalamientoDias: 3 });
      for (const quien of [ajeno, liderDeOtro]) {
        expect(await tx`SELECT 1 FROM notificaciones WHERE usuario_id = ${quien.usuarioId} AND tipo LIKE 'indicadores.envio%'`).toHaveLength(0);
      }
      expect(await tx`SELECT 1 FROM notificaciones WHERE usuario_id = ${mide.usuarioId} AND tipo = 'indicadores.envio_vencido'`).toHaveLength(1);
    }));
});
