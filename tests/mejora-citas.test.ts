/**
 * Los hallazgos en las otras páginas (Fase 15B, Tarea 13; anexo §10.1, §10.2 y §10.5, maqueta 8): los que citan un documento, un
 * proceso, un subproceso, un indicador o una norma, solo los que la persona ve (`filtroHallazgos`), los no terminados primero y hasta
 * diez; el botón («Abrir hallazgo» con la regla del registro, `puedeRegistrarEn`, o «Reportar»); y cuántos sin terminar apuntan a cada
 * objetivo. Review Focus 6: el rol Consulta no ve ni lista, ni conteo, ni un cero; solo «Reportar». Contra la BD de trabajo, dentro de
 * una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { Objetivos } from "@/componentes/indicadores/Objetivos";
import { SeccionMejoramiento } from "@/componentes/mejoramiento/enganches/SeccionMejoramiento";
import { FiltrosDeHallazgos } from "@/componentes/mejoramiento/FiltrosDeHallazgos";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import type { ObjetivoLeido } from "@/db/consultas/indicadores/objetivos";
import {
  abiertosPorObjetivo,
  CITA_UNA_MEDICION,
  COMO_CRITERIO_DE_EFICACIA,
  COMO_REQUISITO,
  ES_DEL_PROCESO,
  ES_DEL_SUBPROCESO,
  hallazgosQueCitan,
  puedeRegistrarEn,
  SE_REFIERE_AL_DOCUMENTO,
  SE_REFIERE_AL_INDICADOR,
  seccionDeMejoramiento,
  type Cita,
} from "@/db/consultas/mejoramiento/citas";
import { nombresDelFiltro, opcionesDelFiltro } from "@/db/consultas/mejoramiento/opciones";
import { anularPlan } from "@/db/consultas/mejoramiento/planes";
import { anularHallazgo, registrarHallazgo, type DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import { rutaDeRegistro } from "@/lib/mejoramiento/rutas";
import { indicadorDePrueba, type IndicadorDePrueba } from "./utiles/indicadores";
import {
  baseDeMejora,
  c,
  datosDeHallazgo,
  objetivoDePrueba,
  otroProcesoConLider,
  planDeMejoraDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { normaDePrueba } from "./utiles/normograma";
import { documentoLibre, tipoLibre, TIPO_LIBRE } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";
const ahora = new Date(AHORA);

/** Un documento con versión vigente cuyo proceso propietario es `procesoId`. */
async function documentoDe(tx: TransactionSql, procesoId: number, nivel: "general" | "restringido" = "general") {
  await tipoLibre(tx);
  const [{ sigla }] = await tx`SELECT sigla FROM procesos WHERE id = ${procesoId}`;
  const d = await documentoLibre(tx, { proceso: sigla as string, tipo: TIPO_LIBRE });
  if (nivel === "restringido") await tx`UPDATE documentos SET nivel_acceso = 'restringido' WHERE id = ${d.id}`;
  return d;
}

/** Una medición de octubre de 2026 del indicador, ya reportada y con resultado (por SQL, dentro de `revertida`). */
async function medicionConResultado(tx: TransactionSql, ind: IndicadorDePrueba): Promise<number> {
  const [m] = await tx`INSERT INTO mediciones (indicador_id, version_id, periodo, desde, hasta, vence_en, estado, resultado, semaforo)
    VALUES (${ind.id}, ${ind.versionId}, '2026-10', '2026-10-01T05:00:00Z', '2026-11-01T04:59:59.999Z', '2026-11-11T04:59:59.999Z',
      'reportada', 75, 'critico')
    RETURNING id`;
  return Number(m.id);
}

/** Un hallazgo que registra Control Interno en el proceso de la base (o en `procesoId`), con `cambios`. */
async function registrado(tx: TransactionSql, b: BaseDeMejora, cambios?: Partial<DatosDeHallazgo>, procesoId = b.procesoId): Promise<number> {
  return (await registrarHallazgo(b.control, datosDeHallazgo(procesoId, cambios), c(AHORA, tx))).id;
}

const anular = (tx: TransactionSql, b: BaseDeMejora, hallazgoId: number) =>
  anularHallazgo(b.admin, { hallazgoId, justificacion: "Se registró dos veces por error en la auditoría" }, c(AHORA, tx));

const citan = (tx: TransactionSql, sesion: SesionFlujo, que: Cita) => hallazgosQueCitan(sesion, que, { sql: tx, ahora });
const comoDe = (filas: Awaited<ReturnType<typeof citan>>["filas"]) => Object.fromEntries(filas.map((f) => [f.id, f.como]));

/** Lo que la sección pinta, como texto de HTML. */
const pintada = (s: Awaited<ReturnType<typeof seccionDeMejoramiento>>, consolidado?: string) =>
  renderToStaticMarkup(createElement(SeccionMejoramiento, { seccion: s, consolidado }));

describe("hallazgosQueCitan: qué cita cada página", () => {
  it("un documento: el que se refiere a él y el que lo nombra como requisito, cada uno con su «cómo»", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const d = await documentoDe(tx, b.procesoId);
      const otro = await documentoDe(tx, b.procesoId);
      const refiere = await registrado(tx, b, { documentoId: d.id });
      const requisito = await registrado(tx, b, { requisitoDocumentoId: d.id });
      const ajeno = await registrado(tx, b, { documentoId: otro.id });
      // Las dos maneras a la vez: manda el requisito.
      const ambas = await registrado(tx, b, { documentoId: d.id, requisitoDocumentoId: d.id });

      const { filas, hayMas } = await citan(tx, b.control, { documentoId: d.id });
      expect(filas.map((f) => f.id).sort()).toEqual([refiere, requisito, ambas].sort());
      expect(comoDe(filas)).toEqual({ [refiere]: SE_REFIERE_AL_DOCUMENTO, [requisito]: COMO_REQUISITO, [ambas]: COMO_REQUISITO });
      expect(filas.map((f) => f.id)).not.toContain(ajeno);
      expect(hayMas).toBe(false);
      expect(filas[0]).toMatchObject({ estado: "por_aceptar", etiqueta: "Por aceptar", terminado: false });
    });
  });

  it("un indicador: por indicador_id, por una de sus mediciones y como criterio de eficacia de una ronda", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const medicionId = await medicionConResultado(tx, ind);
      const porIndicador = await registrado(tx, b, { indicadorId: ind.id });
      const porMedicion = await registrado(tx, b, { medicionId });
      const porEficacia = await registrado(tx, b);
      // El criterio de eficacia de la ronda 1, por SQL dentro de `revertida`: el camino del dominio pide formular el plan entero.
      await tx`UPDATE mejora_rondas SET indicador_eficacia_id = ${ind.id} WHERE hallazgo_id = ${porEficacia} AND numero = 1`;
      const ajeno = await registrado(tx, b);

      const { filas } = await citan(tx, b.control, { indicadorId: ind.id });
      expect(comoDe(filas)).toEqual({
        [porIndicador]: SE_REFIERE_AL_INDICADOR,
        [porMedicion]: CITA_UNA_MEDICION,
        [porEficacia]: COMO_CRITERIO_DE_EFICACIA,
      });
      expect(filas.map((f) => f.id)).not.toContain(ajeno);
    });
  });

  it("un proceso trae los de ese proceso; un subproceso, solo los de ese subproceso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden)
        VALUES (${b.procesoId}, 'Subproceso de prueba', ${`zz-sub-${Date.now()}`}, 99) RETURNING id`;
      const subprocesoId = Number(s.id);
      const delProceso = await registrado(tx, b);
      const delSubproceso = await registrado(tx, b, { subprocesoId });
      const otro = await otroProcesoConLider(tx);
      const deOtro = await registrado(tx, b, {}, otro.procesoId);

      const proceso = await citan(tx, b.control, { procesoId: b.procesoId });
      expect(comoDe(proceso.filas)).toEqual({ [delProceso]: ES_DEL_PROCESO, [delSubproceso]: ES_DEL_PROCESO });
      expect(proceso.filas.map((f) => f.id)).not.toContain(deOtro);
      const subproceso = await citan(tx, b.control, { subprocesoId });
      expect(comoDe(subproceso.filas)).toEqual({ [delSubproceso]: ES_DEL_SUBPROCESO });
    });
  });

  it("una norma: los que la citan como requisito incumplido", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const n = await normaDePrueba(tx, b.admin);
      const otra = await normaDePrueba(tx, b.admin);
      const cita = await registrado(tx, b, { requisitoNormaId: n.id });
      await registrado(tx, b, { requisitoNormaId: otra.id });
      expect(comoDe((await citan(tx, b.control, { normaId: n.id })).filas)).toEqual({ [cita]: COMO_REQUISITO });
    });
  });

  it("el orden: los no terminados primero, del más reciente al más antiguo; con once, diez y `hayMas`", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const d = await documentoDe(tx, b.procesoId);
      const anulado = await registrado(tx, b, { documentoId: d.id });
      await anular(tx, b, anulado);
      const abiertos = [await registrado(tx, b, { documentoId: d.id }), await registrado(tx, b, { documentoId: d.id })];

      const tres = await citan(tx, b.control, { documentoId: d.id });
      expect(tres.filas.map((f) => f.id)).toEqual([abiertos[1], abiertos[0], anulado]);
      expect(tres.filas[2]).toMatchObject({ estado: "anulado", terminado: true, etiqueta: "Anulado" });
      expect(tres.hayMas).toBe(false);

      for (let i = 0; i < 8; i++) abiertos.push(await registrado(tx, b, { documentoId: d.id }));
      const once = await citan(tx, b.control, { documentoId: d.id });
      expect(once.filas).toHaveLength(10);
      expect(once.filas.every((f) => !f.terminado)).toBe(true);
      expect(once.filas.map((f) => f.id)).toEqual([...abiertos].reverse());
      expect(once.hayMas).toBe(true);
    });
  });

  it("el líder de otro proceso y el usuario de consulta: `filas: []` y `hayMas: false`, también con hallazgos que no ven", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const d = await documentoDe(tx, b.procesoId);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const n = await normaDePrueba(tx, b.admin);
      for (let i = 0; i < 11; i++) await registrado(tx, b, { documentoId: d.id, indicadorId: ind.id, requisitoNormaId: n.id });

      const citas: Cita[] = [{ documentoId: d.id }, { indicadorId: ind.id }, { normaId: n.id }, { procesoId: b.procesoId }];
      for (const que of citas) {
        expect((await citan(tx, b.lider, que)).filas).toHaveLength(10);
        for (const quien of [otro.lider, b.consulta]) expect(await citan(tx, quien, que)).toEqual({ filas: [], hayMas: false });
      }
    });
  });
});

describe("puedeRegistrarEn: la regla del registro", () => {
  it("Admin SGC y Control Interno, cualquier proceso; el líder, solo los suyos; Consulta y Gerencia, ninguno; un proceso inactivo, nadie", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const inactivo = await procesoNuevo(tx);
      await tx`UPDATE procesos SET activo = false WHERE id = ${inactivo}`;
      const esperado: Array<[SesionFlujo, number, boolean]> = [
        [b.admin, b.procesoId, true],
        [b.admin, otro.procesoId, true],
        [b.control, b.procesoId, true],
        [b.control, otro.procesoId, true],
        [b.lider, b.procesoId, true],
        [b.lider, otro.procesoId, false],
        [b.consulta, b.procesoId, false],
        [b.gerencia, b.procesoId, false],
        [b.admin, inactivo, false],
        [b.control, inactivo, false],
      ];
      for (const [quien, procesoId, puede] of esperado) {
        expect(await puedeRegistrarEn(tx, quien, procesoId), `${quien.rol} en ${procesoId}`).toBe(puede);
        // El botón nunca ofrece lo que el registro rechazaría, ni esconde lo que admitiría.
        const registra = await registrarHallazgo(quien, datosDeHallazgo(procesoId), c(AHORA, tx)).then(
          () => true,
          () => false,
        );
        expect(registra, `el registro de ${quien.rol} en ${procesoId}`).toBe(puede);
      }
    });
  });
});

describe("abiertosPorObjetivo", () => {
  it("cuenta los sin terminar que apuntan al objetivo y la persona ve; un objetivo sin ninguno visible no está; Consulta, vacío", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const o1 = await objetivoDePrueba(tx);
      const o2 = await objetivoDePrueba(tx);
      await registrado(tx, b, { objetivoId: o1.id });
      await registrado(tx, b, { objetivoId: o1.id });
      await anular(tx, b, await registrado(tx, b, { objetivoId: o1.id }));
      await registrado(tx, b, { objetivoId: o1.id }, otro.procesoId);
      await registrado(tx, b, {});
      const o = { sql: tx };

      const delControl = await abiertosPorObjetivo(b.control, o);
      expect(delControl.get(o1.id)).toBe(3);
      expect(delControl.has(o2.id)).toBe(false);
      expect((await abiertosPorObjetivo(b.lider, o)).get(o1.id)).toBe(2);
      expect((await abiertosPorObjetivo(otro.lider, o)).get(o1.id)).toBe(1);
      expect((await abiertosPorObjetivo(b.consulta, o)).size).toBe(0);
    });
  });
});

describe("la sección en pantalla (Review Focus 6)", () => {
  it("Consulta en un documento, un indicador y un proceso: ni lista, ni encabezado, ni un cero; solo «Reportar» con el enlace puesto", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const d = await documentoDe(tx, b.procesoId);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await registrado(tx, b, { documentoId: d.id, indicadorId: ind.id });
      const [{ slug }] = await tx`SELECT slug FROM procesos WHERE id = ${b.procesoId}`;
      const casos = [
        { que: { documentoId: d.id }, enlace: { documento: d.codigo }, reportar: `/mejoramiento/reportar?documento=${encodeURIComponent(d.codigo)}` },
        { que: { indicadorId: ind.id }, enlace: { indicador: ind.codigo }, reportar: `/mejoramiento/reportar?indicador=${encodeURIComponent(ind.codigo)}` },
        { que: { procesoId: b.procesoId }, enlace: { proceso: slug as string }, reportar: `/mejoramiento/reportar?proceso=${slug}` },
      ] as const;
      for (const caso of casos) {
        const s = await seccionDeMejoramiento(b.consulta, caso.que, { procesoId: b.procesoId, enlace: caso.enlace }, { sql: tx, ahora });
        expect(s.filas).toEqual([]);
        expect(s.boton).toEqual({ texto: "Reportar", href: caso.reportar });
        const html = pintada(s);
        expect(html).toContain(`href="${caso.reportar.replaceAll("&", "&amp;")}"`);
        expect(html).toContain("Reportar");
        expect(html).not.toContain("Mejoramiento");
        expect(html).not.toContain("<h2");
        expect(html).not.toContain("Ver todos");
        // El texto que se lee (sin las etiquetas ni sus atributos): ni una cifra.
        expect(html.replace(/<[^>]*>/g, "")).toBe("Reportar");
      }
    });
  });

  it("Consulta en una norma: nada; quien ve los hallazgos, la lista sin botón y con «Ver todos»", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const n = await normaDePrueba(tx, b.admin);
      const id = await registrado(tx, b, { requisitoNormaId: n.id });
      const deConsulta = await seccionDeMejoramiento(b.consulta, { normaId: n.id }, null, { sql: tx, ahora });
      expect(deConsulta).toMatchObject({ filas: [], hayMas: false, boton: null });
      expect(pintada(deConsulta)).toBe("");

      const delControl = await seccionDeMejoramiento(b.control, { normaId: n.id }, null, { sql: tx, ahora });
      expect(delControl.boton).toBeNull();
      expect(delControl.verTodos).toBe(`/mejoramiento?norma=${n.id}`);
      const html = pintada(delControl);
      expect(html).toContain("Mejoramiento");
      expect(html).toContain(`href="/mejoramiento/${id}"`);
      expect(html).toContain(COMO_REQUISITO);
      expect(html).toContain(`href="/mejoramiento?norma=${n.id}"`);
      expect(html).not.toContain("Abrir hallazgo");
      expect(html).not.toContain("Reportar");
    });
  });

  it("el botón: «Abrir hallazgo» a quien registra en el proceso propuesto; «Reportar» al líder de otro proceso y a Gerencia", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const d = await documentoDe(tx, b.procesoId);
      const propuesta = { procesoId: b.procesoId, enlace: { documento: d.codigo } };
      const boton = async (quien: SesionFlujo) =>
        (await seccionDeMejoramiento(quien, { documentoId: d.id }, propuesta, { sql: tx, ahora })).boton;
      const abrir = { texto: "Abrir hallazgo", href: rutaDeRegistro({ documento: d.codigo }) };
      for (const quien of [b.admin, b.control, b.lider]) expect(await boton(quien)).toEqual(abrir);
      for (const quien of [otro.lider, b.gerencia, b.consulta]) expect((await boton(quien))?.texto).toBe("Reportar");
      // Sin proceso propuesto (un documento sin proceso propietario), «Abrir hallazgo» a quien registra: el formulario pide el proceso.
      const sinProceso = await seccionDeMejoramiento(otro.lider, { documentoId: d.id }, { procesoId: null, enlace: { documento: d.codigo } }, { sql: tx, ahora });
      expect(sinProceso.boton).toEqual(abrir);
    });
  });

  it("en el proceso, «SGC-FO-14 del proceso» se pinta también sin hallazgos, junto al botón", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const [{ slug }] = await tx`SELECT slug FROM procesos WHERE id = ${b.procesoId}`;
      const s = await seccionDeMejoramiento(b.lider, { procesoId: b.procesoId }, { procesoId: b.procesoId, enlace: { proceso: slug as string } }, { sql: tx, ahora });
      expect(s.filas).toEqual([]);
      const html = pintada(s, `/mejoramiento/consolidado?proceso=${b.procesoId}&anio=2026`);
      expect(html).toContain("SGC-FO-14 del proceso");
      expect(html).toContain("Abrir hallazgo");
      expect(html).not.toContain("<h2");
    });
  });

  it("«Objetivos»: el conteo solo en el objetivo que lo trae, con su enlace; sin conteos, ni un cero ni la palabra", () => {
    const objetivo = (id: number, enunciado: string): ObjetivoLeido => ({ id, clase: "calidad", enunciado, estado: "sin_medicion", indicadores: [] });
    const objetivos = [objetivo(1, "Mejorar la oportunidad de la atención"), objetivo(2, "Mantener la documentación vigente")];
    const con = renderToStaticMarkup(
      createElement(Objetivos, { objetivos, hallazgos: { 1: { texto: "4 hallazgos abiertos", href: "/mejoramiento?objetivo=1" } } }),
    );
    expect(con).toContain('href="/mejoramiento?objetivo=1"');
    expect(con).toContain("4 hallazgos abiertos");
    expect(con).not.toContain("objetivo=2");
    const sin = renderToStaticMarkup(createElement(Objetivos, { objetivos, hallazgos: {} }));
    expect(sin).not.toContain("hallazgo");
    expect(sin).not.toContain("/mejoramiento");
  });
});

describe("los filtros de la lista: sus opciones, sus nombres y el formulario (anexo §10.6)", () => {
  it("opcionesDelFiltro: los planes no anulados que la persona ve; los objetivos activos y, si se eligió, uno inactivo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      const anulado = await planDeMejoraDePrueba(tx, b.control, { nombre: "Plan que se anula" });
      await anularPlan(b.control, { planId: anulado.id, motivo: "Se creó por error, no corresponde a ninguna visita" }, c(AHORA, tx));
      await registrado(tx, b, { planId: plan.id });
      const activo = await objetivoDePrueba(tx);
      const inactivo = await objetivoDePrueba(tx, false);
      const o = { sql: tx };

      const delControl = await opcionesDelFiltro(b.control, {}, o);
      expect(delControl.planes).toContainEqual({ id: plan.id, etiqueta: `${plan.codigo} Auditoría interna de calidad de noviembre` });
      expect(delControl.planes.map((p) => p.id)).not.toContain(anulado.id);
      expect(delControl.objetivos).toContainEqual({ id: activo.id, etiqueta: `Calidad · ${activo.enunciado}` });
      expect(delControl.objetivos.map((x) => x.id)).not.toContain(inactivo.id);
      // El líder del proceso ve el plan por su hallazgo; el de otro proceso, ningún plan.
      expect((await opcionesDelFiltro(b.lider, {}, o)).planes.map((p) => p.id)).toEqual([plan.id]);
      const delOtro = await opcionesDelFiltro(otro.lider, { objetivo: inactivo.id }, o);
      expect(delOtro.planes).toEqual([]);
      expect(delOtro.objetivos.map((x) => x.id)).toContain(inactivo.id);
    });
  });

  it("nombresDelFiltro: cada filtro por su nombre, con la regla de su módulo; lo que la persona no ve no llega", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control);
      await registrado(tx, b, { planId: plan.id });
      const objetivo = await objetivoDePrueba(tx);
      const d = await documentoDe(tx, otro.procesoId, "restringido");
      const ind = await indicadorDePrueba(tx, { procesoId: otro.procesoId, nivelAcceso: "restringido" });
      const [{ nombre: indicador }] = await tx`SELECT nombre FROM indicador_versiones WHERE id = ${ind.versionId}`;
      const n = await normaDePrueba(tx, b.admin);
      const [s] = await tx`INSERT INTO subprocesos (proceso_id, nombre, slug, orden)
        VALUES (${b.procesoId}, 'Subproceso de los nombres', ${`zz-sub-${Date.now()}`}, 99) RETURNING id`;
      const filtro = { plan: plan.id, objetivo: objetivo.id, documento: d.id, indicador: ind.id, norma: n.id, subproceso: Number(s.id) };
      const o = { sql: tx };

      expect(await nombresDelFiltro(b.control, filtro, o)).toEqual({
        plan: `${plan.codigo} Auditoría interna de calidad de noviembre`,
        objetivo: objetivo.enunciado,
        documento: `${d.codigo} ${d.titulo}`,
        indicador: `${ind.codigo} ${indicador as string}`,
        norma: n.nombre,
        subproceso: "Subproceso de los nombres",
      });
      // El líder del proceso: el plan sí (lo ve por su hallazgo); el documento y el indicador restringidos de otro proceso, no.
      const delLider = await nombresDelFiltro(b.lider, filtro, o);
      expect(Object.keys(delLider).sort()).toEqual(["norma", "objetivo", "plan", "subproceso"]);
      expect(JSON.stringify(delLider)).not.toContain(d.titulo);
      // El líder del otro proceso ve sus restringidos, pero no el plan (ningún hallazgo suyo está en él).
      expect(Object.keys(await nombresDelFiltro(otro.lider, filtro, o)).sort()).toEqual(["documento", "indicador", "norma", "objetivo", "subproceso"]);
      expect(await nombresDelFiltro(b.lider, {}, o)).toEqual({});
    });
  });

  it("el formulario: plan y objetivo a la vista (el elegido aunque no esté entre las opciones); lo que llega por enlace, en una línea y oculto", () => {
    const html = renderToStaticMarkup(
      createElement(FiltrosDeHallazgos, {
        filtro: { plan: 99, documento: 5, norma: 7 },
        procesos: [],
        planes: [],
        objetivos: [{ id: 1, etiqueta: "Calidad · Mejorar la oportunidad de la atención" }],
        nombres: { documento: "PR-GBS-03 Supervisión de contratos", norma: "Ley 1 de 2020" },
      }),
    );
    expect(html).toContain("Desde otra página: </span>Documento: PR-GBS-03 Supervisión de contratos · Norma: Ley 1 de 2020");
    expect(html).toMatch(/<select id="filtro-plan" name="plan"[^>]*>[\s\S]*<option value="99" selected="">No disponible<\/option>/);
    expect(html).toContain('<select id="filtro-objetivo" name="objetivo"');
    expect(html).toContain('<input type="hidden" name="documento" value="5"/>');
    expect(html).toContain('<input type="hidden" name="norma" value="7"/>');
    expect(html).not.toContain('name="indicador"');
    expect(html).not.toContain('name="subproceso"');
    // Sin filtros que lleguen por enlace ni planes que elegir: ni la línea ni el selector del plan.
    const sin = renderToStaticMarkup(createElement(FiltrosDeHallazgos, { filtro: {}, procesos: [], planes: [], objetivos: [] }));
    expect(sin).not.toContain("Desde otra página");
    expect(sin).not.toContain('name="plan"');
    expect(sin).not.toContain('name="objetivo"');
  });
});
