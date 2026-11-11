/**
 * La ficha de indicador en borrador (Fase 14A, Tarea 6): el esquema del formulario, crear el indicador con su versión 1,
 * guardar el borrador, abrir un cambio sobre la ficha aprobada, el contenido firmado y la lista básica. Contra la BD de
 * desarrollo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  abrirCambio,
  contenidoDeVersion,
  crearIndicador,
  fichaParaEditar,
  guardarBorrador,
  listarIndicadoresBasico,
  opcionesDeFicha,
  proponerCodigo,
} from "@/db/consultas/indicadores/fichas";
import { EsquemaFicha, type DatosFicha } from "@/lib/esquemas/indicadores";
import { huellaDeFicha } from "@/lib/indicadores/ficha";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { fraccion } from "@/lib/indicadores/formula/fraccion";
import { errorDeRegla } from "@/lib/indicadores/semaforo";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { ErrorValidacion, parsearFormulario } from "@/lib/validacion";
import { indicadorDePrueba } from "./utiles/indicadores";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

type Base = {
  admin: SesionFlujo;
  procesoId: number;
  procesoNombre: string;
  tipoId: number;
  operativo: number;
  regulatorio: number;
  porcentaje: number;
  cargoId: number;
  cargoNombre: string;
  mideId: number;
};

/** Lo que `datos` necesita de la BD: el proceso SGC, los maestros sembrados, un cargo propio y quien mide. */
async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id, nombre FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [op] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [re] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Regulatorio'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id, nombre`;
  const mide = await usuarioDePrueba(tx, { rol: "consulta" });
  return {
    admin: await sesionAdmin(tx),
    procesoId: Number(p.id),
    procesoNombre: p.nombre as string,
    tipoId: Number(t.id),
    operativo: Number(op.id),
    regulatorio: Number(re.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
    cargoNombre: c.nombre as string,
    mideId: mide.usuarioId,
  };
}

/** Una ficha de forma «porcentaje» válida para el proceso SGC. */
const datos = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.procesoId,
  nombre: "Cumplimiento del plan de capacitación",
  proposito: "Saber si se ejecutan las capacitaciones programadas",
  tipoId: b.tipoId,
  clasificacionId: b.operativo,
  forma: "porcentaje",
  variables: [
    { letra: "A", nombre: "Capacitaciones ejecutadas", fuente: "Registros de asistencia", consolidacion: "suma", admiteNegativos: false },
    { letra: "B", nombre: "Capacitaciones programadas", fuente: "Plan de capacitación", consolidacion: "suma", admiteNegativos: false },
  ],
  unidadId: b.porcentaje,
  decimales: 1,
  periodicidad: "trimestral",
  tendencia: "ascendente",
  meta: "80",
  semaforoModo: "relativo",
  umbralAtencionPct: 70,
  lineaBaseNota: "Sin línea base: 2026 es el año de referencia",
  cargosMedir: [b.cargoId],
  cargosAnalizar: [b.cargoId],
  normaIds: [],
  plazoReporteDias: 10,
  inicioMedicion: "2026-T1",
  soporteObligatorio: true,
  nivelAcceso: "restringido",
  mide: [b.mideId],
  analiza: [b.mideId],
  ...parcial,
});

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ErrorIndicador);
  expect((err as Error).message).toBe(mensaje);
}

/** Una norma de la transacción, con el estado pedido. */
async function norma(tx: TransactionSql, estado: "vigente" | "modificada" | "derogada", creadoPor: number) {
  const [tn] = await tx`SELECT id, nombre FROM tipos_norma ORDER BY id LIMIT 1`;
  const numero = `ZZ${unico()}`;
  const [n] = await tx`INSERT INTO normas (tipo_norma_id, numero, anio, entidad_emisora, titulo, estado, creado_por)
    VALUES (${tn.id}, ${numero}, 2026, 'Emisor de prueba', 'Norma de prueba', ${estado}, ${creadoPor}) RETURNING id`;
  return { id: Number(n.id), nombre: `${tn.nombre} ${numero} de 2026` };
}

describe("EsquemaFicha", () => {
  const formulario = (campos: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(campos)) fd.set(k, v);
    return fd;
  };
  const minimo = {
    procesoId: "2",
    nombre: "Cumplimiento",
    proposito: "Saber si se cumple",
    tipoId: "1",
    clasificacionId: "2",
    forma: "porcentaje",
    variables: JSON.stringify([
      { letra: "A", nombre: "Ejecutadas", consolidacion: "suma", admiteNegativos: false },
      { letra: "B", nombre: "Programadas", consolidacion: "suma", admiteNegativos: false },
    ]),
    unidadId: "1",
    decimales: "1",
    periodicidad: "trimestral",
    tendencia: "ascendente",
    meta: "80,5",
    cargosMedir: "[4]",
    cargosAnalizar: "[4]",
    normaIds: "[]",
    plazoReporteDias: "10",
    inicioMedicion: "2026-T1",
    nivelAcceso: "general",
    mide: "[7]",
    analiza: "[7]",
  };

  it("lee los números como texto y las listas en JSON, y vuelve a validar lo que ya leyó", () => {
    const d = parsearFormulario(formulario({ ...minimo, soporteObligatorio: "on" }), EsquemaFicha);
    expect(d).toMatchObject({ procesoId: 2, meta: "80.5", decimales: 1, cargosMedir: [4], mide: [7], soporteObligatorio: true });
    expect(d.variables.map((v) => v.letra)).toEqual(["A", "B"]);
    expect(EsquemaFicha.parse(d)).toEqual(d);
  });

  it("rechaza el JSON roto, los topes de las listas y un número que no lo es", () => {
    const falla = (campos: Record<string, string>) => {
      try {
        parsearFormulario(formulario({ ...minimo, ...campos }), EsquemaFicha);
      } catch (e) {
        expect(e).toBeInstanceOf(ErrorValidacion);
        return (e as Error).message;
      }
      throw new Error("no falló");
    };
    expect(falla({ variables: "[{roto" })).toBe("Las variables no tienen un formato válido");
    const muchas = Array.from({ length: 27 }, (_, i) => ({ letra: String.fromCharCode(65 + (i % 26)), nombre: "X", consolidacion: "suma", admiteNegativos: false }));
    expect(falla({ variables: JSON.stringify(muchas) })).toBe("Una ficha admite hasta 26 variables");
    expect(falla({ normaIds: JSON.stringify(Array.from({ length: 21 }, (_, i) => i + 1)) })).toBe("Elija hasta 20 normas");
    expect(falla({ meta: "ochenta" })).toBe("La meta debe ser un número");
    expect(falla({ prueba: JSON.stringify({ valores: { A: "nueve" } }) })).toBe("Los valores de la prueba deben ser números");
    expect(falla({ codigo: "SGC IND/01" })).toBe("El código solo admite letras, números y guiones");
  });
});

describe("la ficha en borrador", () => {
  it("propone SIGLA-IND-NN, contando también los retirados", () =>
    revertida(sql, async (tx) => {
      const sigla = `Z${unico()}`;
      const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
      const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
        VALUES (${macro.id}, 'Proceso de prueba', ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
      const procesoId = Number(p.id);
      expect(await proponerCodigo(procesoId, { sql: tx })).toBe(`${sigla}-IND-01`);

      const admin = await sesionAdmin(tx);
      const activo = await indicadorDePrueba(tx, { procesoId });
      await tx`UPDATE indicadores SET codigo = ${`${sigla}-IND-01`} WHERE id = ${activo.id}`;
      const retirado = await indicadorDePrueba(tx, { procesoId });
      await tx`UPDATE indicadores SET codigo = ${`${sigla.toLowerCase()}-ind-02`}, estado = 'retirado',
          baja_por = ${admin.usuarioId}, baja_en = now(), baja_motivo = 'Prueba'
        WHERE id = ${retirado.id}`;
      // Un código que no termina en cifras no cuenta.
      const raro = await indicadorDePrueba(tx, { procesoId });
      await tx`UPDATE indicadores SET codigo = ${`${sigla}-IND-07B`} WHERE id = ${raro.id}`;
      expect(await proponerCodigo(procesoId, { sql: tx })).toBe(`${sigla}-IND-03`);
    }));

  it("crea el indicador en borrador con su versión 1, sus variables y los nombres firmados", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { indicadorId, versionId, codigo } = await crearIndicador(b.admin, datos(b), { sql: tx });
      expect(codigo).toMatch(/^SGC-IND-\d{2,}$/);

      const [i] = await tx`SELECT * FROM indicadores WHERE id = ${indicadorId}`;
      expect(i).toMatchObject({
        codigo,
        proceso_id: b.procesoId,
        estado: "borrador",
        plazo_reporte_dias: 10,
        inicio_medicion: "2026-T1",
        soporte_obligatorio: true,
        nivel_acceso: "restringido",
        creado_por: b.admin.usuarioId,
      });
      const [v] = await tx`SELECT * FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toMatchObject({
        indicador_id: indicadorId,
        numero: 1,
        estado: "borrador",
        tipo_cambio: "inicial",
        forma: "porcentaje",
        formula: "A / B * 100",
        factor: null,
        tipo_nombre: "Eficacia",
        clasificacion_nombre: "Operativo",
        unidad_nombre: "Porcentaje",
        unidad_sufijo: " %",
        proceso_nombre: b.procesoNombre,
        subproceso_nombre: null,
        meta: "80",
        semaforo_modo: "relativo",
        umbral_atencion_pct: 70,
        periodicidad: "trimestral",
        tendencia: "ascendente",
      });
      const variables = await tx`SELECT letra, nombre, fuente, consolidacion FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden`;
      expect(variables.map((x) => [x.letra, x.nombre, x.fuente])).toEqual([
        ["A", "Capacitaciones ejecutadas", "Registros de asistencia"],
        ["B", "Capacitaciones programadas", "Plan de capacitación"],
      ]);
      const responsables = await tx`SELECT cargo_id, cargo_nombre, funcion FROM indicador_responsables WHERE version_id = ${versionId} ORDER BY funcion`;
      expect(responsables.map((x) => [Number(x.cargo_id), x.cargo_nombre, x.funcion])).toEqual([
        [b.cargoId, b.cargoNombre, "analizar"],
        [b.cargoId, b.cargoNombre, "medir"],
      ]);
      const designados = await tx`SELECT usuario_id, funcion FROM indicador_designados WHERE indicador_id = ${indicadorId} ORDER BY funcion`;
      expect(designados.map((x) => [Number(x.usuario_id), x.funcion])).toEqual([
        [b.mideId, "analiza"],
        [b.mideId, "mide"],
      ]);
      const [bitacora] = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'indicador' AND entidad_id = ${indicadorId}`;
      expect(bitacora).toMatchObject({ accion: "indicador_creado", detalle: { codigo, versionId } });
    }));

  it("valida la fórmula libre contra sus variables", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const libre = (formula: string) => datos(b, { forma: "libre", formula });
      await rechaza(crearIndicador(b.admin, libre("A / C"), { sql: tx }), "La fórmula usa la variable C, que no está declarada");
      await rechaza(crearIndicador(b.admin, libre("A"), { sql: tx }), "La variable B no se usa en la fórmula");
      const mala = analizar("A ** 2");
      expect(mala.ok).toBe(false);
      await rechaza(crearIndicador(b.admin, libre("A ** 2"), { sql: tx }), mala.ok ? "" : mala.error);
      await rechaza(crearIndicador(b.admin, datos(b, { forma: "libre" }), { sql: tx }), "Escriba la fórmula");

      const { versionId } = await crearIndicador(b.admin, libre("max(A − B; 0) ÷ B × 100"), { sql: tx });
      const [v] = await tx`SELECT forma, formula FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toEqual({ forma: "libre", formula: "max(A − B; 0) ÷ B × 100" });
      // En una forma que no es libre, las letras son las de la forma.
      await rechaza(
        crearIndicador(b.admin, datos(b, { forma: "conteo" }), { sql: tx }),
        "La variable B no se usa en la fórmula",
      );
    }));

  it("valida la regla del semáforo", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const esperado = errorDeRegla({
        tendencia: "descendente",
        meta: fraccion("0"),
        metaMax: null,
        modo: "relativo",
        umbralPct: 70,
        limite: null,
        tolerancia: null,
      });
      expect(esperado).not.toBeNull();
      await rechaza(
        crearIndicador(b.admin, datos(b, { meta: "0", tendencia: "descendente", semaforoModo: "relativo" }), { sql: tx }),
        esperado!,
      );
      // Sin meta no hay semáforo que validar.
      const { versionId } = await crearIndicador(b.admin, datos(b, { meta: undefined, semaforoModo: undefined, umbralAtencionPct: undefined }), { sql: tx });
      const [v] = await tx`SELECT meta, semaforo_modo FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toEqual({ meta: null, semaforo_modo: null });
    }));

  it("un regulatorio debe citar una norma vigente o modificada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      await rechaza(
        crearIndicador(b.admin, datos(b, { clasificacionId: b.regulatorio, normaIds: [] }), { sql: tx }),
        "Un indicador regulatorio debe citar al menos una norma",
      );
      const derogada = await norma(tx, "derogada", b.admin.usuarioId);
      await rechaza(
        crearIndicador(b.admin, datos(b, { clasificacionId: b.regulatorio, normaIds: [derogada.id] }), { sql: tx }),
        "Solo se pueden citar normas vigentes o modificadas",
      );
      // Tampoco una operativa cita una derogada.
      await rechaza(crearIndicador(b.admin, datos(b, { normaIds: [derogada.id] }), { sql: tx }), "Solo se pueden citar normas vigentes o modificadas");

      const vigente = await norma(tx, "vigente", b.admin.usuarioId);
      const modificada = await norma(tx, "modificada", b.admin.usuarioId);
      const { versionId } = await crearIndicador(
        b.admin,
        datos(b, { clasificacionId: b.regulatorio, normaIds: [vigente.id, modificada.id] }),
        { sql: tx },
      );
      const normas = await tx`SELECT norma_id, norma_nombre FROM indicador_normas WHERE version_id = ${versionId} ORDER BY norma_id`;
      expect(normas.map((n) => n.norma_nombre)).toEqual([vigente.nombre, modificada.nombre]);
    }));

  it("el subproceso es del proceso y el código es único sin distinguir mayúsculas", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [ajeno] = await tx`SELECT s.id FROM subprocesos s JOIN procesos p ON p.id = s.proceso_id
        WHERE p.sigla <> 'SGC' AND s.activo ORDER BY s.id LIMIT 1`;
      await rechaza(crearIndicador(b.admin, datos(b, { subprocesoId: Number(ajeno.id) }), { sql: tx }), "El subproceso no es del proceso elegido");
      // El procedimiento también es un documento del proceso.
      const deOtro = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await rechaza(
        crearIndicador(b.admin, datos(b, { procedimientoDocumentoId: deOtro.id }), { sql: tx }),
        "El procedimiento debe ser un documento del proceso",
      );
      const propio = await documentoLibre(tx, { proceso: "SGC", tipo: "PR" });
      const conProcedimiento = await crearIndicador(b.admin, datos(b, { procedimientoDocumentoId: propio.id, puntoControl: "PC-13" }), { sql: tx });
      const [pc] = await tx`SELECT procedimiento_documento_id, punto_control FROM indicador_versiones WHERE id = ${conProcedimiento.versionId}`;
      expect([Number(pc.procedimiento_documento_id), pc.punto_control]).toEqual([propio.id, "PC-13"]);

      const codigo = `SGC-IND-9${unico()}`;
      const creado = await crearIndicador(b.admin, datos(b, { codigo }), { sql: tx });
      expect(creado.codigo).toBe(codigo);
      await rechaza(
        crearIndicador(b.admin, datos(b, { codigo: codigo.toLowerCase() }), { sql: tx }),
        `Ya existe un indicador con el código ${codigo.toLowerCase()}`,
      );
      // La transacción sigue usable tras el choque.
      const otro = await crearIndicador(b.admin, datos(b), { sql: tx });
      await rechaza(
        guardarBorrador(b.admin, otro.versionId, datos(b, { codigo: codigo.toUpperCase() }), { sql: tx }),
        `Ya existe un indicador con el código ${codigo.toUpperCase()}`,
      );
    }));

  it("solo quien administra crea y edita", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      await expect(crearIndicador(lider, datos(b), { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      const { versionId } = await crearIndicador(b.admin, datos(b), { sql: tx });
      await expect(guardarBorrador(lider, versionId, datos(b), { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await expect(abrirCambio(lider, ind.id, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await fichaParaEditar(lider, ind.codigo, { sql: tx })).toBeNull();
    }));

  it("guardarBorrador solo sobre un borrador", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { indicadorId, versionId, codigo } = await crearIndicador(b.admin, datos(b), { sql: tx });
      const otra = await usuarioDePrueba(tx, { rol: "consulta" });
      await guardarBorrador(
        b.admin,
        versionId,
        datos(b, {
          nombre: "Capacitaciones cumplidas",
          variables: [
            { letra: "A", nombre: "Cumplidas", consolidacion: "ultimo", admiteNegativos: false },
            { letra: "B", nombre: "Programadas", consolidacion: "suma", admiteNegativos: false },
          ],
          plazoReporteDias: 15,
          mide: [otra.usuarioId],
          analiza: [b.mideId],
          prueba: { valores: { A: "9", B: "10" } },
        }),
        { sql: tx },
      );
      const [v] = await tx`SELECT nombre, prueba, tipo_cambio FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toEqual({ nombre: "Capacitaciones cumplidas", prueba: { valores: { A: "9", B: "10" } }, tipo_cambio: "inicial" });
      const variables = await tx`SELECT letra, nombre, consolidacion FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden`;
      expect(variables.map((x) => [x.letra, x.nombre, x.consolidacion])).toEqual([
        ["A", "Cumplidas", "ultimo"],
        ["B", "Programadas", "suma"],
      ]);
      const [i] = await tx`SELECT plazo_reporte_dias, codigo FROM indicadores WHERE id = ${indicadorId}`;
      expect(i).toEqual({ plazo_reporte_dias: 15, codigo });
      const designados = await tx`SELECT usuario_id, funcion FROM indicador_designados WHERE indicador_id = ${indicadorId} ORDER BY funcion`;
      expect(designados.map((x) => [Number(x.usuario_id), x.funcion])).toEqual([
        [b.mideId, "analiza"],
        [otra.usuarioId, "mide"],
      ]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_borrador_guardado' AND entidad_id = ${indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ codigo, versionId, numero: 1 });

      const aprobado = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await rechaza(guardarBorrador(b.admin, aprobado.versionId, datos(b), { sql: tx }), "Solo se puede editar una ficha en borrador");
      await tx`UPDATE indicador_versiones SET estado = 'por_aprobar' WHERE id = ${versionId}`;
      await rechaza(guardarBorrador(b.admin, versionId, datos(b), { sql: tx }), "Solo se puede editar una ficha en borrador");
      await rechaza(guardarBorrador(b.admin, 999_999_999, datos(b), { sql: tx }), "La ficha no existe");
    }));

  it("abrirCambio copia la ficha vigente en un borrador con el número siguiente, una sola vez", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const { versionId } = await abrirCambio(b.admin, ind.id, { sql: tx });
      expect(versionId).not.toBe(ind.versionId);
      const [v] = await tx`SELECT numero, estado, tipo_cambio, nombre, formula, forma, meta FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toMatchObject({ numero: 2, estado: "borrador", nombre: `Indicador de prueba ${ind.codigo}`, formula: "A / B * 100", forma: "porcentaje", meta: "90" });
      const letras = await tx`SELECT letra, nombre FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden`;
      expect(letras.map((x) => [x.letra, x.nombre])).toEqual([
        ["A", "Casos que cumplen"],
        ["B", "Casos evaluados"],
      ]);
      expect(huellaDeFicha(await contenidoDeVersion(tx, versionId))).toBe(huellaDeFicha(await contenidoDeVersion(tx, ind.versionId)));

      expect(await abrirCambio(b.admin, ind.id, { sql: tx })).toEqual({ versionId });
      const [{ cuantas }] = await tx`SELECT count(*)::int AS cuantas FROM indicador_versiones WHERE indicador_id = ${ind.id}`;
      expect(cuantas).toBe(2);
      const [{ abiertos }] = await tx`SELECT count(*)::int AS abiertos FROM auditoria WHERE accion = 'indicador_cambio_abierto' AND entidad_id = ${ind.id}`;
      expect(abiertos).toBe(1);

      const ficha = await fichaParaEditar(b.admin, ind.codigo.toLowerCase(), { sql: tx });
      expect(ficha).toMatchObject({ indicadorId: ind.id, versionId, estado: "borrador", numero: 2 });
      expect(ficha!.vigente?.nombre).toBe(`Indicador de prueba ${ind.codigo}`);
      expect(ficha!.valores).toMatchObject({ procesoId: b.procesoId, codigo: ind.codigo, forma: "porcentaje", meta: "90" });

      // Sobre el cambio: el proceso y el código quedan fijos y los datos de operación no se tocan.
      await rechaza(
        guardarBorrador(b.admin, versionId, datos(b, { procesoId: ind.procesoId + 1 }), { sql: tx }),
        "El proceso queda fijo desde la primera aprobación",
      );
      await rechaza(
        guardarBorrador(b.admin, versionId, datos(b, { codigo: `${ind.codigo}X` }), { sql: tx }),
        "El código queda fijo desde la primera aprobación",
      );
      await guardarBorrador(b.admin, versionId, datos(b, { codigo: ind.codigo, nombre: "Nombre del cambio", plazoReporteDias: 30 }), { sql: tx });
      const [cambio] = await tx`SELECT nombre, tipo_cambio FROM indicador_versiones WHERE id = ${versionId}`;
      expect(cambio).toEqual({ nombre: "Nombre del cambio", tipo_cambio: "mayor" });
      const [i] = await tx`SELECT estado, plazo_reporte_dias FROM indicadores WHERE id = ${ind.id}`;
      expect(i).toEqual({ estado: "activo", plazo_reporte_dias: 10 });

      await rechaza(abrirCambio(b.admin, 999_999_999, { sql: tx }), "El indicador no existe");
    }));

  it("contenidoDeVersion da siempre la misma huella y no depende del nombre actual del catálogo", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { versionId } = await crearIndicador(b.admin, datos(b), { sql: tx });
      const contenido = await contenidoDeVersion(tx, versionId);
      expect(contenido).toMatchObject({
        nombre: "Cumplimiento del plan de capacitación",
        tipoNombre: "Eficacia",
        clasificacionId: b.operativo,
        clasificacionNombre: "Operativo",
        unidadId: b.porcentaje,
        unidadSufijo: " %",
        procesoNombre: b.procesoNombre,
        origenDato: "manual",
        responsables: [
          { cargoNombre: b.cargoNombre, funcion: "medir" },
          { cargoNombre: b.cargoNombre, funcion: "analizar" },
        ],
        normas: [],
      });
      expect(contenido.variables.map((v) => v.letra)).toEqual(["A", "B"]);
      const huella = huellaDeFicha(contenido);
      expect(huellaDeFicha(await contenidoDeVersion(tx, versionId))).toBe(huella);

      await tx`UPDATE cargos SET nombre = ${`ZZ Renombrado ${unico()}`} WHERE id = ${b.cargoId}`;
      await tx`UPDATE procesos SET nombre = 'Otro nombre del proceso' WHERE id = ${b.procesoId}`;
      expect(huellaDeFicha(await contenidoDeVersion(tx, versionId))).toBe(huella);
    }));

  it("fichaParaEditar devuelve lo que el formulario vuelve a enviar", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { versionId, codigo } = await crearIndicador(b.admin, datos(b, { prueba: { valores: { A: "9", B: "10" } } }), { sql: tx });
      const huella = huellaDeFicha(await contenidoDeVersion(tx, versionId));
      const ficha = await fichaParaEditar(b.admin, codigo, { sql: tx });
      expect(ficha).toMatchObject({ versionId, estado: "borrador", numero: 1, vigente: null });
      expect(ficha!.operacion).toEqual({ plazoReporteDias: 10, inicioMedicion: "2026-T1", soporteObligatorio: true, nivelAcceso: "restringido" });
      const otra = EsquemaFicha.parse(ficha!.valores);
      expect(otra).toMatchObject({ codigo, mide: [b.mideId], analiza: [b.mideId], cargosMedir: [b.cargoId], prueba: { valores: { A: "9", B: "10" } } });
      await guardarBorrador(b.admin, versionId, otra, { sql: tx });
      expect(huellaDeFicha(await contenidoDeVersion(tx, versionId))).toBe(huella);
    }));

  it("opcionesDeFicha ofrece los catálogos activos, el código propuesto y los periodos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const o = await opcionesDeFicha(b.admin, { sql: tx, ahora: new Date("2026-11-10T15:00:00Z") });
      expect(o.codigosPropuestos[b.procesoId]).toBe(await proponerCodigo(b.procesoId, { sql: tx }));
      expect(o.tipos.map((t) => t.nombre)).toContain("Eficacia");
      expect(o.clasificaciones.find((c) => c.nombre === "Regulatorio")?.exigeNorma).toBe(true);
      expect(o.unidades.find((u) => u.nombre === "Porcentaje")).toMatchObject({ sufijo: " %", decimales: 1 });
      expect(o.usuarioActual).toBe(b.admin.usuarioId);
      expect(o.normas.every((n) => n.estado === "vigente" || n.estado === "modificada")).toBe(true);
      expect(o.documentos.every((d) => d.procesoIds.every((p) => typeof p === "number"))).toBe(true);
      expect(o.periodoEnCurso).toEqual({ mensual: "2026-11", bimestral: "2026-B6", trimestral: "2026-T4", semestral: "2026-S2", anual: "2026" });
      expect(o.periodos.trimestral.map((p) => p.clave)).toEqual(["2025-T1", "2025-T2", "2025-T3", "2025-T4", "2026-T1", "2026-T2", "2026-T3", "2026-T4"]);
      expect(o.periodos.trimestral.at(-1)).toEqual({ clave: "2026-T4", etiqueta: "Cuarto trimestre de 2026" });
      expect(o.cargos.map((c) => c.id)).toContain(b.cargoId);

      // Un cargo inactivo deja de ofrecerse, salvo en la versión que ya lo usa.
      await tx`UPDATE cargos SET activo = false WHERE id = ${b.cargoId}`;
      expect((await opcionesDeFicha(b.admin, { sql: tx })).cargos.map((c) => c.id)).not.toContain(b.cargoId);
      expect((await opcionesDeFicha(b.admin, { sql: tx, actuales: { cargosMedir: [b.cargoId] } })).cargos.map((c) => c.id)).toContain(b.cargoId);
      await rechaza(crearIndicador(b.admin, datos(b), { sql: tx }), "Los cargos responsables deben existir y estar activos");
    }));

  it("la lista básica muestra lo que la persona ve", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const general = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const restringido = await indicadorDePrueba(tx, { procesoId: b.procesoId, nivelAcceso: "restringido" });
      const propio = await indicadorDePrueba(tx, { nivelAcceso: "restringido", mide: [consulta.usuarioId] });
      const borrador = await crearIndicador(b.admin, datos(b, { nombre: "Ficha nueva sin aprobar" }), { sql: tx });
      // Un cambio en curso sobre una ficha aprobada no se asoma a quien no administra.
      const cambio = await abrirCambio(b.admin, general.id, { sql: tx });
      await guardarBorrador(b.admin, cambio.versionId, datos(b, { nombre: "Nombre del cambio sin aprobar" }), { sql: tx });

      const deConsulta = await listarIndicadoresBasico(consulta, { sql: tx });
      const codigos = deConsulta.map((f) => f.codigo);
      expect(codigos).toContain(general.codigo);
      expect(codigos).toContain(propio.codigo);
      expect(codigos).not.toContain(restringido.codigo);
      expect(codigos).not.toContain(borrador.codigo);
      expect(deConsulta.find((f) => f.codigo === general.codigo)).toEqual({
        id: general.id,
        codigo: general.codigo,
        nombre: `Indicador de prueba ${general.codigo}`,
        proceso: b.procesoNombre,
        estado: "activo",
        versionEstado: "aprobada",
      });

      const deAdmin = await listarIndicadoresBasico(b.admin, { sql: tx });
      expect(deAdmin.map((f) => f.codigo)).toEqual(expect.arrayContaining([general.codigo, restringido.codigo, propio.codigo, borrador.codigo]));
      expect(deAdmin.find((f) => f.codigo === borrador.codigo)).toMatchObject({ nombre: "Ficha nueva sin aprobar", estado: "borrador", versionEstado: "borrador" });
      expect(deAdmin.find((f) => f.codigo === general.codigo)).toMatchObject({ nombre: `Indicador de prueba ${general.codigo}`, versionEstado: "borrador" });
    }));
});
