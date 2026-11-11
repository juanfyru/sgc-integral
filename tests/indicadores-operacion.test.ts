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
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion, versionVigente } from "@/db/consultas/indicadores/aprobacion";
import { abrirCambio, contenidoDeVersion, crearIndicador } from "@/db/consultas/indicadores/fichas";
import {
  borrarIndicador,
  cambiarOperacion,
  descartarIndicador,
  designadosDe,
  designar,
  duplicar,
  retirar,
} from "@/db/consultas/indicadores/operacion";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
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
  semaforoModo: "relativo",
  umbralAtencionPct: 70,
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

async function medicion(
  tx: TransactionSql,
  indicadorId: number,
  versionId: number,
  periodo: string,
  estado: "abierta" | "reportada" | "cerrada" = "reportada",
): Promise<number> {
  const p = periodoDe(periodo, zonaHoraria())!;
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado)
    VALUES (${indicadorId}, ${versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${p.hasta}, ${estado}) RETURNING id`;
  return Number(m.id);
}

const avisos = (tx: TransactionSql, tipo: string, indicadorId: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
    WHERE tipo = ${tipo} AND entidad = 'indicador' AND entidad_id = ${indicadorId} ORDER BY usuario_id`;

const bitacora = (tx: TransactionSql, accion: string, indicadorId: number) =>
  tx`SELECT detalle, usuario_id FROM auditoria WHERE accion = ${accion} AND entidad = 'indicador' AND entidad_id = ${indicadorId}`;

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
      // Y una medición abierta y vacía no lo impide.
      await medicion(tx, c.indicadorId, c.versionId, "2026-05", "abierta");
      await cambiarOperacion(b.admin, { ...op, inicioMedicion: "2026-03" }, { sql: tx });
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
      expect(res.codigo).toMatch(/^GTH-IND-\d{2,}$/);

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
      // Un cambio por aprobar, en vuelo.
      const { versionId: enCurso } = await abrirCambio(b.admin, c.indicadorId, { sql: tx });

      await rechaza(retirar(b.admin, { indicadorId: c.indicadorId, motivo: "no" }, { sql: tx }), "El motivo debe tener al menos 5 caracteres");
      await rechaza(retirar(b.admin, { indicadorId: c.indicadorId, motivo: "x".repeat(501) }, { sql: tx }), "El motivo no puede pasar de 500 caracteres");

      await retirar(b.admin, { indicadorId: c.indicadorId, motivo: "Se dejó de medir en el hospital" }, { sql: tx, ahora: AHORA });
      const [i] = await tx`SELECT estado, baja_por, baja_en, baja_motivo FROM indicadores WHERE id = ${c.indicadorId}`;
      expect(i.estado).toBe("retirado");
      expect(Number(i.baja_por)).toBe(b.admin.usuarioId);
      expect(i.baja_en).toEqual(AHORA);
      expect(i.baja_motivo).toBe("Se dejó de medir en el hospital");

      const quedan = (await tx`SELECT id FROM mediciones WHERE indicador_id = ${c.indicadorId} ORDER BY id`).map((m) => Number(m.id));
      expect(quedan).toEqual([conValores, conAnalisis, conEvento, reportada].sort((x, y) => x - y));
      expect(quedan).not.toContain(vacia);
      const [v] = await tx`SELECT estado FROM indicador_versiones WHERE id = ${enCurso}`;
      expect(v.estado).toBe("descartada");
      expect((await versionVigente(tx, c.indicadorId))?.id).toBe(c.versionId);

      const enviados = await avisos(tx, "indicadores.retirado", c.indicadorId);
      expect(enviados.map((a) => Number(a.usuario_id))).toEqual([mide.usuarioId]);
      expect(enviados[0].titulo).toContain(c.codigo);
      const [fila] = await bitacora(tx, "indicador_retirado", c.indicadorId);
      expect(fila.detalle).toMatchObject({ codigo: c.codigo, motivo: "Se dejó de medir en el hospital", medicionesQuitadas: 1 });

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
