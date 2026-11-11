/**
 * Aprobación de la ficha de indicador (Fase 14A, Tarea 7): enviar con la firma «Elaboró», aprobar con «Aprobó» (también
 * en bloque, todo o nada), devolver, descartar el borrador de un cambio, cambios menores y mayores, qué versión rige
 * cada periodo y el control de cambios. Contra la BD de desarrollo, dentro de una transacción que se revierte: ninguna
 * ficha aprobada queda confirmada.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import { ErrorFirma, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  aprobarFichas,
  descartarBorrador,
  devolverFicha,
  enviarAAprobacion,
  fichaDeVersion,
  fichasEnCurso,
  fichasPorAprobar,
  rigeDesdePorOmision,
  versionesDe,
  versionesVisibles,
  versionQueRige,
  versionVigente,
} from "@/db/consultas/indicadores/aprobacion";
import { abrirCambio, contenidoDeVersion, crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { huellaDeFicha } from "@/lib/indicadores/ficha";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import type { Verificador } from "@/lib/firma";
import { ErrorPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { documentoLibre, sesionAdmin, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

/** Hoy, a efectos de la prueba: el cuarto trimestre de 2026 está en curso. */
const AHORA = new Date("2026-11-10T15:00:00Z");
const CLAVE = { clave: "ok" };

type Base = {
  admin: SesionFlujo;
  sgc: number;
  tipoId: number;
  operativo: number;
  estrategico: number;
  porcentaje: number;
  cargoId: number;
};

async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [op] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Operativo'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    sgc: Number(p.id),
    tipoId: Number(t.id),
    operativo: Number(op.id),
    estrategico: Number(es.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

/** Un proceso que solo existe en la transacción: sus líderes son los que la prueba le asigne. */
async function procesoNuevo(tx: TransactionSql): Promise<number> {
  const sigla = `Z${unico()}`;
  const [macro] = await tx`SELECT id FROM macroprocesos ORDER BY id LIMIT 1`;
  const [p] = await tx`INSERT INTO procesos (macroproceso_id, nombre, sigla, slug, icono, orden)
    VALUES (${macro.id}, ${`Proceso ${sigla}`}, ${sigla}, ${sigla.toLowerCase()}, 'circle', 99) RETURNING id`;
  return Number(p.id);
}

/** Una ficha de forma «porcentaje», trimestral desde 2026-T1, ya probada con valores de ejemplo. */
const datos = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.sgc,
  nombre: "Cumplimiento del plan de capacitación",
  proposito: "Saber si se ejecutan las capacitaciones programadas",
  tipoId: b.tipoId,
  clasificacionId: b.estrategico,
  forma: "porcentaje",
  variables: [
    { letra: "A", nombre: "Capacitaciones ejecutadas", consolidacion: "suma", admiteNegativos: false },
    { letra: "B", nombre: "Capacitaciones programadas", consolidacion: "suma", admiteNegativos: false },
  ],
  unidadId: b.porcentaje,
  decimales: 1,
  periodicidad: "trimestral",
  tendencia: "ascendente",
  meta: "90",
  semaforoModo: "relativo",
  umbralAtencionPct: 70,
  cargosMedir: [b.cargoId],
  cargosAnalizar: [b.cargoId],
  normaIds: [],
  plazoReporteDias: 10,
  inicioMedicion: "2026-T1",
  soporteObligatorio: false,
  nivelAcceso: "general",
  mide: [],
  analiza: [],
  prueba: { valores: { A: "9", B: "10" } },
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

const firmar = (tx: TransactionSql, verificar: Verificador = firmaDePrueba) => ({ sql: tx, ahora: AHORA, verificar });

/** Crea, envía y aprueba (con Gerencia) una ficha estratégica: queda la versión 1 aprobada y el indicador activo. */
async function aprobado(tx: TransactionSql, b: Base, d: DatosFicha = datos(b)) {
  const creado = await crearIndicador(b.admin, d, { sql: tx });
  await enviarAAprobacion(b.admin, { versionId: creado.versionId, credenciales: CLAVE }, firmar(tx));
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  await aprobarFichas(gerente, { versionIds: [creado.versionId], credenciales: CLAVE }, firmar(tx));
  return { ...creado, gerente };
}

/** Un cambio sobre la ficha aprobada, guardado con `d` y enviado; devuelve la versión nueva. */
async function cambio(tx: TransactionSql, b: Base, indicadorId: number, d: DatosFicha) {
  const { versionId } = await abrirCambio(b.admin, indicadorId, { sql: tx });
  await guardarBorrador(b.admin, versionId, d, { sql: tx });
  return versionId;
}

/** Una medición reportada (o en otro estado) del periodo, con la versión que congeló. */
async function medicion(tx: TransactionSql, indicadorId: number, versionId: number, periodo: string, estado = "reportada") {
  const p = periodoDe(periodo, zonaHoraria())!;
  await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado)
    VALUES (${indicadorId}, ${versionId}, ${periodo}, ${p.desde}, ${p.hasta}, ${p.hasta}, ${estado})`;
}

const firmasDe = (tx: TransactionSql, versionId: number) =>
  tx`SELECT firma, tramite_id, version_id, ronda, indicador_version_id, hash_sha256, usuario_id
    FROM firmas WHERE indicador_version_id = ${versionId} ORDER BY id`;

const avisos = (tx: TransactionSql, tipo: string, indicadorId: number) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
    WHERE tipo = ${tipo} AND entidad = 'indicador' AND entidad_id = ${indicadorId} ORDER BY usuario_id`;

describe("enviar a aprobación", () => {
  it("enviar firma «Elaboró» sobre la huella de la ficha y deja la versión por aprobar", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const proceso = await procesoNuevo(tx);
      const lider1 = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso] });
      const lider2 = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso] });
      const { indicadorId, versionId, codigo } = await crearIndicador(b.admin, datos(b, { procesoId: proceso, clasificacionId: b.operativo }), {
        sql: tx,
      });
      const huella = huellaDeFicha(await contenidoDeVersion(tx, versionId));

      expect(await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx))).toEqual({ codigo, menor: false });

      const firmas = await firmasDe(tx, versionId);
      expect(firmas.map((f) => ({ ...f, indicador_version_id: Number(f.indicador_version_id), usuario_id: Number(f.usuario_id) }))).toEqual([
        {
          firma: "elaboro",
          tramite_id: null,
          version_id: null,
          ronda: 0,
          indicador_version_id: versionId,
          hash_sha256: huella,
          usuario_id: b.admin.usuarioId,
        },
      ]);
      const [v] = await tx`SELECT estado, huella, tipo_cambio, rige_desde, elaborada_por, elaborada_en FROM indicador_versiones WHERE id = ${versionId}`;
      expect({ ...v, elaborada_por: Number(v.elaborada_por) }).toEqual({
        estado: "por_aprobar",
        huella,
        tipo_cambio: "inicial",
        rige_desde: "2026-T1",
        elaborada_por: b.admin.usuarioId,
        elaborada_en: AHORA,
      });
      const [i] = await tx`SELECT estado FROM indicadores WHERE id = ${indicadorId}`;
      expect(i.estado).toBe("borrador");

      const enviados = await avisos(tx, "indicadores.por_aprobar", indicadorId);
      expect(enviados.map((a) => Number(a.usuario_id))).toEqual([lider1.usuarioId, lider2.usuarioId].sort((x, y) => x - y));
      expect(enviados[0].titulo).toContain(codigo);
      const [bitacora] = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'indicador' AND entidad_id = ${indicadorId}
        AND accion = 'indicador_enviado'`;
      expect(bitacora.detalle).toMatchObject({ codigo, versionId, numero: 1, tipoCambio: "inicial", rigeDesde: "2026-T1" });

      // Dos pestañas: la segunda vez la ficha ya no está en borrador.
      await rechaza(enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx)), "Solo se envía una ficha en borrador");
    }));

  it("no se envía sin haber probado la fórmula, ni con la clave mala", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const sinPrueba = await crearIndicador(b.admin, datos(b, { prueba: undefined }), { sql: tx });
      // F13A-R4: lo que puede fallar se dice antes de pedir la clave.
      let verificaciones = 0;
      const contar: Verificador = async (...args) => {
        verificaciones += 1;
        return firmaDePrueba(...args);
      };
      await rechaza(
        enviarAAprobacion(b.admin, { versionId: sinPrueba.versionId, credenciales: CLAVE }, firmar(tx, contar)),
        "Pruebe la fórmula con valores de ejemplo antes de enviarla",
      );
      expect(verificaciones).toBe(0);

      const probada = await crearIndicador(b.admin, datos(b), { sql: tx });
      const err = await enviarAAprobacion(b.admin, { versionId: probada.versionId, credenciales: { clave: "mala" } }, firmar(tx)).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(ErrorFirma);
      expect(await firmasDe(tx, probada.versionId)).toEqual([]);
      const [v] = await tx`SELECT estado, huella FROM indicador_versiones WHERE id = ${probada.versionId}`;
      expect(v).toEqual({ estado: "borrador", huella: null });

      // Solo quien administra envía.
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      await expect(enviarAAprobacion(lider, { versionId: probada.versionId, credenciales: CLAVE }, firmar(tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await rechaza(enviarAAprobacion(b.admin, { versionId: 999_999_999, credenciales: CLAVE }, firmar(tx)), "La ficha no existe");
    }));
});

describe("aprobar", () => {
  it("aprueba Gerencia un estratégico: firma «Aprobó», versión aprobada, indicador activo, rige desde el inicio de medición", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { indicadorId, versionId, codigo } = await crearIndicador(b.admin, datos(b, { inicioMedicion: "2026-T2" }), { sql: tx });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      const [{ huella }] = await tx`SELECT huella FROM indicador_versiones WHERE id = ${versionId}`;
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });

      expect((await fichasPorAprobar(gerente, { sql: tx })).find((f) => f.versionId === versionId)).toMatchObject({
        codigo,
        nombre: "Cumplimiento del plan de capacitación",
        tipoCambio: "inicial",
        cambios: [],
        enviadaEn: AHORA,
      });
      expect(await aprobarFichas(gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx))).toEqual({ aprobadas: 1 });

      const firmas = await firmasDe(tx, versionId);
      expect(firmas.map((f) => [f.firma, f.hash_sha256, Number(f.usuario_id), f.tramite_id, f.version_id, f.ronda])).toEqual([
        ["elaboro", huella, b.admin.usuarioId, null, null, 0],
        ["aprobo", huella, gerente.usuarioId, null, null, 0],
      ]);
      const [v] = await tx`SELECT estado, aprobada_por, aprobada_en, rige_desde FROM indicador_versiones WHERE id = ${versionId}`;
      expect({ ...v, aprobada_por: Number(v.aprobada_por) }).toEqual({
        estado: "aprobada",
        aprobada_por: gerente.usuarioId,
        aprobada_en: AHORA,
        rige_desde: "2026-T2",
      });
      const [i] = await tx`SELECT estado FROM indicadores WHERE id = ${indicadorId}`;
      expect(i.estado).toBe("activo");
      expect(await versionVigente(tx, indicadorId)).toEqual({ id: versionId, numero: 1 });
      expect((await avisos(tx, "indicadores.aprobada", indicadorId)).map((a) => Number(a.usuario_id))).toEqual([b.admin.usuarioId]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_aprobado' AND entidad_id = ${indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ codigo, versionId, numero: 1 });
      expect((await fichasPorAprobar(gerente, { sql: tx })).map((f) => f.versionId)).not.toContain(versionId);
    }));

  it("un operativo lo aprueba el líder del proceso; sin líder, Gerencia; nunca quien elaboró ni un líder de otro proceso", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const conLider = await procesoNuevo(tx);
      const otro = await procesoNuevo(tx);
      const sinLider = await procesoNuevo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [conLider] });
      const ajeno = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [otro] });
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const NO_LE_TOCA = "La ficha no existe o no le corresponde aprobarla";

      const operativo = await crearIndicador(b.admin, datos(b, { procesoId: conLider, clasificacionId: b.operativo }), { sql: tx });
      await enviarAAprobacion(b.admin, { versionId: operativo.versionId, credenciales: CLAVE }, firmar(tx));
      expect((await fichasPorAprobar(lider, { sql: tx })).map((f) => f.versionId)).toContain(operativo.versionId);
      expect((await fichasPorAprobar(ajeno, { sql: tx })).map((f) => f.versionId)).not.toContain(operativo.versionId);
      expect((await fichasPorAprobar(gerente, { sql: tx })).map((f) => f.versionId)).not.toContain(operativo.versionId);
      expect(await fichasPorAprobar(b.admin, { sql: tx })).toEqual([]);

      await rechaza(aprobarFichas(gerente, { versionIds: [operativo.versionId], credenciales: CLAVE }, firmar(tx)), NO_LE_TOCA);
      await rechaza(aprobarFichas(ajeno, { versionIds: [operativo.versionId], credenciales: CLAVE }, firmar(tx)), NO_LE_TOCA);
      // Quien elabora es siempre un Admin SGC, que no aprueba.
      await expect(aprobarFichas(b.admin, { versionIds: [operativo.versionId], credenciales: CLAVE }, firmar(tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      await rechaza(aprobarFichas(lider, { versionIds: [999_999_999], credenciales: CLAVE }, firmar(tx)), NO_LE_TOCA);
      expect(await aprobarFichas(lider, { versionIds: [operativo.versionId], credenciales: CLAVE }, firmar(tx))).toEqual({ aprobadas: 1 });

      const huerfano = await crearIndicador(b.admin, datos(b, { procesoId: sinLider, clasificacionId: b.operativo }), { sql: tx });
      await enviarAAprobacion(b.admin, { versionId: huerfano.versionId, credenciales: CLAVE }, firmar(tx));
      await rechaza(aprobarFichas(lider, { versionIds: [huerfano.versionId], credenciales: CLAVE }, firmar(tx)), NO_LE_TOCA);
      expect(await aprobarFichas(gerente, { versionIds: [huerfano.versionId], credenciales: CLAVE }, firmar(tx))).toEqual({ aprobadas: 1 });
    }));

  it("en bloque es todo o nada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const fichas = [];
      for (let n = 0; n < 3; n++) {
        const f = await crearIndicador(b.admin, datos(b, { nombre: `Ficha en bloque ${n}` }), { sql: tx });
        await enviarAAprobacion(b.admin, { versionId: f.versionId, credenciales: CLAVE }, firmar(tx));
        fichas.push(f);
      }
      const ids = fichas.map((f) => f.versionId);
      const aprobos = async () => {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM firmas WHERE firma = 'aprobo' AND indicador_version_id IN ${tx(ids)}`;
        return n as number;
      };

      // La segunda se aprobó entre tanto (otra pestaña).
      await aprobarFichas(gerente, { versionIds: [ids[1]], credenciales: CLAVE }, firmar(tx));
      expect(await aprobos()).toBe(1);
      let verificaciones = 0;
      const contar: Verificador = async (...args) => {
        verificaciones += 1;
        return firmaDePrueba(...args);
      };
      await rechaza(
        aprobarFichas(gerente, { versionIds: ids, credenciales: CLAVE }, firmar(tx, contar)),
        `La ficha ${fichas[1].codigo} ya no está por aprobar`,
      );
      // Se rechaza antes de pedir la clave y sin firmar ninguna.
      expect(verificaciones).toBe(0);
      expect(await aprobos()).toBe(1);
      const estados = await tx`SELECT id, estado FROM indicador_versiones WHERE id IN ${tx(ids)} ORDER BY id`;
      expect(estados.map((e) => e.estado)).toEqual(["por_aprobar", "aprobada", "por_aprobar"]);

      // Las que quedan, con una sola clave: el código del segundo factor no se pide dos veces.
      expect(await aprobarFichas(gerente, { versionIds: [ids[2], ids[0], ids[2]], credenciales: CLAVE }, firmar(tx, contar))).toEqual({
        aprobadas: 2,
      });
      expect(verificaciones).toBe(1);
      expect(await aprobos()).toBe(3);
      await rechaza(aprobarFichas(gerente, { versionIds: [], credenciales: CLAVE }, firmar(tx)), "Elija al menos una ficha");
    }));

  it("aprobar dos veces la misma ficha", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { versionId, codigo } = await crearIndicador(b.admin, datos(b), { sql: tx });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const otroGerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      await aprobarFichas(gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx));
      await rechaza(aprobarFichas(otroGerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx)), `La ficha ${codigo} ya no está por aprobar`);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM firmas WHERE firma = 'aprobo' AND indicador_version_id = ${versionId}`;
      expect(n).toBe(1);
    }));

  it("aprobar comprueba que la ficha no cambió después de la firma de quien la elaboró", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { versionId, codigo } = await crearIndicador(b.admin, datos(b), { sql: tx });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      await tx`UPDATE indicador_versiones SET nombre = 'Cambiado por fuera' WHERE id = ${versionId}`;
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      await rechaza(
        aprobarFichas(gerente, { versionIds: [versionId], credenciales: CLAVE }, firmar(tx)),
        `La ficha ${codigo} cambió después de la firma de quien la elaboró`,
      );
    }));
});

describe("devolver y descartar", () => {
  it("devolver exige nota, vuelve a borrador y avisa a quien elaboró", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const { indicadorId, versionId, codigo } = await crearIndicador(b.admin, datos(b), { sql: tx });
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });

      await rechaza(devolverFicha(gerente, { versionId, nota: " no " }, { sql: tx }), "La nota debe tener al menos 5 caracteres");
      await rechaza(devolverFicha(lider, { versionId, nota: "Falta el sustento" }, { sql: tx }), "La ficha no existe o no le corresponde aprobarla");
      const nota = "Falta el sustento de la meta";
      await devolverFicha(gerente, { versionId, nota: `  ${nota} ` }, { sql: tx, ahora: AHORA });

      const [v] = await tx`SELECT estado, nota_devolucion, huella FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toEqual({ estado: "borrador", nota_devolucion: nota, huella: null });
      const devueltas = await avisos(tx, "indicadores.devuelta", indicadorId);
      expect(devueltas.map((a) => [Number(a.usuario_id), a.cuerpo])).toEqual([[b.admin.usuarioId, nota]]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_devuelto' AND entidad_id = ${indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ codigo, versionId, numero: 1, nota });
      expect((await fichasEnCurso(b.admin, { sql: tx })).find((f) => f.versionId === versionId)).toMatchObject({
        codigo,
        estado: "borrador",
        nota,
      });
      expect(await fichasEnCurso(gerente, { sql: tx })).toEqual([]);
      await rechaza(devolverFicha(gerente, { versionId, nota }, { sql: tx }), `La ficha ${codigo} ya no está por aprobar`);

      // Se corrige y se vuelve a enviar: otra firma «Elaboró» y la nota ya no está.
      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      const [otra] = await tx`SELECT estado, nota_devolucion FROM indicador_versiones WHERE id = ${versionId}`;
      expect(otra).toEqual({ estado: "por_aprobar", nota_devolucion: null });
      expect((await firmasDe(tx, versionId)).map((f) => f.firma)).toEqual(["elaboro", "elaboro"]);
    }));

  it("descartar el borrador de un cambio deja la ficha vigente como estaba", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      const huella = huellaDeFicha(await contenidoDeVersion(tx, ind.versionId));
      const v2 = await cambio(tx, b, ind.indicadorId, { ...d, meta: "80", motivoCambio: "Meta más realista" });

      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.sgc] });
      await expect(descartarBorrador(lider, v2, { sql: tx })).rejects.toBeInstanceOf(ErrorPermiso);
      await descartarBorrador(b.admin, v2, { sql: tx, ahora: AHORA });
      const [v] = await tx`SELECT estado FROM indicador_versiones WHERE id = ${v2}`;
      expect(v.estado).toBe("descartada");
      expect(await versionVigente(tx, ind.indicadorId)).toEqual({ id: ind.versionId, numero: 1 });
      expect(huellaDeFicha(await contenidoDeVersion(tx, ind.versionId))).toBe(huella);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_borrador_descartado' AND entidad_id = ${ind.indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ codigo: ind.codigo, versionId: v2, numero: 2 });

      // Un cambio nuevo toma el número siguiente: los números no se reusan.
      const { versionId: v3 } = await abrirCambio(b.admin, ind.indicadorId, { sql: tx });
      const [tercera] = await tx`SELECT numero FROM indicador_versiones WHERE id = ${v3}`;
      expect(tercera.numero).toBe(3);

      await rechaza(descartarBorrador(b.admin, ind.versionId, { sql: tx }), "Solo se descarta una ficha en borrador");
      await rechaza(descartarBorrador(b.admin, v2, { sql: tx }), "Solo se descarta una ficha en borrador");
      const nuevo = await crearIndicador(b.admin, datos(b), { sql: tx });
      await rechaza(
        descartarBorrador(b.admin, nuevo.versionId, { sql: tx }),
        "La ficha de un indicador nuevo no se descarta aquí: descarte o borre el indicador",
      );
    }));
});

describe("cambios sobre una ficha aprobada", () => {
  it("un cambio menor lo publica quien elabora, sin aprobador, y no toca las mediciones", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T1");
      const v2 = await cambio(tx, b, ind.indicadorId, { ...d, nombre: "Capacitaciones del plan cumplidas" });
      const avisadosAntes = (await avisos(tx, "indicadores.por_aprobar", ind.indicadorId)).length;

      await rechaza(enviarAAprobacion(b.admin, { versionId: v2, credenciales: CLAVE }, firmar(tx)), "Escriba el motivo del cambio");
      expect(
        await enviarAAprobacion(b.admin, { versionId: v2, motivo: "Aclarar el nombre", credenciales: CLAVE }, firmar(tx)),
      ).toEqual({ codigo: ind.codigo, menor: true });

      const [v] = await tx`SELECT estado, tipo_cambio, aprobada_por, rige_desde, motivo_cambio, numero FROM indicador_versiones WHERE id = ${v2}`;
      expect(v).toEqual({ estado: "aprobada", tipo_cambio: "menor", aprobada_por: null, rige_desde: "2026-T1", motivo_cambio: "Aclarar el nombre", numero: 2 });
      expect((await firmasDe(tx, v2)).map((f) => f.firma)).toEqual(["elaboro"]);
      const mediciones = await tx`SELECT version_id FROM mediciones WHERE indicador_id = ${ind.indicadorId}`;
      expect(mediciones.map((m) => Number(m.version_id))).toEqual([ind.versionId]);
      // Nadie recibe «por aprobar»: el cambio menor no tiene aprobador.
      expect(await avisos(tx, "indicadores.por_aprobar", ind.indicadorId)).toHaveLength(avisadosAntes);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_cambio_menor' AND entidad_id = ${ind.indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ codigo: ind.codigo, versionId: v2, numero: 2, motivo: "Aclarar el nombre" });
      expect(await versionVigente(tx, ind.indicadorId)).toEqual({ id: v2, numero: 2 });

      // Sin nada que cambie no hay qué enviar.
      const { versionId: v3 } = await abrirCambio(b.admin, ind.indicadorId, { sql: tx });
      await rechaza(enviarAAprobacion(b.admin, { versionId: v3, motivo: "Nada", credenciales: CLAVE }, firmar(tx)), "No hay cambios que enviar");
    }));

  it("un cambio mayor va a aprobación y rige desde un periodo sin reporte", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T1");
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T2");
      // Una medición abierta no es un reporte.
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T3", "abierta");
      const v2 = await cambio(tx, b, ind.indicadorId, { ...d, meta: "85", motivoCambio: "La meta de 90 no es alcanzable este año" });
      const enviar = (rigeDesde?: string) => enviarAAprobacion(b.admin, { versionId: v2, rigeDesde, credenciales: CLAVE }, firmar(tx));

      await rechaza(enviar("2026-T2"), "Ese periodo ya tiene una medición reportada");
      await rechaza(enviar("2027-T1"), "Una versión no puede regir desde un periodo que no ha empezado");
      await rechaza(enviar("2026-T1"), "Ese periodo ya tiene una medición reportada");
      await rechaza(enviar("2026-09"), "«Rige desde» debe ser un periodo trimestral");
      await rechaza(enviar("2025-T4"), "Hay mediciones reportadas después de ese periodo: elija uno posterior");
      expect(await firmasDe(tx, v2)).toEqual([]);

      expect(await rigeDesdePorOmision(tx, ind.indicadorId, "trimestral", AHORA)).toBe("2026-T3");
      expect(await enviar()).toEqual({ codigo: ind.codigo, menor: false });
      const [v] = await tx`SELECT estado, tipo_cambio, rige_desde FROM indicador_versiones WHERE id = ${v2}`;
      expect(v).toEqual({ estado: "por_aprobar", tipo_cambio: "mayor", rige_desde: "2026-T3" });
      expect((await fichasPorAprobar(ind.gerente, { sql: tx })).find((f) => f.versionId === v2)).toMatchObject({ tipoCambio: "mayor", cambios: ["Meta"] });

      await aprobarFichas(ind.gerente, { versionIds: [v2], credenciales: CLAVE }, firmar(tx));
      const [aprobada] = await tx`SELECT estado, rige_desde FROM indicador_versiones WHERE id = ${v2}`;
      expect(aprobada).toEqual({ estado: "aprobada", rige_desde: "2026-T3" });
    }));

  it("rigeDesdePorOmision: el primero sin reporte, nunca uno que no ha empezado", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      // Sin reportes: el primer periodo del indicador.
      expect(await rigeDesdePorOmision(tx, ind.indicadorId, "trimestral", AHORA)).toBe("2026-T1");
      // Con otra periodicidad, el periodo que no se cruza con lo reportado.
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T1", "cerrada");
      expect(await rigeDesdePorOmision(tx, ind.indicadorId, "mensual", AHORA)).toBe("2026-04");
      expect(await rigeDesdePorOmision(tx, ind.indicadorId, "semestral", AHORA)).toBe("2026-S2");
      // Todo reportado hasta el periodo en curso: el en curso, aunque la validación lo rechace al enviar.
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T4");
      expect(await rigeDesdePorOmision(tx, ind.indicadorId, "trimestral", AHORA)).toBe("2026-T4");
      const futuro = await aprobado(tx, b, { ...d, inicioMedicion: "2027-T1" });
      expect(await rigeDesdePorOmision(tx, futuro.indicadorId, "trimestral", AHORA)).toBe("2026-T4");
    }));

  it("versionQueRige y versionVigente", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const nuevo = await crearIndicador(b.admin, d, { sql: tx });
      expect(await versionVigente(tx, nuevo.indicadorId)).toBeNull();
      expect(await versionQueRige(tx, nuevo.indicadorId, "2026-T1")).toBeNull();

      const ind = await aprobado(tx, b, d);
      // Con solo la versión 1, un histórico anterior al inicio también lo rige ella.
      expect(await versionQueRige(tx, ind.indicadorId, "2025-T2")).toBe(ind.versionId);
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T1");
      await medicion(tx, ind.indicadorId, ind.versionId, "2026-T2");
      const v2 = await cambio(tx, b, ind.indicadorId, { ...d, meta: "85", motivoCambio: "Otra meta" });
      await enviarAAprobacion(b.admin, { versionId: v2, rigeDesde: "2026-T3", credenciales: CLAVE }, firmar(tx));
      // Por aprobar todavía no rige.
      expect(await versionQueRige(tx, ind.indicadorId, "2026-T3")).toBe(ind.versionId);
      await aprobarFichas(ind.gerente, { versionIds: [v2], credenciales: CLAVE }, firmar(tx));

      expect(await versionQueRige(tx, ind.indicadorId, "2026-T2")).toBe(ind.versionId);
      expect(await versionQueRige(tx, ind.indicadorId, "2026-T3")).toBe(v2);
      expect(await versionQueRige(tx, ind.indicadorId, "2026-T4")).toBe(v2);
      expect(await versionQueRige(tx, ind.indicadorId, "2025-T4")).toBe(ind.versionId);
      expect(await versionVigente(tx, ind.indicadorId)).toEqual({ id: v2, numero: 2 });
    }));

  it("un cambio menor rige para los mismos periodos que la versión que reemplaza", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      const v2 = await cambio(tx, b, ind.indicadorId, { ...d, proposito: "Saber si el plan de capacitación se cumple", motivoCambio: "Redacción" });
      await enviarAAprobacion(b.admin, { versionId: v2, credenciales: CLAVE }, firmar(tx));
      const [v] = await tx`SELECT rige_desde FROM indicador_versiones WHERE id = ${v2}`;
      expect(v.rige_desde).toBe("2026-T1");
      expect(await versionQueRige(tx, ind.indicadorId, "2026-T2")).toBe(v2);
      expect(await versionQueRige(tx, ind.indicadorId, "2026-T1")).toBe(v2);
    }));

  it("el control de cambios dice qué cambió y por qué", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      const motivo = "La meta de 90 no es alcanzable este año";
      const v2 = await cambio(tx, b, ind.indicadorId, { ...d, meta: "85", motivoCambio: motivo });
      await enviarAAprobacion(b.admin, { versionId: v2, credenciales: CLAVE }, firmar(tx));
      await aprobarFichas(ind.gerente, { versionIds: [v2], credenciales: CLAVE }, firmar(tx));
      // Un cambio en curso no aparece en el control de cambios.
      await cambio(tx, b, ind.indicadorId, { ...d, meta: "70", motivoCambio: "Otra" });

      const [admin] = await tx`SELECT nombre FROM usuarios WHERE id = ${b.admin.usuarioId}`;
      const [gerente] = await tx`SELECT nombre FROM usuarios WHERE id = ${ind.gerente.usuarioId}`;
      const versiones = await versionesDe(ind.indicadorId, { sql: tx });
      expect(versiones).toHaveLength(2);
      expect(versiones[0]).toMatchObject({
        id: v2,
        numero: 2,
        tipoCambio: "mayor",
        rigeDesde: "2026-T1",
        cambios: ["Meta"],
        motivo,
        elaboro: admin.nombre,
        elaboradaEn: AHORA,
        aprobo: gerente.nombre,
        aprobadaEn: AHORA,
      });
      expect(versiones[1]).toMatchObject({ id: ind.versionId, numero: 1, tipoCambio: "inicial", cambios: [], aprobo: gerente.nombre });
    }));

  it("el proceso y el código quedan fijos desde la primera aprobación", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const [sub] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden)
        VALUES (${b.sgc}, 'Subproceso de prueba', ${`zz-${unico()}`}, 99) RETURNING id`;
      const d = datos(b);
      const ind = await aprobado(tx, b, d);
      const { versionId } = await abrirCambio(b.admin, ind.indicadorId, { sql: tx });
      const otro = await procesoNuevo(tx);
      const FIJOS = "El proceso y el código quedan fijos desde la primera aprobación";
      await rechaza(guardarBorrador(b.admin, versionId, { ...d, procesoId: otro }, { sql: tx }), FIJOS);
      await rechaza(guardarBorrador(b.admin, versionId, { ...d, codigo: `${ind.codigo}X` }, { sql: tx }), FIJOS);
      await guardarBorrador(b.admin, versionId, { ...d, codigo: ind.codigo, subprocesoId: Number(sub.id), motivoCambio: "Subproceso" }, { sql: tx });
      const [v] = await tx`SELECT tipo_cambio, subproceso_nombre FROM indicador_versiones WHERE id = ${versionId}`;
      expect(v).toEqual({ tipo_cambio: "menor", subproceso_nombre: "Subproceso de prueba" });
      expect(await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx))).toEqual({ codigo: ind.codigo, menor: true });
    }));
});

describe("lo que cada persona ve de la ficha", () => {
  it("la ficha no nombra el procedimiento enlazado a quien no puede ver ese documento", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const doc = await documentoLibre(tx, { proceso: "SGC", tipo: "PR" });
      await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${doc.id}`;
      const ind = await aprobado(tx, b, datos(b, { procedimientoDocumentoId: doc.id, puntoControl: "PC-13" }));

      const ajeno = await usuarioDePrueba(tx, { rol: "consulta" });
      const deAjeno = await fichaDeVersion(ajeno, ind.versionId, { sql: tx });
      expect(deAjeno).not.toBeNull();
      expect(deAjeno!.procedimiento).toBeNull();
      expect(deAjeno!.contenido.procedimientoDocumentoId).toBeNull();
      expect(JSON.stringify(deAjeno)).not.toContain(doc.codigo);
      expect(deAjeno!.contenido.puntoControl).toBe("PC-13");

      const delProceso = await usuarioDePrueba(tx, { rol: "consulta", procesos: [b.sgc] });
      expect((await fichaDeVersion(delProceso, ind.versionId, { sql: tx }))!.procedimiento).toEqual({ id: doc.id, codigo: doc.codigo, titulo: doc.titulo });
      expect((await fichaDeVersion(b.admin, ind.versionId, { sql: tx }))!.procedimiento).toMatchObject({ codigo: doc.codigo });
    }));

  it("las firmas de la ficha salen de la tabla de firmas", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const ind = await aprobado(tx, b);
      const [admin] = await tx`SELECT nombre FROM usuarios WHERE id = ${b.admin.usuarioId}`;
      const ficha = await fichaDeVersion(ind.gerente, ind.versionId, { sql: tx });
      expect(ficha!.firmas.elaboro).toMatchObject({ nombre: admin.nombre, fecha: AHORA });
      expect(ficha!.firmas.aprobo).toMatchObject({ fecha: AHORA });
      // El nombre queda congelado: cambiar el del usuario no cambia la firma.
      await tx`UPDATE usuarios SET nombre = 'Otro nombre' WHERE id = ${b.admin.usuarioId}`;
      expect((await fichaDeVersion(ind.gerente, ind.versionId, { sql: tx }))!.firmas.elaboro!.nombre).toBe(admin.nombre);
    }));

  it("una ficha por aprobar la ve quien debe aprobarla; para los demás no existe", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const proceso = await procesoNuevo(tx);
      const lider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [proceso] });
      const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const { indicadorId, versionId } = await crearIndicador(b.admin, datos(b, { procesoId: proceso, clasificacionId: b.operativo }), {
        sql: tx,
      });
      // En borrador: solo quien administra.
      expect((await versionesVisibles(lider, indicadorId, { sql: tx })).versiones).toEqual([]);
      expect(await fichaDeVersion(lider, versionId, { sql: tx })).toBeNull();
      expect((await versionesVisibles(b.admin, indicadorId, { sql: tx })).versiones.map((v) => v.estado)).toEqual(["borrador"]);

      await enviarAAprobacion(b.admin, { versionId, credenciales: CLAVE }, firmar(tx));
      expect(await versionesVisibles(lider, indicadorId, { sql: tx })).toEqual({
        ve: false,
        versiones: [{ id: versionId, numero: 1, estado: "por_aprobar", aprueba: true }],
      });
      expect((await fichaDeVersion(lider, versionId, { sql: tx }))!.aprueba).toBe(true);
      for (const nadie of [gerente, consulta]) {
        expect((await versionesVisibles(nadie, indicadorId, { sql: tx })).versiones).toEqual([]);
        expect(await fichaDeVersion(nadie, versionId, { sql: tx })).toBeNull();
      }
      expect((await fichaDeVersion(b.admin, versionId, { sql: tx }))!.aprueba).toBe(false);
    }));
});
