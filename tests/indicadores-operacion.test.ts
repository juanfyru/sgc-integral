/**
 * Operaciones del administrador sobre un indicador (Fase 14A, Tarea 8): designar personas, datos de operación,
 * duplicar, retirar, descartar y borrar. Contra la BD de desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { CONFIG_DOCUMENTAL_DEFECTO } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion, versionVigente } from "@/db/consultas/indicadores/aprobacion";
import { cerrarMes } from "@/db/consultas/indicadores/cierre";
import { abrirCambio, contenidoDeVersion, crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import { asegurarMediciones, reportar } from "@/db/consultas/indicadores/mediciones";
import {
  borrarIndicador,
  cambiarOperacion,
  descartarIndicador,
  designadosDe,
  designar,
  duplicar,
  retirar,
} from "@/db/consultas/indicadores/operacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { ErrorIndicador, type DatosOperacion } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba } from "./utiles/indicadores";
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
const AHORA = new Date("2026-11-10T15:00:00Z");
const CLAVE = { clave: "ok" };
const firmar = (tx: TransactionSql) => ({ sql: tx, ahora: AHORA, verificar: firmaDePrueba });

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

type Base = { admin: SesionFlujo; sgc: number; tipoId: number; clasificacionId: number; porcentaje: number; cargoId: number };

async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [c] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [cargo] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    sgc: Number(p.id),
    tipoId: Number(t.id),
    clasificacionId: Number(c.id),
    porcentaje: Number(u.id),
    cargoId: Number(cargo.id),
  };
}

/** Los rangos de «más es mejor» con el 70 % de la meta como límite de crítico. */
const rangosDe = (meta: number) =>
  JSON.stringify({ bien: [{ signo: ">=", valor: String(meta) }], atencion: [{ signo: ">=", valor: String((meta * 70) / 100) }], critico: [{ signo: "<", valor: String((meta * 70) / 100) }] });
/** Los rangos de la ficha de prueba (meta 90, ascendente): lo que antes era «relativo» con umbral 70 %. */
const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });

const datos = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.sgc,
  nombre: "Cumplimiento del plan de capacitación",
  proposito: "Saber si se ejecutan las capacitaciones programadas",
  tipoId: b.tipoId,
  clasificacionId: b.clasificacionId,
  forma: "porcentaje",
  variables: [
    { letra: "A", nombre: "Capacitaciones ejecutadas", consolidacion: "suma", admiteNegativos: false },
    { letra: "B", nombre: "Capacitaciones programadas", consolidacion: "suma", admiteNegativos: false },
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

/** Un indicador creado y enviado a aprobación (sin aprobar): queda en borrador con la firma «Elaboró». */
async function enviado(tx: TransactionSql, b: Base) {
  const c = await crearIndicador(b.admin, datos(b), { sql: tx });
  await enviarAAprobacion(b.admin, { versionId: c.versionId, credenciales: CLAVE }, firmar(tx));
  return c;
}

async function aprobado(tx: TransactionSql, b: Base, d: DatosFicha = datos(b)) {
  const c = await crearIndicador(b.admin, d, { sql: tx });
  await enviarAAprobacion(b.admin, { versionId: c.versionId, credenciales: CLAVE }, firmar(tx));
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  await aprobarFichas(gerente, { versionIds: [c.versionId], credenciales: CLAVE }, firmar(tx));
  return c;
}

/** La medición del periodo en el estado pedido. Aprobar la versión inicial ya abrió las de los periodos terminados. */
async function medicion(
  tx: TransactionSql,
  indicadorId: number,
  versionId: number,
  periodo: string,
  estado: "abierta" | "reportada" | "cerrada" = "reportada",
): Promise<number> {
  const p = periodoDe(periodo, zonaHoraria())!;
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado)
    VALUES (${indicadorId}, ${versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${p.hasta}, ${estado})
    ON CONFLICT (indicador_id, periodo) DO UPDATE SET estado = EXCLUDED.estado, version_id = EXCLUDED.version_id
    RETURNING id`;
  return Number(m.id);
}

const avisos = (tx: TransactionSql, tipo: string, indicadorId: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
    WHERE tipo = ${tipo} AND entidad = 'indicador' AND entidad_id = ${indicadorId} ORDER BY usuario_id`;

const bitacora = (tx: TransactionSql, accion: string, indicadorId: number) =>
  tx`SELECT detalle, usuario_id FROM auditoria WHERE accion = ${accion} AND entidad = 'indicador' AND entidad_id = ${indicadorId} ORDER BY id`;

const designadosIds = async (tx: TransactionSql, indicadorId: number, funcion: string) =>
  (await tx`SELECT usuario_id FROM indicador_designados WHERE indicador_id = ${indicadorId} AND funcion = ${funcion} ORDER BY usuario_id`).map((f) =>
    Number(f.usuario_id),
  );

describe("designar", () => {
  it("reemplaza la lista de una función, avisa a los nuevos y deja antes y después en la bitácora", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.sgc });
      const ana = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const beto = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const [a, bb] = [ana.usuarioId, beto.usuarioId];

      await designar(b.admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: [a] }, { sql: tx, ahora: AHORA });
      expect(await designadosIds(tx, ind.id, "mide")).toEqual([a]);
      const primeros = await avisos(tx, "indicadores.designacion", ind.id);
      expect(primeros.map((x) => Number(x.usuario_id))).toEqual([a]);
      expect(primeros[0].titulo).toBe(`Ahora mide ${ind.codigo}`);
      expect(primeros[0].enlace).toBe(`/indicadores/${encodeURIComponent(ind.codigo)}`);

      // Se reemplaza la lista: sale `a`, entra `bb`; solo el nuevo recibe aviso.
      await designar(b.admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: [bb] }, { sql: tx, ahora: AHORA });
      expect(await designadosIds(tx, ind.id, "mide")).toEqual([bb]);
      const todos = await avisos(tx, "indicadores.designacion", ind.id);
      expect(todos.map((x) => Number(x.usuario_id))).toEqual([a, bb].sort((x, y) => x - y));

      // Quien se queda no recibe un aviso nuevo, y las otras funciones no cambian.
      await designar(b.admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: [bb, a] }, { sql: tx, ahora: AHORA });
      expect((await avisos(tx, "indicadores.designacion", ind.id)).length).toBe(3);
      await designar(b.admin, { indicadorId: ind.id, funcion: "seguimiento", usuarioIds: [a] }, { sql: tx, ahora: AHORA });
      expect(await designadosIds(tx, ind.id, "mide")).toEqual([a, bb].sort((x, y) => x - y));
      expect(await designadosIds(tx, ind.id, "seguimiento")).toEqual([a]);

      const filas = await bitacora(tx, "indicador_designados", ind.id);
      expect(filas.length).toBe(4);
      expect(filas[1].detalle).toMatchObject({ codigo: ind.codigo, funcion: "mide", antes: [a], despues: [bb] });
      expect(filas[1].detalle.nombresAntes).toEqual([ana.nombre]);
      expect(filas[1].detalle.nombresDespues).toEqual([beto.nombre]);
    }));

  it("solo usuarios activos y con la lista en el límite", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.sgc });
      const inactivo = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      await rechaza(
        designar(b.admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: [inactivo.usuarioId] }, { sql: tx }),
        "Solo se puede designar a usuarios activos",
      );
      await rechaza(
        designar(b.admin, { indicadorId: ind.id, funcion: "mide", usuarioIds: Array.from({ length: 21 }, (_, i) => i + 1) }, { sql: tx }),
        "Elija hasta 20 personas",
      );
      expect(await designadosIds(tx, ind.id, "mide")).toEqual([]);
    }));

  it("un indicador en borrador no avisa a nadie, y uno retirado no admite designados", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const borrador = await indicadorDePrueba(tx, { procesoId: b.sgc, estado: "borrador" });
      const u = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      await designar(b.admin, { indicadorId: borrador.id, funcion: "mide", usuarioIds: [u.usuarioId] }, { sql: tx });
      expect(await designadosIds(tx, borrador.id, "mide")).toEqual([u.usuarioId]);
      expect((await avisos(tx, "indicadores.designacion", borrador.id)).length).toBe(0);

      const activo = await indicadorDePrueba(tx, { procesoId: b.sgc });
      await retirar(b.admin, { indicadorId: activo.id, motivo: "Ya no se mide" }, { sql: tx });
      await rechaza(
        designar(b.admin, { indicadorId: activo.id, funcion: "mide", usuarioIds: [u.usuarioId] }, { sql: tx }),
        "Un indicador retirado no admite cambios",
      );
    }));

  it("designadosDe marca a los inactivos y reparte las tres funciones", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const u1 = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const u2 = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const ind = await indicadorDePrueba(tx, { procesoId: b.sgc, mide: [u1.usuarioId], analiza: [u2.usuarioId] });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${u2.usuarioId}`;
      const d = await designadosDe(ind.id, { sql: tx });
      expect(d.mide).toEqual([{ id: u1.usuarioId, nombre: u1.nombre, activo: true }]);
      expect(d.analiza).toEqual([{ id: u2.usuarioId, nombre: u2.nombre, activo: false }]);
      expect(d.seguimiento).toEqual([]);
    }));
});

describe("datos de operación", () => {
  it("se cambian sin versión nueva y sin tocar la huella", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const c = await aprobado(tx, b);
      const antes = await versionVigente(tx, c.indicadorId);
      const [v0] = await tx`SELECT huella, actualizado_en FROM indicador_versiones WHERE id = ${c.versionId}`;

      await cambiarOperacion(
        b.admin,
        { indicadorId: c.indicadorId, plazoReporteDias: 15, inicioMedicion: "2026-02", soporteObligatorio: true, nivelAcceso: "restringido" },
        { sql: tx, ahora: AHORA },
      );
      const [i] = await tx`SELECT plazo_reporte_dias, inicio_medicion, soporte_obligatorio, nivel_acceso FROM indicadores WHERE id = ${c.indicadorId}`;
      expect(i).toMatchObject({ plazo_reporte_dias: 15, inicio_medicion: "2026-02", soporte_obligatorio: true, nivel_acceso: "restringido" });
      expect(await versionVigente(tx, c.indicadorId)).toEqual(antes);
      const [v1] = await tx`SELECT huella, actualizado_en FROM indicador_versiones WHERE id = ${c.versionId}`;
      expect(v1).toEqual(v0);
      expect((await tx`SELECT id FROM indicador_versiones WHERE indicador_id = ${c.indicadorId}`).length).toBe(1);

      const [fila] = await bitacora(tx, "indicador_operacion", c.indicadorId);
      expect(fila.detalle).toMatchObject({
        codigo: c.codigo,
        antes: { plazoReporteDias: 10, inicioMedicion: "2026-01", soporteObligatorio: false, nivelAcceso: "general" },
        despues: { plazoReporteDias: 15, inicioMedicion: "2026-02", soporteObligatorio: true, nivelAcceso: "restringido" },
      });

      const base0 = { indicadorId: c.indicadorId, inicioMedicion: "2026-02", soporteObligatorio: true, nivelAcceso: "restringido" as const };
      await rechaza(cambiarOperacion(b.admin, { ...base0, plazoReporteDias: 91 }, { sql: tx }), "El plazo de reporte debe estar entre 0 y 90");
      await rechaza(cambiarOperacion(b.admin, { ...base0, plazoReporteDias: 1.5 }, { sql: tx }), "El plazo de reporte debe ser un número entero");
      await rechaza(
        cambiarOperacion(b.admin, { ...base0, plazoReporteDias: 10, inicioMedicion: "2026-T1" }, { sql: tx }),
        "El inicio de medición debe ser un periodo mensual",
      );
      expect(await versionVigente(tx, c.indicadorId)).toEqual(antes);
    }));

  it("el inicio de medición no puede dejar fuera una medición con datos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const c = await aprobado(tx, b);
      await medicion(tx, c.indicadorId, c.versionId, "2026-03", "reportada");
      const op = { indicadorId: c.indicadorId, plazoReporteDias: 10, soporteObligatorio: false, nivelAcceso: "general" as const };
      await rechaza(cambiarOperacion(b.admin, { ...op, inicioMedicion: "2026-04" }, { sql: tx }), "Hay mediciones con datos antes de ese periodo");
      // Hasta el periodo de la medición con datos, sí.
      await cambiarOperacion(b.admin, { ...op, inicioMedicion: "2026-03" }, { sql: tx });
      // Una abierta y vacía antes del inicio nuevo se quita; una con solo causa (datos) lo impide.
      const d = await aprobado(tx, b);
      const vacia = await medicion(tx, d.indicadorId, d.versionId, "2026-02", "abierta");
      const soloCausa = await medicion(tx, d.indicadorId, d.versionId, "2026-03", "abierta");
      await tx`UPDATE mediciones SET causa = 'Faltó personal' WHERE id = ${soloCausa}`;
      const cambio = { ...op, indicadorId: d.indicadorId, plazoReporteDias: 12, inicioMedicion: "2026-05" };
      await rechaza(cambiarOperacion(b.admin, cambio, { sql: tx }), "Hay mediciones con datos antes de ese periodo");
      expect((await tx`SELECT id FROM mediciones WHERE id = ${vacia}`).length).toBe(1);
      await tx`UPDATE mediciones SET causa = NULL WHERE id = ${soloCausa}`;
      await cambiarOperacion(b.admin, cambio, { sql: tx });
      // No queda ninguna antes del inicio nuevo: ni la vacía ni las que abrió la aprobación.
      const mayo = periodoDe("2026-05", zonaHoraria())!;
      expect((await tx`SELECT id FROM mediciones WHERE indicador_id = ${d.indicadorId} AND desde < ${mayo.desde}`).length).toBe(0);
      expect((await tx`SELECT id FROM mediciones WHERE id = ${vacia}`).length).toBe(0);
      const [i] = await tx`SELECT plazo_reporte_dias, inicio_medicion FROM indicadores WHERE id = ${d.indicadorId}`;
      expect(i).toMatchObject({ plazo_reporte_dias: 12, inicio_medicion: "2026-05" });
    }));
});

/**
 * Los datos de operación llegan a las mediciones abiertas (ola final, I1): el plazo nuevo mueve su fecha límite y sus marcas
 * de aviso, y «soporte obligatorio» las recalcula. La pasada de vencimientos y el cierre recorren todo el sistema: los casos
 * viven en 2003, antes de todo inicio de medición de la base. El indicador es mensual desde marzo de 2003, aprobado el 15 de
 * diciembre de 2002, con plazo de 10 días: marzo vence el 10 de abril de 2003.
 */
describe("los datos de operación en las mediciones abiertas", () => {
  const MARZO = "2003-03";
  const abril = (d: number) => new Date(`2003-04-${String(d).padStart(2, "0")}T15:00:00Z`);
  /** El fin del día dado de 2003 en Bogotá: la fecha límite de un plazo. */
  const finDelDia = (mes: number, d: number) => new Date(Date.UTC(2003, mes - 1, d + 1, 4, 59, 59, 999));
  const config = { ...CONFIG_DOCUMENTAL_DEFECTO, escalamientoDias: 3 };
  const pasada = (tx: TransactionSql, ahora: Date) => revisarVencimientosDeIndicadores({ sql: tx, ahora, config });

  async function entorno(tx: TransactionSql, o: { soporteObligatorio?: boolean } = {}) {
    await tx`UPDATE configuracion SET valor = '3' WHERE clave = 'ind_aviso_previo_dias'`;
    const admin = await sesionAdmin(tx);
    const mide = await usuarioDePrueba(tx, { rol: "consulta" });
    const nuevo = async () => {
      const ind = await indicadorDePrueba(tx, { inicioMedicion: MARZO, aprobadaEn: new Date("2002-12-15T15:00:00Z"), mide: [mide.usuarioId], ...o });
      await asegurarMediciones({ sql: tx, ahora: abril(5), indicadorId: ind.id });
      const [m] = await tx`SELECT id FROM mediciones WHERE indicador_id = ${ind.id} AND periodo = ${MARZO}`;
      return { ind, marzo: Number(m.id) };
    };
    const op = (indicadorId: number, cambios: Partial<DatosOperacion>) => ({
      indicadorId,
      plazoReporteDias: 10,
      inicioMedicion: MARZO,
      soporteObligatorio: o.soporteObligatorio ?? false,
      nivelAcceso: "general" as const,
      ...cambios,
    });
    return { admin, mide, nuevo, op };
  }

  const marcas = async (tx: TransactionSql, medicionId: number) =>
    (await tx`SELECT vence_en, aviso_previo_en, aviso_vencido_en, escalado_en, estado FROM mediciones WHERE id = ${medicionId}`)[0];

  it("ampliar el plazo antes del vencimiento evita el aviso de vencido y el cierre en «sin dato»", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, op } = await entorno(tx);
      const { ind, marzo } = await nuevo();
      const igual = await nuevo();
      expect((await marcas(tx, marzo)).vence_en).toEqual(finDelDia(4, 10));

      await cambiarOperacion(admin, op(ind.id, { plazoReporteDias: 30 }), { sql: tx, ahora: abril(5) });
      expect((await marcas(tx, marzo)).vence_en).toEqual(finDelDia(4, 30));
      expect((await marcas(tx, igual.marzo)).vence_en).toEqual(finDelDia(4, 10));
      const [fila] = await bitacora(tx, "indicador_operacion", ind.id);
      expect(fila.detalle).toMatchObject({ antes: { plazoReporteDias: 10 }, despues: { plazoReporteDias: 30 }, medicionesConFechaNueva: 1 });

      // El 12 de abril, solo la del plazo de siempre está vencida.
      await pasada(tx, abril(12));
      expect((await marcas(tx, marzo)).aviso_vencido_en).toBeNull();
      expect((await marcas(tx, igual.marzo)).aviso_vencido_en).toEqual(abril(12));
      const vencidos = await tx`SELECT cuerpo FROM notificaciones WHERE usuario_id = ${mide.usuarioId} AND tipo = 'indicadores.vencido'`;
      expect(vencidos).toHaveLength(1);

      // El cierre de marzo, el 20 de abril, deja «sin dato» la del plazo de siempre y no cierra la que sigue en su plazo.
      await cerrarMes(admin, MARZO, { sql: tx, ahora: abril(20) });
      expect((await marcas(tx, igual.marzo)).estado).toBe("cerrada");
      expect((await marcas(tx, marzo)).estado).toBe("abierta");
    }));

  it("una fecha nueva que ya pasó conserva el aviso de vencido; una que aún no llega lo limpia y avisa otra vez cuando toca", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, op } = await entorno(tx);
      const { ind, marzo } = await nuevo();
      await tx`UPDATE mediciones SET aviso_previo_en = ${abril(8)}, aviso_vencido_en = ${abril(11)}, escalado_en = ${abril(14)} WHERE id = ${marzo}`;

      // El 15 de abril, con 12 días el plazo sigue vencido (venció el 12): se conservan las tres marcas.
      await cambiarOperacion(admin, op(ind.id, { plazoReporteDias: 12 }), { sql: tx, ahora: abril(15) });
      expect(await marcas(tx, marzo)).toMatchObject({ vence_en: finDelDia(4, 12), aviso_previo_en: abril(8), aviso_vencido_en: abril(11), escalado_en: abril(14) });
      // Con 17 días vence en dos: el vencido y el escalamiento ya no son ciertos; el previo sí (faltan menos de 3 días).
      await cambiarOperacion(admin, op(ind.id, { plazoReporteDias: 17 }), { sql: tx, ahora: abril(15) });
      expect(await marcas(tx, marzo)).toMatchObject({ vence_en: finDelDia(4, 17), aviso_previo_en: abril(8), aviso_vencido_en: null, escalado_en: null });
      // Con 30, faltan quince días: tampoco el previo.
      await tx`UPDATE mediciones SET aviso_vencido_en = ${abril(11)}, escalado_en = ${abril(14)} WHERE id = ${marzo}`;
      await cambiarOperacion(admin, op(ind.id, { plazoReporteDias: 30 }), { sql: tx, ahora: abril(15) });
      expect(await marcas(tx, marzo)).toMatchObject({ vence_en: finDelDia(4, 30), aviso_previo_en: null, aviso_vencido_en: null, escalado_en: null });

      // La pasada vuelve a avisar con la fecha nueva: el previo el 28 de abril y el vencido el 2 de mayo.
      await pasada(tx, abril(28));
      expect((await marcas(tx, marzo)).aviso_previo_en).toEqual(abril(28));
      const previos = await tx`SELECT titulo FROM notificaciones WHERE usuario_id = ${mide.usuarioId} AND tipo = 'indicadores.por_vencer'`;
      expect(previos.map((p) => p.titulo)).toEqual(["Tiene 1 indicador por reportar antes del 30 de abril"]);
      const mayo2 = new Date("2003-05-02T15:00:00Z");
      await pasada(tx, mayo2);
      expect((await marcas(tx, marzo)).aviso_vencido_en).toEqual(mayo2);
    }));

  it("desmarcar el soporte obligatorio deja reportada la medición que solo esperaba el soporte y quita su tarea", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, op } = await entorno(tx);
      const { ind, marzo } = await nuevo();
      await reportar(mide, { medicionId: marzo, valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx, ahora: abril(5) });
      expect((await marcas(tx, marzo)).estado).toBe("reportada");
      const tareaDe = async () => (await tareasDeIndicadores(mide, { sql: tx, ahora: abril(7) })).tareas.find((t) => t.id === `medir:${marzo}`);

      // Con el soporte obligatorio, la ya reportada vuelve a abierta y es tarea de quien mide.
      await cambiarOperacion(admin, op(ind.id, { soporteObligatorio: true }), { sql: tx, ahora: abril(6) });
      expect((await marcas(tx, marzo)).estado).toBe("abierta");
      expect((await tareaDe())?.detalle).toBe("Falta el soporte obligatorio");
      const [recalculo] = await tx`SELECT usuario_id, detalle, creado_en FROM medicion_eventos WHERE medicion_id = ${marzo} AND tipo = 'recalculo'`;
      expect(recalculo).toMatchObject({ usuario_id: admin.usuarioId, creado_en: abril(6), detalle: { causa: "soporte_obligatorio", despues: { estado: "abierta" } } });

      // Sin él, queda reportada otra vez y la tarea se va.
      await cambiarOperacion(admin, op(ind.id, { soporteObligatorio: false }), { sql: tx, ahora: abril(7) });
      expect((await marcas(tx, marzo)).estado).toBe("reportada");
      expect(await tareaDe()).toBeUndefined();
      const filas = await bitacora(tx, "indicador_operacion", ind.id);
      expect(filas.map((f) => f.detalle.medicionesRecalculadas)).toEqual([1, 1]);
    }));

  it("activar el soporte rige hacia adelante: una reportada a tiempo y ya vencida no se reabre, ni vence ni se escala (residuos, 1)", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, op } = await entorno(tx);
      // Con jefe: si la medición volviera a abrirse vencida, la pasada lo escalaría.
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET jefe_inmediato_id = ${jefe.usuarioId} WHERE id = ${mide.usuarioId}`;
      const { ind, marzo } = await nuevo();
      await reportar(mide, { medicionId: marzo, valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx, ahora: abril(5) });

      // El 15 de abril el plazo de marzo (el 10) ya pasó: el soporte se pide desde ahora, no a lo ya reportado.
      await cambiarOperacion(admin, op(ind.id, { soporteObligatorio: true }), { sql: tx, ahora: abril(15) });
      expect((await marcas(tx, marzo)).estado).toBe("reportada");
      expect(await tx`SELECT id FROM medicion_eventos WHERE medicion_id = ${marzo} AND tipo = 'recalculo'`).toHaveLength(0);
      const [fila] = await bitacora(tx, "indicador_operacion", ind.id);
      expect(fila.detalle.medicionesRecalculadas).toBeUndefined();
      expect((await tareasDeIndicadores(mide, { sql: tx, ahora: abril(15) })).tareas.find((t) => t.id === `medir:${marzo}`)).toBeUndefined();

      // La pasada no la ve vencida ni la escala.
      await pasada(tx, abril(20));
      expect(await marcas(tx, marzo)).toMatchObject({ estado: "reportada", aviso_vencido_en: null, escalado_en: null });
      const avisos = await tx`SELECT tipo FROM notificaciones WHERE tipo IN ('indicadores.vencido', 'indicadores.escalado')
        AND usuario_id IN (${mide.usuarioId}, ${jefe.usuarioId})`;
      expect(avisos).toHaveLength(0);
    }));

  it("el recálculo por el soporte conserva la versión con que se calculó: un cambio menor aprobado después no la mueve", () =>
    revertida(sql, async (tx) => {
      const { admin, mide, nuevo, op } = await entorno(tx);
      const { ind, marzo } = await nuevo();
      await reportar(mide, { medicionId: marzo, valores: { A: "9", B: "10" }, parcial: false, confirmado: true }, { sql: tx, ahora: abril(5) });
      // Un cambio menor rige los mismos periodos que la versión que reemplaza.
      const [v2] = await tx`INSERT INTO indicador_versiones (indicador_id, numero, estado, tipo_cambio, nombre, forma, formula, periodicidad,
          tendencia, meta, semaforo_modo, umbral_atencion_pct, unidad_sufijo, decimales, creado_por)
        SELECT indicador_id, 2, 'borrador', 'menor', 'Nombre corregido', forma, formula, periodicidad, tendencia, meta, semaforo_modo,
          umbral_atencion_pct, unidad_sufijo, decimales, ${admin.usuarioId}
        FROM indicador_versiones WHERE id = ${ind.versionId} RETURNING id`;
      await tx`SELECT id FROM indicador_versiones WHERE id = ${v2.id} FOR UPDATE`;
      await tx`INSERT INTO indicador_variables (version_id, letra, nombre, consolidacion, origen, orden)
        SELECT ${v2.id}, letra, nombre, consolidacion, origen, orden FROM indicador_variables WHERE version_id = ${ind.versionId}`;
      await tx`UPDATE indicador_versiones SET estado = 'aprobada', elaborada_por = ${admin.usuarioId}, huella = ${"2".repeat(64)},
          rige_desde = ${MARZO}, aprobada_por = ${admin.usuarioId}, aprobada_en = ${abril(5)}
        WHERE id = ${v2.id}`;

      // En plazo, activarlo la reabre y desactivarlo la deja reportada: las dos veces sigue con la versión 1.
      await cambiarOperacion(admin, op(ind.id, { soporteObligatorio: true }), { sql: tx, ahora: abril(6) });
      const [abierta] = await tx`SELECT estado, version_id FROM mediciones WHERE id = ${marzo}`;
      expect([abierta.estado, Number(abierta.version_id)]).toEqual(["abierta", ind.versionId]);
      await cambiarOperacion(admin, op(ind.id, { soporteObligatorio: false }), { sql: tx, ahora: abril(7) });
      const [reportada] = await tx`SELECT estado, version_id FROM mediciones WHERE id = ${marzo}`;
      expect([reportada.estado, Number(reportada.version_id)]).toEqual(["reportada", ind.versionId]);
    }));
});

describe("duplicar", () => {
  it("crea un borrador en versión 1 con el mismo contenido y el código del proceso destino", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const c = await aprobado(tx, b, datos(b, { plazoReporteDias: 20, soporteObligatorio: true }));
      await tx`INSERT INTO indicador_metas (indicador_id, periodo, meta, programada_por) VALUES (${c.indicadorId}, '2026-06', 95, ${b.admin.usuarioId})`;
      const [otro] = await tx`SELECT id, nombre FROM procesos WHERE sigla = 'GTH'`;
      const res = await duplicar(b.admin, { indicadorId: c.indicadorId, procesoId: Number(otro.id) }, { sql: tx, ahora: AHORA });
      expect(res.codigo).toMatch(/^GTH-ID-\d{3,}$/);

      const [nuevo] = await tx`SELECT id, estado, proceso_id, plazo_reporte_dias, soporte_obligatorio, inicio_medicion, creado_por
        FROM indicadores WHERE codigo = ${res.codigo}`;
      expect(nuevo).toMatchObject({ estado: "borrador", plazo_reporte_dias: 20, soporte_obligatorio: true, inicio_medicion: "2026-01" });
      expect(Number(nuevo.proceso_id)).toBe(Number(otro.id));
      expect(Number(nuevo.creado_por)).toBe(b.admin.usuarioId);
      const versiones = await tx`SELECT id, numero, estado, tipo_cambio, huella, rige_desde, proceso_nombre, subproceso_id, elaborada_por, aprobada_por
        FROM indicador_versiones WHERE indicador_id = ${nuevo.id}`;
      expect(versiones.length).toBe(1);
      expect(versiones[0]).toMatchObject({
        numero: 1,
        estado: "borrador",
        tipo_cambio: "inicial",
        huella: null,
        rige_desde: null,
        proceso_nombre: otro.nombre,
        subproceso_id: null,
        elaborada_por: null,
        aprobada_por: null,
      });
      const original = await contenidoDeVersion(tx, c.versionId);
      const copia = await contenidoDeVersion(tx, Number(versiones[0].id));
      expect({ ...copia, procesoNombre: null }).toEqual({ ...original, procesoNombre: null });
      expect((await tx`SELECT id FROM mediciones WHERE indicador_id = ${nuevo.id}`).length).toBe(0);
      expect((await tx`SELECT id FROM indicador_metas WHERE indicador_id = ${nuevo.id}`).length).toBe(0);
      expect((await tx`SELECT id FROM firmas WHERE indicador_version_id = ${versiones[0].id}`).length).toBe(0);

      const [fila] = await bitacora(tx, "indicador_duplicado", Number(nuevo.id));
      expect(fila.detalle).toMatchObject({ codigo: res.codigo, origen: c.codigo });
    }));

  it("un indicador retirado se puede duplicar, y uno que nunca se aprobó, desde su última versión", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const activo = await indicadorDePrueba(tx, { procesoId: b.sgc });
      await retirar(b.admin, { indicadorId: activo.id, motivo: "Ya no se mide" }, { sql: tx });
      const r1 = await duplicar(b.admin, { indicadorId: activo.id, procesoId: b.sgc }, { sql: tx });
      expect(r1.codigo).not.toBe(activo.codigo);
      const borrador = await enviado(tx, b);
      const r2 = await duplicar(b.admin, { indicadorId: borrador.indicadorId, procesoId: b.sgc }, { sql: tx });
      expect(r2.codigo).not.toBe(borrador.codigo);
      await rechaza(duplicar(b.admin, { indicadorId: activo.id, procesoId: 999_999_999 }, { sql: tx }), "El proceso no existe o está inactivo");
    }));
});

describe("retirar", () => {
  it("exige motivo, quita las mediciones abiertas sin datos, conserva las que tienen datos y descarta el borrador", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const mide = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const c = await aprobado(tx, b, datos(b, { mide: [mide.usuarioId], analiza: [mide.usuarioId] }));
      const vacia = await medicion(tx, c.indicadorId, c.versionId, "2026-05", "abierta");
      const conValores = await medicion(tx, c.indicadorId, c.versionId, "2026-06", "abierta");
      const conAnalisis = await medicion(tx, c.indicadorId, c.versionId, "2026-07", "abierta");
      const conEvento = await medicion(tx, c.indicadorId, c.versionId, "2026-08", "abierta");
      const reportada = await medicion(tx, c.indicadorId, c.versionId, "2026-03", "reportada");
      const [variable] = await tx`SELECT id FROM indicador_variables WHERE version_id = ${c.versionId} ORDER BY orden LIMIT 1`;
      await tx`INSERT INTO medicion_valores (medicion_id, variable_id, valor) VALUES (${conValores}, ${variable.id}, 3)`;
      await tx`UPDATE mediciones SET analisis = 'Se analizó' WHERE id = ${conAnalisis}`;
      await tx`INSERT INTO medicion_eventos (medicion_id, usuario_id, tipo) VALUES (${conEvento}, ${b.admin.usuarioId}, 'reporte')`;
      // Un cambio mayor por aprobar, en vuelo.
      const { versionId: enCurso } = await abrirCambio(b.admin, c.indicadorId, { sql: tx });
      await guardarBorrador(b.admin, enCurso, { ...datos(b, { mide: [mide.usuarioId], analiza: [mide.usuarioId] }), meta: "80", rangos: rangosDe(80), motivoCambio: "Meta más realista" }, { sql: tx });
      await enviarAAprobacion(b.admin, { versionId: enCurso, credenciales: CLAVE }, firmar(tx));
      expect((await tx`SELECT estado FROM indicador_versiones WHERE id = ${enCurso}`)[0].estado).toBe("por_aprobar");
      // Soporte solo, y causa sola: tienen datos aunque no haya valores.
      const soloSoporte = await medicion(tx, c.indicadorId, c.versionId, "2026-09", "abierta");
      const soloCausa = await medicion(tx, c.indicadorId, c.versionId, "2026-10", "abierta");
      await tx`UPDATE mediciones SET causa = 'Faltó personal' WHERE id = ${soloCausa}`;
      await tx`INSERT INTO archivos (rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256, contexto, contexto_id)
        VALUES ('evidencia', ${`zz/${unico()}.pdf`}, 'soporte.pdf', 'pdf', 'application/pdf', 10, ${"a".repeat(64)}, 'medicion', ${soloSoporte})`;

      await rechaza(retirar(b.admin, { indicadorId: c.indicadorId, motivo: "no" }, { sql: tx }), "El motivo debe tener al menos 5 caracteres");
      await rechaza(retirar(b.admin, { indicadorId: c.indicadorId, motivo: "x".repeat(501) }, { sql: tx }), "El motivo no puede pasar de 500 caracteres");

      await retirar(b.admin, { indicadorId: c.indicadorId, motivo: "Se dejó de medir en el hospital" }, { sql: tx, ahora: AHORA });
      const [i] = await tx`SELECT estado, baja_por, baja_en, baja_motivo FROM indicadores WHERE id = ${c.indicadorId}`;
      expect(i.estado).toBe("retirado");
      expect(Number(i.baja_por)).toBe(b.admin.usuarioId);
      expect(i.baja_en).toEqual(AHORA);
      expect(i.baja_motivo).toBe("Se dejó de medir en el hospital");

      const quedan = (await tx`SELECT id FROM mediciones WHERE indicador_id = ${c.indicadorId} ORDER BY id`).map((m) => Number(m.id));
      expect(quedan).toEqual([conValores, conAnalisis, conEvento, reportada, soloSoporte, soloCausa].sort((x, y) => x - y));
      expect(quedan).not.toContain(vacia);
      const [v] = await tx`SELECT estado FROM indicador_versiones WHERE id = ${enCurso}`;
      expect(v.estado).toBe("descartada");
      expect((await versionVigente(tx, c.indicadorId))?.id).toBe(c.versionId);

      const enviados = await avisos(tx, "indicadores.retirado", c.indicadorId);
      expect(enviados.map((a) => Number(a.usuario_id))).toEqual([mide.usuarioId]);
      expect(enviados[0].titulo).toContain(c.codigo);
      const [fila] = await bitacora(tx, "indicador_retirado", c.indicadorId);
      // La vacía de mayo y las que abrió la aprobación sin datos: enero, febrero y abril.
      expect(fila.detalle).toMatchObject({ codigo: c.codigo, motivo: "Se dejó de medir en el hospital", medicionesQuitadas: 4 });

      await rechaza(retirar(b.admin, { indicadorId: c.indicadorId, motivo: "Otra vez retirado" }, { sql: tx }), "Solo se puede retirar un indicador activo");
    }));
});

describe("descartar y borrar", () => {
  it("un indicador enviado y nunca aprobado se descarta y conserva su código", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const c = await enviado(tx, b);
      await rechaza(descartarIndicador(b.admin, { indicadorId: c.indicadorId, motivo: "no" }, { sql: tx }), "El motivo debe tener al menos 5 caracteres");
      await descartarIndicador(b.admin, { indicadorId: c.indicadorId, motivo: "Se abandonó la idea" }, { sql: tx, ahora: AHORA });
      const [i] = await tx`SELECT estado, baja_por, baja_en, baja_motivo FROM indicadores WHERE id = ${c.indicadorId}`;
      expect(i.estado).toBe("descartado");
      expect(Number(i.baja_por)).toBe(b.admin.usuarioId);
      expect(i.baja_motivo).toBe("Se abandonó la idea");
      const [v] = await tx`SELECT estado FROM indicador_versiones WHERE id = ${c.versionId}`;
      expect(v.estado).toBe("descartada");
      const [fila] = await bitacora(tx, "indicador_descartado", c.indicadorId);
      expect(fila.detalle).toMatchObject({ codigo: c.codigo, motivo: "Se abandonó la idea" });

      // El código sigue ocupado.
      await rechaza(crearIndicador(b.admin, datos(b, { codigo: c.codigo }), { sql: tx }), `Ya existe un indicador con el código ${c.codigo}`);
      // Y ya no se descarta dos veces ni se borra.
      await rechaza(
        descartarIndicador(b.admin, { indicadorId: c.indicadorId, motivo: "Otra vez descartado" }, { sql: tx }),
        "Solo se puede descartar un indicador en borrador",
      );
    }));

  it("descartar exige que alguna vez se haya enviado", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const c = await crearIndicador(b.admin, datos(b), { sql: tx });
      await rechaza(
        descartarIndicador(b.admin, { indicadorId: c.indicadorId, motivo: "Se abandonó la idea" }, { sql: tx }),
        "Este indicador nunca se envió a aprobación: bórrelo",
      );
    }));

  it("borrar solo lo que nunca se envió", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const u = await usuarioDePrueba(tx, { rol: "lider_proceso" });
      const ya = await enviado(tx, b);
      await rechaza(borrarIndicador(b.admin, ya.indicadorId, { sql: tx }), "Este indicador ya se envió a aprobación: descártelo");
      const [sigue] = await tx`SELECT estado FROM indicadores WHERE id = ${ya.indicadorId}`;
      expect(sigue.estado).toBe("borrador");

      const c = await crearIndicador(b.admin, datos(b, { mide: [u.usuarioId], analiza: [u.usuarioId] }), { sql: tx });
      await borrarIndicador(b.admin, c.indicadorId, { sql: tx });
      expect((await tx`SELECT id FROM indicadores WHERE id = ${c.indicadorId}`).length).toBe(0);
      expect((await tx`SELECT id FROM indicador_versiones WHERE indicador_id = ${c.indicadorId}`).length).toBe(0);
      expect((await tx`SELECT 1 FROM indicador_variables WHERE version_id = ${c.versionId}`).length).toBe(0);
      expect((await tx`SELECT 1 FROM indicador_designados WHERE indicador_id = ${c.indicadorId}`).length).toBe(0);
      const [fila] = await bitacora(tx, "indicador_borrado", c.indicadorId);
      expect(fila.detalle).toMatchObject({ codigo: c.codigo });
      // El código queda libre: nadie lo había enviado.
      await crearIndicador(b.admin, datos(b, { codigo: c.codigo }), { sql: tx });

      await rechaza(borrarIndicador(b.admin, c.indicadorId, { sql: tx }), "El indicador no existe");
      const activo = await indicadorDePrueba(tx, { procesoId: b.sgc });
      await rechaza(borrarIndicador(b.admin, activo.id, { sql: tx }), "Solo se puede borrar un indicador en borrador");
    }));
});

describe("permiso", () => {
  it("solo quien administra", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      const ind = await indicadorDePrueba(tx, { procesoId: b.sgc });
      const o = { sql: tx };
      const operacion = { indicadorId: ind.id, plazoReporteDias: 91, inicioMedicion: "2026-01", soporteObligatorio: false, nivelAcceso: "general" as const };
      for (const llamada of [
        () => designar(lider, { indicadorId: ind.id, funcion: "mide", usuarioIds: [] }, o),
        () => cambiarOperacion(lider, operacion, o),
        () => duplicar(lider, { indicadorId: ind.id, procesoId: b.sgc }, o),
        () => retirar(lider, { indicadorId: ind.id, motivo: "x" }, o),
        () => descartarIndicador(lider, { indicadorId: ind.id, motivo: "x" }, o),
        () => borrarIndicador(lider, ind.id, o),
      ]) {
        await expect(llamada()).rejects.toBeInstanceOf(ErrorPermiso);
      }
      const [i] = await tx`SELECT estado FROM indicadores WHERE id = ${ind.id}`;
      expect(i.estado).toBe("activo");
    }));
});
