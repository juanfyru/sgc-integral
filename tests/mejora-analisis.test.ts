/**
 * El análisis de causa raíz (spec 15 §9, Tarea 11): el contenido de cada método (reglas puras), y guardar análisis, causas y
 * las dos preguntas de cierre de la ronda en curso, con la condición de persona repetida dentro de la transacción.
 */
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import {
  exigirBorrador,
  guardarAnalisis,
  guardarCausas,
  laVezPasada,
  puedeFormular,
  quitarAnalisis,
  responderPreguntas,
} from "@/db/consultas/mejoramiento/analisis";
import { NO_EXISTE } from "@/db/consultas/mejoramiento/flujo";
import { EsquemaFormularioAnalisis, EsquemaFormularioCausas, EsquemaFormularioPreguntas } from "@/lib/esquemas/mejoramiento";
import { analisisCompleto, leerContenido } from "@/lib/mejoramiento/analisis";
import { parsearFormulario } from "@/lib/validacion";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso } from "@/lib/permisos";
import { baseDeMejora, c, hallazgoEn, otroProcesoConLider } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-18T15:00:00Z";

describe("el contenido de cada método", () => {
  it("5 porqués: un nivel basta; los niveles van en orden; son cinco como máximo", () => {
    expect(analisisCompleto({ metodo: "cinco_porques", contenido: { niveles: [{ respuesta: "No había quien lo recordara" }] } })).toBe(true);
    expect(() => leerContenido("cinco_porques", { niveles: [{ respuesta: "" }, { respuesta: "Segundo" }] })).toThrow(
      "Los niveles van en orden, sin saltar ninguno",
    );
    const seis = Array.from({ length: 6 }, (_, i) => ({ respuesta: `Nivel ${i + 1}` }));
    expect(() => leerContenido("cinco_porques", { niveles: seis })).toThrow();
    // Los niveles vacíos al final no cuentan.
    expect(leerContenido("cinco_porques", { niveles: [{ respuesta: " Uno " }, { respuesta: "" }] })).toEqual({
      niveles: [{ respuesta: "Uno" }],
    });
    expect(analisisCompleto({ metodo: "cinco_porques", contenido: { niveles: [] } })).toBe(false);
  });

  it("Ishikawa: completo con una causa confirmada; la confirmada lleva su impacto; solo las seis categorías", () => {
    const sinConfirmar = { causas: [{ categoria: "metodo", texto: "No hay lista de chequeo", confirmada: false }] };
    expect(analisisCompleto({ metodo: "ishikawa", contenido: sinConfirmar })).toBe(false);
    expect(leerContenido("ishikawa", sinConfirmar)).toEqual(sinConfirmar);
    expect(() =>
      leerContenido("ishikawa", { causas: [{ categoria: "metodo", texto: "No hay lista de chequeo", confirmada: true }] }),
    ).toThrow("Indique el impacto de cada causa confirmada");
    const confirmada = {
      causas: [{ categoria: "metodo", texto: "No hay lista de chequeo", confirmada: true, impacto: "alto", requiereAccion: true }],
    };
    expect(analisisCompleto({ metodo: "ishikawa", contenido: confirmada })).toBe(true);
    expect(() => leerContenido("ishikawa", { causas: [{ categoria: "dinero", texto: "Falta presupuesto", confirmada: false }] })).toThrow();
    // Una causa sin confirmar no guarda impacto.
    expect(
      leerContenido("ishikawa", { causas: [{ categoria: "material", texto: "Insumo vencido", confirmada: false, impacto: "bajo" }] }),
    ).toEqual({ causas: [{ categoria: "material", texto: "Insumo vencido", confirmada: false }] });
  });

  it("otro método: nombre y descripción; el Pareto todavía no está disponible", () => {
    expect(() => leerContenido("otro", { nombre: "", descripcion: "Lluvia de ideas con el equipo" })).toThrow("Escriba el nombre del método");
    expect(() => leerContenido("otro", { nombre: "Lluvia de ideas", descripcion: "" })).toThrow("Escriba la descripción del método");
    expect(analisisCompleto({ metodo: "otro", contenido: { nombre: "Lluvia de ideas", descripcion: "Con el equipo" } })).toBe(true);
    expect(() => leerContenido("pareto", {})).toThrow("El análisis de Pareto todavía no está disponible");
    expect(analisisCompleto({ metodo: "pareto", contenido: {} })).toBe(false);
  });
});

describe("los formularios leen su contenido de forma estricta", () => {
  const datos = (campos: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(campos)) f.set(k, v);
    return f;
  };

  it("el contenido llega como JSON y un campo de más se rechaza", () => {
    const base = { hallazgoId: "5", metodo: "cinco_porques", contenido: JSON.stringify(porques("Uno")) };
    const d = parsearFormulario(datos(base), EsquemaFormularioAnalisis);
    expect(d).toMatchObject({ hallazgoId: 5, metodo: "cinco_porques", analisisId: null });
    expect(() => parsearFormulario(datos({ ...base, contenido: "{no es json" }), EsquemaFormularioAnalisis)).toThrow(
      "El contenido del análisis no es válido",
    );
    expect(() => parsearFormulario(datos({ ...base, intruso: "x" }), EsquemaFormularioAnalisis)).toThrow();
    expect(() => parsearFormulario(datos({ ...base, metodo: "eval" }), EsquemaFormularioAnalisis)).toThrow("Elija el método del análisis");
    const causas = parsearFormulario(datos({ hallazgoId: "5", causas: JSON.stringify([{ texto: "Una causa" }]) }), EsquemaFormularioCausas);
    expect(causas.causas).toEqual([{ texto: "Una causa" }]);
  });

  it("las preguntas planas se vuelven la forma del dominio; «no» borra los cambios marcados", () => {
    const si = parsearFormulario(
      datos({ hallazgoId: "5", similares: "no", hayCambios: "si", cambiosRiesgos: "si", cambiosDescripcion: "Revisar la matriz" }),
      EsquemaFormularioPreguntas,
    );
    expect(si.cambios).toEqual({ documentos: false, riesgos: true, controles: false, descripcion: "Revisar la matriz" });
    expect(() => parsearFormulario(datos({ hallazgoId: "5", similares: "no", hayCambios: "si" }), EsquemaFormularioPreguntas)).toThrow(
      "Marque qué cambios se requieren",
    );
    const no = parsearFormulario(datos({ hallazgoId: "5", similares: "no", hayCambios: "no", cambiosRiesgos: "si" }), EsquemaFormularioPreguntas);
    expect(no.cambios).toEqual({ documentos: false, riesgos: false, controles: false, descripcion: null });
  });
});

const porques = (...respuestas: string[]) => ({ niveles: respuestas.map((respuesta) => ({ respuesta })) });
const ishikawa = {
  causas: [{ categoria: "metodo", texto: "No hay lista de chequeo", confirmada: true, impacto: "alto", requiereAccion: true }],
};

describe("guardar el análisis", () => {
  it("exige «Por formular»: en otro estado, YA_CAMBIO", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_corregir");
      await expect(
        guardarAnalisis(b.lider, { hallazgoId: h.id, metodo: "cinco_porques", contenido: porques("Uno") }, c(AHORA, tx)),
      ).rejects.toThrow(YA_CAMBIO);
    }));

  it("quien actúa por el proceso: el líder sí; un líder de otro proceso no lo ve; el Admin SGC solo sin líder", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const d = { hallazgoId: h.id, metodo: "cinco_porques" as const, contenido: porques("Uno") };
      await expect(guardarAnalisis(otro.lider, d, c(AHORA, tx))).rejects.toThrow(NO_EXISTE);
      await expect(guardarAnalisis(b.admin, d, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(guardarAnalisis(b.gerencia, d, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await puedeFormular(tx, b.lider, h)).toBe(true);
      expect(await puedeFormular(tx, b.admin, h)).toBe(false);
      await expect(guardarAnalisis(b.lider, d, c(AHORA, tx))).resolves.toMatchObject({ id: expect.any(Number) });
      // Sin líder activo en el proceso, actúa el Admin SGC.
      await tx`DELETE FROM usuario_procesos WHERE proceso_id = ${b.procesoId}`;
      expect(await puedeFormular(tx, b.admin, h)).toBe(true);
      await expect(guardarAnalisis(b.admin, d, c(AHORA, tx))).resolves.toMatchObject({ id: expect.any(Number) });
    }));

  it("dos análisis en la misma ronda conviven y conservan su orden; el evento no lleva el contenido", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const a = await guardarAnalisis(b.lider, { hallazgoId: h.id, metodo: "ishikawa", equipo: "Enfermería", contenido: ishikawa }, c(AHORA, tx));
      const p = await guardarAnalisis(b.lider, { hallazgoId: h.id, metodo: "cinco_porques", contenido: porques("Uno", "Dos") }, c(AHORA, tx));
      const filas = await tx`SELECT id, orden, metodo, equipo FROM mejora_analisis WHERE hallazgo_id = ${h.id} ORDER BY orden`;
      expect(filas.map((f) => [Number(f.id), f.metodo])).toEqual([
        [a.id, "ishikawa"],
        [p.id, "cinco_porques"],
      ]);
      expect(Number(filas[0].orden)).toBeLessThan(Number(filas[1].orden));
      // Guardar de nuevo el mismo análisis lo reemplaza y no cambia su orden.
      await guardarAnalisis(b.lider, { hallazgoId: h.id, analisisId: a.id, metodo: "ishikawa", contenido: ishikawa, observaciones: "Segunda mirada" }, c(AHORA, tx));
      const [uno] = await tx`SELECT orden, observaciones FROM mejora_analisis WHERE id = ${a.id}`;
      expect(Number(uno.orden)).toBe(Number(filas[0].orden));
      expect(uno.observaciones).toBe("Segunda mirada");
      const eventos = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'analisis_guardado' ORDER BY id`;
      expect(eventos).toHaveLength(3);
      expect(JSON.stringify(eventos[0].detalle)).not.toContain("lista de chequeo");
      expect(eventos[0].detalle).toMatchObject({ metodo: "ishikawa", analisisId: a.id });
      const [estado] = await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(estado.estado).toBe("por_formular");
      await quitarAnalisis(b.lider, { hallazgoId: h.id, analisisId: p.id }, c(AHORA, tx));
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM mejora_analisis WHERE hallazgo_id = ${h.id}`;
      expect(n).toBe(1);
    }));

  it("no se guarda en un plan ya enviado ni un análisis de otro hallazgo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const g = await hallazgoEn(tx, b, "por_formular");
      const ajeno = await guardarAnalisis(b.lider, { hallazgoId: g.id, metodo: "otro", contenido: { nombre: "Lluvia", descripcion: "De ideas" } }, c(AHORA, tx));
      await expect(
        guardarAnalisis(b.lider, { hallazgoId: h.id, analisisId: ajeno.id, metodo: "otro", contenido: { nombre: "X", descripcion: "Y" } }, c(AHORA, tx)),
      ).rejects.toThrow();
      await tx`UPDATE mejora_rondas SET estado_plan = 'enviado' WHERE hallazgo_id = ${h.id}`;
      await expect(exigirBorrador(tx, b.lider, h.id)).rejects.toThrow(YA_CAMBIO);
    }));
});

describe("las causas de la ronda", () => {
  it("reemplazan la lista conservando los id que llegan y rechazan quitar una causa con acciones", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      await guardarCausas(b.lider, { hallazgoId: h.id, causas: [{ texto: "No hay lista de chequeo" }, { texto: "Poco personal", sinAccionPorque: "Depende de la gerencia" }] }, c(AHORA, tx));
      const [uno, dos] = await tx`SELECT id, orden, texto, sin_accion_porque FROM mejora_causas WHERE hallazgo_id = ${h.id} ORDER BY orden`;
      expect(dos.sin_accion_porque).toBe("Depende de la gerencia");
      // Una acción ataca la primera causa.
      const [ronda] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      const [accion] = await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
        VALUES (${h.id}, ${ronda.id}, 1, 'correctiva', 'Crear la lista de chequeo') RETURNING id`;
      await tx`INSERT INTO mejora_accion_causas (hallazgo_id, accion_id, causa_id) VALUES (${h.id}, ${accion.id}, ${uno.id})`;
      // Reescribir la primera y quitar la segunda: la primera conserva su id y su enlace.
      await guardarCausas(b.lider, { hallazgoId: h.id, causas: [{ id: Number(uno.id), texto: "No existe una lista de chequeo" }] }, c(AHORA, tx));
      const filas = await tx`SELECT id, texto FROM mejora_causas WHERE hallazgo_id = ${h.id}`;
      expect(filas.map((f) => [Number(f.id), f.texto])).toEqual([[Number(uno.id), "No existe una lista de chequeo"]]);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM mejora_accion_causas WHERE causa_id = ${uno.id}`;
      expect(n).toBe(1);
      // Quitar la que tiene acciones se rechaza.
      await expect(guardarCausas(b.lider, { hallazgoId: h.id, causas: [{ texto: "Otra causa" }] }, c(AHORA, tx))).rejects.toThrow(
        "Esa causa tiene acciones: quítelas antes",
      );
      // Un id que no es de la ronda no se acepta.
      await expect(guardarCausas(b.lider, { hallazgoId: h.id, causas: [{ id: 999999999, texto: "Fantasma" }] }, c(AHORA, tx))).rejects.toThrow();
    }));
});

describe("las dos preguntas de cierre", () => {
  const cambios = { documentos: false, riesgos: false, controles: false };

  it("«sí» exige decir cuáles; un cambio marcado exige su descripción", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      await expect(responderPreguntas(b.lider, { hallazgoId: h.id, similares: true, cambios }, c(AHORA, tx))).rejects.toThrow("Diga cuáles");
      await expect(
        responderPreguntas(b.lider, { hallazgoId: h.id, similares: false, cambios: { ...cambios, riesgos: true } }, c(AHORA, tx)),
      ).rejects.toThrow("Describa los cambios que se requieren");
      await responderPreguntas(
        b.lider,
        { hallazgoId: h.id, similares: true, similaresDetalle: "Urgencias, mismo hallazgo", cambios: { ...cambios, documentos: true, descripcion: "Actualizar el procedimiento" } },
        c(AHORA, tx),
      );
      const [r] = await tx`SELECT similares, similares_detalle, cambios FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      expect(r.similares).toBe(true);
      expect(r.similares_detalle).toBe("Urgencias, mismo hallazgo");
      expect(r.cambios).toEqual({ documentos: true, riesgos: false, controles: false, descripcion: "Actualizar el procedimiento" });
      await responderPreguntas(b.lider, { hallazgoId: h.id, similares: false, cambios }, c(AHORA, tx));
      const [n] = await tx`SELECT similares, similares_detalle, cambios FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      expect(n.similares).toBe(false);
      expect(n.similares_detalle).toBeNull();
      expect(n.cambios).toEqual({ documentos: false, riesgos: false, controles: false, descripcion: null });
    }));
});

describe("la vez pasada de un reincidente", () => {
  it("devuelve las causas y las acciones de la última ronda del hallazgo anterior; de uno que no lo es, null", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const anterior = await hallazgoEn(tx, b, "por_formular");
      const actual = await hallazgoEn(tx, b, "por_formular");
      expect(await laVezPasada(tx, actual.id)).toBeNull();
      await guardarCausas(b.lider, { hallazgoId: anterior.id, causas: [{ texto: "No hay lista de chequeo" }] }, c(AHORA, tx));
      const [ronda] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${anterior.id} AND numero = 1`;
      await tx`INSERT INTO mejora_acciones (hallazgo_id, ronda_id, orden, tipo, descripcion)
        VALUES (${anterior.id}, ${ronda.id}, 1, 'correctiva', 'Crear la lista de chequeo')`;
      await tx`UPDATE mejora_hallazgos SET reincidente_de = ${anterior.id} WHERE id = ${actual.id}`;
      expect(await laVezPasada(tx, actual.id)).toEqual({
        codigo: anterior.codigo,
        causas: ["No hay lista de chequeo"],
        acciones: ["Crear la lista de chequeo"],
      });
    }));
});
