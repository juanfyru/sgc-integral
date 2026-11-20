/**
 * Las actividades del plan aprobado (spec 15 §10.2 a §10.4, Tarea 14): los seguimientos de su responsable, la evidencia, terminar
 * (la última lleva el hallazgo a «Por verificar») y reasignar. Contra la BD de trabajo, dentro de una transacción que se
 * revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  avanceDeAccion,
  avanceDeHallazgo,
  contarMisActividades,
  EVIDENCIA_TRAS_LA_DEVOLUCION,
  leerActividad,
  misActividades,
  reasignarActividad,
  registrarSeguimiento,
  SIN_EVIDENCIA_PARA_TERMINAR,
  terminarActividad,
} from "@/db/consultas/mejoramiento/actividades";
import { archivosDe } from "@/db/consultas/mejoramiento/archivos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { leerHallazgo, listarHallazgos, veAlgunHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { participacionEnHallazgo } from "@/lib/alcance";
import { venceEn } from "@/lib/mejoramiento/plazos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso } from "@/lib/permisos";
import { verificarImplementacion } from "@/db/consultas/mejoramiento/verificacion";
import { baseDeMejora, c, evidenciaDeActividad, hallazgoEn, otroProcesoConLider, tramiteEnlazado, type BaseDeMejora } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá (el plan de `hallazgoEn` se aprueba el martes 17).
const AHORA = "2026-11-18T15:00:00Z";
const HOY = "2026-11-18";

/** Un hallazgo «En ejecución» cuyas `actividades` actividades son de `responsable` (un usuario que no lidera el proceso). */
async function enEjecucion(tx: TransactionSql, actividades = 1) {
  const b = await baseDeMejora(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, actividades });
  const ids = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`).map((f) => Number(f.id));
  return { b, responsable, h, ids };
}

const seguimiento = (actividadId: number, avance: number, extra?: { fecha?: string; realizado?: string; barreras?: string | null }) => ({
  actividadId,
  fecha: extra?.fecha ?? HOY,
  realizado: extra?.realizado ?? "Se pidieron tres cotizaciones al proveedor",
  avance,
  barreras: extra?.barreras ?? null,
});

const filaDe = async (tx: TransactionSql, actividadId: number) => (await tx`SELECT * FROM mejora_actividades WHERE id = ${actividadId}`)[0];
const estadoDe = async (tx: TransactionSql, hallazgoId: number) =>
  (await tx`SELECT estado, vence_en FROM mejora_hallazgos WHERE id = ${hallazgoId}`)[0];
const avisosDe = async (tx: TransactionSql, usuarioId: number, tipo: string) =>
  tx`SELECT titulo, cuerpo, enlace FROM notificaciones WHERE usuario_id = ${usuarioId} AND tipo = ${tipo} ORDER BY id`;

const MOTIVO = "Cambió de servicio y ya no atiende la farmacia";

/** El líder del proceso reasigna la actividad, con su motivo. */
async function reasignar(tx: TransactionSql, b: BaseDeMejora, actividadId: number, responsableId: number) {
  await reasignarActividad(b.lider, { actividadId, responsableId, motivo: MOTIVO }, c(AHORA, tx));
}

/** Seguimiento al 100 % y un archivo, por el dominio: lo que hace falta para terminar. */
async function lista(tx: TransactionSql, quien: SesionFlujo, actividadId: number) {
  await registrarSeguimiento(quien, seguimiento(actividadId, 100), c(AHORA, tx));
  await evidenciaDeActividad(tx, actividadId, quien.usuarioId);
}

describe("avanceDeAccion y avanceDeHallazgo (sin base)", () => {
  it("el promedio simple sin las canceladas, redondeado", () => {
    expect(avanceDeAccion([{ avance: 40, estado: "en_proceso" }, { avance: 100, estado: "terminada" }])).toBe(70);
    expect(avanceDeAccion([{ avance: 40, estado: "en_proceso" }, { avance: 0, estado: "cancelada" }])).toBe(40);
    expect(avanceDeAccion([{ avance: 33, estado: "en_proceso" }, { avance: 34, estado: "abierta" }])).toBe(34);
    expect(avanceDeAccion([{ avance: 50, estado: "cancelada" }, { avance: 0, estado: "cancelada" }])).toBeNull();
    expect(avanceDeAccion([])).toBeNull();
    expect(avanceDeHallazgo([40, 100])).toBe(70);
    // Una acción con todas sus actividades canceladas no cuenta.
    expect(avanceDeHallazgo([40, null])).toBe(40);
    expect(avanceDeHallazgo([null, null])).toBeNull();
    expect(avanceDeHallazgo([])).toBeNull();
  });
});

describe("registrarSeguimiento", () => {
  it("el responsable registra un seguimiento: la actividad pasa a en proceso, el avance sube y queda la fila", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      await tx`UPDATE mejora_actividades SET recordatorio_en = ${AHORA} WHERE id = ${a}`;
      const { id } = await registrarSeguimiento(
        responsable,
        seguimiento(a, 40, { fecha: "2026-11-17", barreras: "El proveedor no tiene existencias" }),
        c(AHORA, tx),
      );
      expect(await filaDe(tx, a)).toMatchObject({ estado: "en_proceso", avance: 40, recordatorio_en: null });
      const [s] = await tx`SELECT hallazgo_id, actividad_id, to_char(fecha, 'YYYY-MM-DD') AS fecha, realizado, avance, barreras, registrado_por
        FROM mejora_seguimientos WHERE id = ${id}`;
      expect(s).toEqual({
        hallazgo_id: h.id,
        actividad_id: a,
        fecha: "2026-11-17",
        realizado: "Se pidieron tres cotizaciones al proveedor",
        avance: 40,
        barreras: "El proveedor no tiene existencias",
        registrado_por: responsable.usuarioId,
      });
      // El evento y la bitácora llevan la etiqueta y los avances, nunca el texto.
      const [e] = await tx`SELECT detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'seguimiento'`;
      expect(e.detalle).toEqual({ actividadId: a, actividad: "A1.1", seguimientoId: id, avance: { antes: 0, despues: 40 } });
      const [bit] = await tx`SELECT entidad, entidad_id, detalle FROM auditoria WHERE accion = 'mejora_seguimiento' AND entidad_id = ${a}`;
      expect(bit.entidad).toBe("mejora_actividad");
      expect(bit.detalle).toMatchObject({ codigo: h.codigo, actividad: "A1.1", avance: { antes: 0, despues: 40 } });
      expect(JSON.stringify([e.detalle, bit.detalle])).not.toMatch(/cotizaciones|existencias/);
      // Otra persona, aunque lidere el proceso, no registra seguimientos de una actividad ajena.
      await expect(registrarSeguimiento(b.lider, seguimiento(a, 50), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      // Quien no ve el hallazgo recibe «no existe», lo mismo que con un id que no existe.
      await expect(registrarSeguimiento(b.consulta, seguimiento(a, 50), c(AHORA, tx))).rejects.toThrow("La actividad no existe");
      await expect(registrarSeguimiento(responsable, seguimiento(987654321, 50), c(AHORA, tx))).rejects.toThrow("La actividad no existe");
    }));

  it("la fecha no es futura, lo hecho lleva al menos 10 caracteres y el avance es un entero de 0 a 100", () =>
    revertida(sql, async (tx) => {
      const { responsable, ids } = await enEjecucion(tx);
      const [a] = ids;
      await expect(registrarSeguimiento(responsable, seguimiento(a, 40, { fecha: "2026-11-19" }), c(AHORA, tx))).rejects.toThrow(
        "La fecha del seguimiento no puede ser futura",
      );
      await expect(registrarSeguimiento(responsable, seguimiento(a, 40, { fecha: "1999-12-31" }), c(AHORA, tx))).rejects.toThrow(
        "La fecha debe estar entre el año 2000 y el 2100",
      );
      await expect(registrarSeguimiento(responsable, seguimiento(a, 40, { realizado: "Poco" }), c(AHORA, tx))).rejects.toThrow(
        "Lo que se hizo debe tener al menos 10 caracteres",
      );
      await expect(registrarSeguimiento(responsable, seguimiento(a, 101), c(AHORA, tx))).rejects.toThrow("El avance debe estar entre 0 y 100");
      await expect(registrarSeguimiento(responsable, seguimiento(a, 40.5), c(AHORA, tx))).rejects.toThrow("El avance debe ser un número entero");
      expect(await tx`SELECT 1 FROM mejora_seguimientos WHERE actividad_id = ${a}`).toHaveLength(0);
    }));

  it("el avance no baja, salvo con la actividad devuelta", () =>
    revertida(sql, async (tx) => {
      const { responsable, ids } = await enEjecucion(tx);
      const [a] = ids;
      await registrarSeguimiento(responsable, seguimiento(a, 40), c(AHORA, tx));
      await expect(registrarSeguimiento(responsable, seguimiento(a, 30), c(AHORA, tx))).rejects.toThrow(
        "El avance no puede ser menor que el del seguimiento anterior (40 %)",
      );
      await registrarSeguimiento(responsable, seguimiento(a, 40), c(AHORA, tx));
      await tx`UPDATE mejora_actividades SET verificacion = 'devuelta', verificacion_nota = 'Falta el registro del turno de noche' WHERE id = ${a}`;
      await registrarSeguimiento(responsable, seguimiento(a, 30), c(AHORA, tx));
      expect((await filaDe(tx, a)).avance).toBe(30);
    }));

  it("fuera de en_ejecucion (hallazgo en_espera) lanza YA_CAMBIO", () =>
    revertida(sql, async (tx) => {
      const { responsable, h, ids } = await enEjecucion(tx);
      await tx`UPDATE mejora_hallazgos SET estado = 'en_espera', vence_en = NULL WHERE id = ${h.id}`;
      await expect(registrarSeguimiento(responsable, seguimiento(ids[0], 40), c(AHORA, tx))).rejects.toThrow(YA_CAMBIO);
    }));
});

describe("terminarActividad", () => {
  it("sin evidencia no termina; con avance 90 tampoco; con las dos cosas queda terminada", () =>
    revertida(sql, async (tx) => {
      const { responsable, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      // Avance en 100 y ningún archivo de esta actividad (sí de la otra).
      await registrarSeguimiento(responsable, seguimiento(a1, 100), c(AHORA, tx));
      await evidenciaDeActividad(tx, a2, responsable.usuarioId);
      await expect(terminarActividad(responsable, { actividadId: a1 }, c(AHORA, tx))).rejects.toThrow(
        "Para terminar hace falta al menos un archivo de evidencia o un trámite enlazado que haya terminado bien",
      );
      // Con su archivo y el avance en 90.
      await registrarSeguimiento(responsable, seguimiento(a2, 90), c(AHORA, tx));
      await expect(terminarActividad(responsable, { actividadId: a2 }, c(AHORA, tx))).rejects.toThrow("Registre el avance en 100 % antes de terminar");
      // Con las dos cosas; la verificación de una vuelta anterior se borra.
      await evidenciaDeActividad(tx, a1, responsable.usuarioId);
      await tx`UPDATE mejora_actividades SET verificacion = 'devuelta', verificacion_nota = 'Falta el registro', corregir_antes_de = '2026-11-25' WHERE id = ${a1}`;
      await terminarActividad(responsable, { actividadId: a1 }, c(AHORA, tx));
      const f = await filaDe(tx, a1);
      expect(f).toMatchObject({ estado: "terminada", terminada_por: responsable.usuarioId, verificacion: null, verificacion_nota: null, corregir_antes_de: null });
      expect((f.terminada_en as Date).toISOString()).toBe(new Date(AHORA).toISOString());
      // Queda otra sin terminar: el hallazgo sigue en ejecución.
      expect((await estadoDe(tx, h.id)).estado).toBe("en_ejecucion");
      const [e] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'actividad_terminada'`;
      expect(e.detalle).toEqual({ actividadId: a1, actividad: "A1.1", archivos: 1 });
      expect(await tx`SELECT 1 FROM auditoria WHERE accion = 'mejora_actividad_terminada' AND entidad_id = ${a1}`).toHaveLength(1);
      // Otra vez, ya terminada: no.
      await expect(terminarActividad(responsable, { actividadId: a1 }, c(AHORA, tx))).rejects.toThrow("La actividad ya terminó o se canceló");
    }));

  it("la última actividad lleva el hallazgo a por_verificar, con el plazo de verificar", () =>
    revertida(sql, async (tx) => {
      const { responsable, h, ids } = await enEjecucion(tx);
      await lista(tx, responsable, ids[0]);
      await terminarActividad(responsable, { actividadId: ids[0] }, c(AHORA, tx));
      const f = await estadoDe(tx, h.id);
      expect(f.estado).toBe("por_verificar");
      expect((f.vence_en as Date).toISOString()).toBe(venceEn("verificar", new Date(AHORA), await contextoDeMejora(tx, new Date(AHORA))).toISOString());
      expect(await tx`SELECT 1 FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'completar'`).toHaveLength(1);
    }));

  it("con una actividad cancelada y las demás terminadas, también", () =>
    revertida(sql, async (tx) => {
      const { responsable, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = ${AHORA} WHERE id = ${a2}`;
      await lista(tx, responsable, a1);
      await terminarActividad(responsable, { actividadId: a1 }, c(AHORA, tx));
      const f = await estadoDe(tx, h.id);
      expect(f.estado).toBe("por_verificar");
      expect((f.vence_en as Date).toISOString()).toBe(venceEn("verificar", new Date(AHORA), await contextoDeMejora(tx, new Date(AHORA))).toISOString());
    }));

  it("otra persona no la termina", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, ids } = await enEjecucion(tx);
      await lista(tx, responsable, ids[0]);
      await expect(terminarActividad(b.lider, { actividadId: ids[0] }, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(terminarActividad(b.consulta, { actividadId: ids[0] }, c(AHORA, tx))).rejects.toThrow("La actividad no existe");
    }));

  it("hallazgoEn llega a por_verificar terminando cada actividad por el dominio", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_verificar", undefined, { actividades: 2 });
      expect(h.estado).toBe("por_verificar");
      const filas = await tx`SELECT estado, avance FROM mejora_actividades WHERE hallazgo_id = ${h.id}`;
      expect(filas.map((f) => [f.estado, f.avance])).toEqual([
        ["terminada", 100],
        ["terminada", 100],
      ]);
    }));
});

describe("terminar con un trámite que terminó bien (Fase 15B, anexo §9.4)", () => {
  /** El avance en 100 y, sin ningún archivo, un trámite enlazado en `etapa`. */
  async function conTramite(tx: TransactionSql, etapa: string) {
    const r = await enEjecucion(tx);
    const [a] = r.ids;
    await registrarSeguimiento(r.responsable, seguimiento(a, 100), c(AHORA, tx));
    const t = await tramiteEnlazado(tx, { actividadId: a, usuarioId: r.b.lider.usuarioId, etapa, terminoEn: AHORA });
    return { ...r, a, ...t };
  }

  it("sin archivos y con un trámite enlazado publicado, termina; el evento y la bitácora cuentan el trámite", () =>
    revertida(sql, async (tx) => {
      const { responsable, h, a } = await conTramite(tx, "publicado");
      await terminarActividad(responsable, { actividadId: a }, c(AHORA, tx));
      expect(await filaDe(tx, a)).toMatchObject({ estado: "terminada", terminada_por: responsable.usuarioId });
      const [e] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'actividad_terminada'`;
      expect(e.detalle).toEqual({ actividadId: a, actividad: "A1.1", archivos: 0, tramites: 1 });
      expect((await leerActividad(responsable, a, c(AHORA, tx)))?.estado).toBe("terminada");
    }));

  it("uno eliminado también vale", () =>
    revertida(sql, async (tx) => {
      const { responsable, a } = await conTramite(tx, "eliminado");
      await terminarActividad(responsable, { actividadId: a }, c(AHORA, tx));
      expect((await filaDe(tx, a)).estado).toBe("terminada");
    }));

  for (const etapa of ["aprobacion", "cancelado", "rechazado"]) {
    it(`uno ${etapa === "aprobacion" ? "en curso" : etapa} no vale: SIN_EVIDENCIA_PARA_TERMINAR`, () =>
      revertida(sql, async (tx) => {
        const { responsable, a } = await conTramite(tx, etapa);
        await expect(terminarActividad(responsable, { actividadId: a }, c(AHORA, tx))).rejects.toThrow(SIN_EVIDENCIA_PARA_TERMINAR);
        expect((await filaDe(tx, a)).estado).toBe("en_proceso");
      }));
  }

  it("lo que falta para terminar lo dice la lectura: con el trámite publicado, ya no falta evidencia", () =>
    revertida(sql, async (tx) => {
      const { responsable, a, tramiteId } = await conTramite(tx, "aprobacion");
      expect((await leerActividad(responsable, a, c(AHORA, tx)))?.tramiteQueVale).toBe(false);
      await tx`UPDATE tramites SET etapa = 'publicado', cerrado_en = ${new Date(AHORA)} WHERE id = ${tramiteId}`;
      expect((await leerActividad(responsable, a, c(AHORA, tx)))?.tramiteQueVale).toBe(true);
    }));

  it("en una actividad devuelta vale un trámite que terminó bien después de la devolución, no uno anterior", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      await lista(tx, responsable, a);
      await terminarActividad(responsable, { actividadId: a }, c(AHORA, tx));
      // Publicado el 19, antes de la devolución del 20.
      await tramiteEnlazado(tx, { actividadId: a, usuarioId: b.lider.usuarioId, etapa: "publicado", terminoEn: "2026-11-19T15:00:00Z" });
      await verificarImplementacion(
        b.control,
        {
          hallazgoId: h.id,
          actividades: [{ id: a, conforme: false, nota: "Falta el registro firmado del turno de noche", corregirAntesDe: "2026-12-18" }],
          metodos: ["evidencias"],
        },
        c("2026-11-20T15:00:00Z", tx),
      );
      const LUEGO = c("2026-11-23T15:00:00Z", tx);
      await registrarSeguimiento(responsable, seguimiento(a, 100, { fecha: "2026-11-23" }), LUEGO);
      await expect(terminarActividad(responsable, { actividadId: a }, LUEGO)).rejects.toThrow(EVIDENCIA_TRAS_LA_DEVOLUCION);
      expect((await leerActividad(responsable, a, LUEGO))?.tramiteQueVale).toBe(false);
      // Uno publicado el 21, después de la devolución, sí.
      await tramiteEnlazado(tx, { actividadId: a, usuarioId: b.lider.usuarioId, etapa: "publicado", terminoEn: "2026-11-21T15:00:00Z" });
      expect((await leerActividad(responsable, a, LUEGO))?.tramiteQueVale).toBe(true);
      await terminarActividad(responsable, { actividadId: a }, LUEGO);
      expect((await filaDe(tx, a)).estado).toBe("terminada");
    }));
});

describe("reasignarActividad", () => {
  const motivo = MOTIVO;

  it("el anterior deja de verla y el nuevo la ve; sin seguimientos, el anterior pierde el hallazgo", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      expect((await misActividades(responsable, c(AHORA, tx))).map((x) => x.id)).toEqual([a]);
      // Las marcas de los avisos: la de vencida es de quien la tenía; el escalamiento, de la actividad; el recordatorio cuenta
      // desde la reasignación (ronda 1 de la Tarea 19: borrado, adelantaría el de la persona nueva).
      await tx`UPDATE mejora_actividades SET aviso_vencido_en = ${AHORA}, escalado_en = ${AHORA}, recordatorio_en = '2026-11-20T15:00:00Z' WHERE id = ${a}`;
      await reasignar(tx, b, a, nuevo.usuarioId);
      const marcas = await filaDe(tx, a);
      expect(marcas.aviso_vencido_en).toBeNull();
      expect((marcas.recordatorio_en as Date).toISOString()).toBe(new Date(AHORA).toISOString());
      expect((marcas.escalado_en as Date).toISOString()).toBe(new Date(AHORA).toISOString());
      expect((await filaDe(tx, a)).responsable_id).toBe(nuevo.usuarioId);
      expect(await misActividades(responsable, c(AHORA, tx))).toEqual([]);
      expect((await misActividades(nuevo, c(AHORA, tx))).map((x) => x.id)).toEqual([a]);
      expect(await participacionEnHallazgo(h.id, responsable, { sql: tx })).toBeNull();
      expect(await participacionEnHallazgo(h.id, nuevo, { sql: tx })).toBe("actividad");
      // El evento, con la forma exacta que lee la verificación; la bitácora, sin el motivo.
      const [e] = await tx`SELECT detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'reasignada'`;
      expect(e.detalle).toEqual({ actividadId: a, antes: responsable.usuarioId, despues: nuevo.usuarioId, motivo });
      expect(e.usuario_id).toBe(b.lider.usuarioId);
      // El historial (de quien ve el hallazgo completo) nombra a los dos, leídos de `antes` y `despues`.
      const delLider = await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(AHORA) });
      expect(delLider?.eventos.find((x) => x.tipo === "reasignada")?.personas).toEqual({ de: responsable.nombre, a: nuevo.nombre });
      expect(delLider?.eventos.find((x) => x.tipo === "aprobar_plan" || x.tipo === "revisar_plan")?.personas).toBeNull();
      const [bit] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_actividad_reasignada' AND entidad_id = ${a}`;
      expect(bit.detalle).toMatchObject({ codigo: h.codigo, actividad: "A1.1", antes: responsable.usuarioId, despues: nuevo.usuarioId });
      expect(JSON.stringify(bit.detalle)).not.toContain(motivo);
      // Avisa a los dos, con la actividad y su fin, nunca con el código ni el título del hallazgo.
      const alNuevo = await avisosDe(tx, nuevo.usuarioId, "mejora.actividad_reasignada");
      const alAnterior = await avisosDe(tx, responsable.usuarioId, "mejora.actividad_reasignada");
      expect(alNuevo).toHaveLength(1);
      expect(alAnterior).toHaveLength(1);
      expect(alNuevo[0].cuerpo).toBe("Actividad 1 del plan de prueba. Fecha de fin: 15 de diciembre de 2026.");
      expect(alNuevo[0].enlace).toBe(`/mejoramiento/actividades/${a}`);
      expect(alAnterior[0].enlace).toBeNull();
      expect(JSON.stringify([...alNuevo, ...alAnterior])).not.toMatch(new RegExp(`${h.codigo}|Formatos de entrega`));
    }));

  it("si el anterior registró un seguimiento, conserva la lectura del hallazgo y de la actividad", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      await registrarSeguimiento(responsable, seguimiento(a, 30), c(AHORA, tx));
      await reasignar(tx, b, a, nuevo.usuarioId);
      expect(await participacionEnHallazgo(h.id, responsable, { sql: tx })).toBe("actividad");
      const leida = await leerActividad(responsable, a, c(AHORA, tx));
      expect(leida?.esResponsable).toBe(false);
      expect(leida?.puedeSeguir).toBe(false);
      // El nuevo sigue desde el avance que dejó el anterior.
      await expect(registrarSeguimiento(nuevo, seguimiento(a, 20), c(AHORA, tx))).rejects.toThrow("(30 %)");
      await registrarSeguimiento(nuevo, seguimiento(a, 50), c(AHORA, tx));
    }));

  it("la matriz: quien no tiene mejora.formular (el rol Consulta) no reasigna, aunque sea el responsable", () =>
    revertida(sql, async (tx) => {
      const { responsable, ids } = await enEjecucion(tx);
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      await expect(
        reasignarActividad(responsable, { actividadId: ids[0], responsableId: nuevo.usuarioId, motivo }, c(AHORA, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
    }));

  it("un líder del proceso que es el responsable entrega su actividad a otra persona", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const [a] = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id}`).map((f) => Number(f.id));
      expect((await filaDe(tx, a)).responsable_id).toBe(b.lider.usuarioId);
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      await reasignar(tx, b, a, nuevo.usuarioId);
      expect((await filaDe(tx, a)).responsable_id).toBe(nuevo.usuarioId);
      // Nadie se avisa de lo que acaba de hacer: el aviso es solo para la persona nueva.
      expect(await avisosDe(tx, b.lider.usuarioId, "mejora.actividad_reasignada")).toHaveLength(0);
      expect(await avisosDe(tx, nuevo.usuarioId, "mejora.actividad_reasignada")).toHaveLength(1);
    }));

  it("quién reasigna: un líder del proceso o el Admin SGC; el responsable que no lidera el proceso, no", () =>
    revertida(sql, async (tx) => {
      const { b, ids } = await enEjecucion(tx);
      const [a] = ids;
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await otroProcesoConLider(tx);
      // El líder de otro proceso no lo ve: «no existe».
      await expect(reasignarActividad(otro.lider, { actividadId: a, responsableId: nuevo.usuarioId, motivo }, c(AHORA, tx))).rejects.toThrow("La actividad no existe");
      // Responsable que lidera otro proceso: tiene el permiso de la matriz, pero no lidera este.
      const liderResponsable = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [otro.procesoId] });
      await reasignar(tx, b, a, liderResponsable.usuarioId);
      await expect(
        reasignarActividad(liderResponsable, { actividadId: a, responsableId: nuevo.usuarioId, motivo }, c(AHORA, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      // El Admin SGC, aunque el proceso tenga líder.
      await reasignarActividad(b.admin, { actividadId: a, responsableId: nuevo.usuarioId, motivo }, c(AHORA, tx));
      expect((await filaDe(tx, a)).responsable_id).toBe(nuevo.usuarioId);
    }));

  it("el responsable nuevo es activo y distinto, el motivo tiene al menos 10 caracteres y la actividad no está terminada", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      await expect(reasignar(tx, b, a1, responsable.usuarioId)).rejects.toThrow("El responsable nuevo debe ser otra persona");
      await expect(reasignar(tx, b, a1, inactivo.usuarioId)).rejects.toThrow("El responsable nuevo debe ser un usuario activo");
      await expect(reasignarActividad(b.lider, { actividadId: a1, responsableId: b.consulta.usuarioId, motivo: "Corto" }, c(AHORA, tx))).rejects.toThrow(
        "El motivo debe tener al menos 10 caracteres",
      );
      await lista(tx, responsable, a2);
      await terminarActividad(responsable, { actividadId: a2 }, c(AHORA, tx));
      await expect(reasignar(tx, b, a2, b.consulta.usuarioId)).rejects.toThrow("Solo se reasigna una actividad sin terminar");
      expect(await tx`SELECT 1 FROM mejora_eventos WHERE tipo = 'reasignada' AND (detalle->>'actividadId')::bigint = ANY(${[a1, a2]})`).toHaveLength(0);
    }));

  it("un responsable desactivado: su actividad sigue a la vista del líder y se reasigna", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      await tx`UPDATE usuarios SET activo = false WHERE id = ${responsable.usuarioId}`;
      const delLider = await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(AHORA) });
      const actividad = delLider?.rondas.flatMap((r) => r.acciones.flatMap((x) => x.actividades)).find((x) => x.id === a);
      expect(actividad).toMatchObject({ responsableId: responsable.usuarioId, responsableActivo: false });
      expect((await leerActividad(b.lider, a, c(AHORA, tx)))?.responsableActivo).toBe(false);
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      await reasignar(tx, b, a, nuevo.usuarioId);
      expect((await filaDe(tx, a)).responsable_id).toBe(nuevo.usuarioId);
      // Al inactivo no se le avisa: no tiene cómo leerlo.
      expect(await avisosDe(tx, responsable.usuarioId, "mejora.actividad_reasignada")).toHaveLength(0);
      expect(await avisosDe(tx, nuevo.usuarioId, "mejora.actividad_reasignada")).toHaveLength(1);
    }));
});

describe("lo que se lee", () => {
  it("quien ve el hallazgo como «actividad» recibe el texto y ninguna lista de archivos que no sea de su actividad", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId, actividades: 2 });
      const [suya, ajena] = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`).map((f) => Number(f.id));
      await reasignar(tx, b, ajena, otro.usuarioId);
      const [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${h.id}`;
      await evidenciaDeActividad(tx, suya, responsable.usuarioId, "zz-suya.pdf");
      await evidenciaDeActividad(tx, ajena, otro.usuarioId, "zz-ajena.pdf");
      for (const [contexto, id, nombre] of [["mejora_hallazgo", h.id, "zz-del-hallazgo.pdf"], ["mejora_ronda", Number(r.id), "zz-de-la-ronda.pdf"]] as const) {
        await tx`INSERT INTO archivos (version_id, contexto, contexto_id, rol, ruta, nombre_original, extension, mime, tamano_bytes, hash_sha256)
          VALUES (NULL, ${contexto}, ${id}, ${contexto === "mejora_ronda" ? "analisis" : "evidencia"}, ${`mejoramiento/prueba/${Date.now()}-${nombre}`},
            ${nombre}, 'pdf', 'application/pdf', 10, ${"a".repeat(64)})`;
      }
      const d = await leerHallazgo(responsable, h.id, { sql: tx, ahora: new Date(AHORA) });
      expect(d?.ve).toBe("actividad");
      expect(d?.descripcion).toContain("formatos de entrega sin diligenciar");
      expect(d?.correccion.descripcion).toBe("Se diligenciaron los formatos pendientes con el turno");
      expect(d?.rondas[0].analisis.length).toBeGreaterThan(0);
      expect(d?.rondas[0].causas.length).toBeGreaterThan(0);
      expect(d?.rondas[0].acciones[0].actividades.map((x) => x.id)).toEqual([suya, ajena]);
      // De los archivos, solo los de su actividad: la otra actividad, el hallazgo y la ronda le dan la lista vacía.
      const nombres = async (contexto: string, contextoId: number) => (await archivosDe(tx, responsable, { contexto, contextoId })).archivos.map((x) => x.nombre);
      expect(await nombres("mejora_actividad", suya)).toEqual(["zz-suya.pdf"]);
      expect(await nombres("mejora_actividad", ajena)).toEqual([]);
      expect(await nombres("mejora_hallazgo", h.id)).toEqual([]);
      expect(await nombres("mejora_ronda", Number(r.id))).toEqual([]);
      // Quien lo ve completo, todos.
      expect((await archivosDe(tx, b.lider, { contexto: "mejora_hallazgo", contextoId: h.id })).archivos.map((x) => x.nombre)).toContain("zz-del-hallazgo.pdf");
      expect((await archivosDe(tx, b.lider, { contexto: "mejora_actividad", contextoId: ajena })).archivos.map((x) => x.nombre)).toEqual(["zz-ajena.pdf"]);
      // La página del hallazgo enlaza solo las actividades que quien mira abre.
      expect(d?.rondas[0].acciones[0].actividades.map((x) => x.seAbre)).toEqual([true, false]);
      const delLider = await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(AHORA) });
      expect(delLider?.rondas[0].acciones[0].actividades.map((x) => x.seAbre)).toEqual([true, true]);
      // Su actividad le muestra sus archivos; la ajena no existe para él.
      expect((await leerActividad(responsable, suya, c(AHORA, tx)))?.archivos.map((x) => x.nombre)).toEqual(["zz-suya.pdf"]);
      expect(await leerActividad(responsable, ajena, c(AHORA, tx))).toBeNull();
      // Quien lo ve completo abre las dos.
      expect((await leerActividad(b.lider, ajena, c(AHORA, tx)))?.archivos.map((x) => x.nombre)).toEqual(["zz-ajena.pdf"]);
    }));

  it("leerActividad: la actividad, su acción, el hallazgo, los seguimientos del más reciente al más antiguo y lo que puede hacer quien mira", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      await registrarSeguimiento(responsable, seguimiento(a, 10, { fecha: "2026-11-17", realizado: "Se definieron las especificaciones" }), c(AHORA, tx));
      await registrarSeguimiento(responsable, seguimiento(a, 30), c(AHORA, tx));
      const d = await leerActividad(responsable, a, c(AHORA, tx));
      expect(d).toMatchObject({
        id: a,
        etiqueta: "A1.1",
        descripcion: "Actividad 1 del plan de prueba",
        fin: "2026-12-15",
        finOriginal: "2026-12-15",
        avance: 30,
        estado: "en_proceso",
        esResponsable: true,
        responsableActivo: true,
        puedeSeguir: true,
        puedeReasignar: false,
        ajustePendiente: null,
        accion: { etiqueta: "A1", tipo: "correctiva" },
        hallazgo: { id: h.id, codigo: h.codigo, estado: "en_ejecucion", ve: "actividad" },
      });
      expect(d?.seguimientos.map((s) => [s.fecha, s.avance])).toEqual([
        [HOY, 30],
        ["2026-11-17", 10],
      ]);
      expect(d?.avanceMinimo).toBe(30);
      const delLider = await leerActividad(b.lider, a, c(AHORA, tx));
      expect(delLider).toMatchObject({ esResponsable: false, puedeSeguir: false, puedeReasignar: true, hallazgo: { ve: "completo" } });
      expect(await leerActividad(b.consulta, a, c(AHORA, tx))).toBeNull();
      expect(await leerActividad(responsable, 987654321, c(AHORA, tx))).toBeNull();
    }));

  it("el avance de la acción y del hallazgo: el promedio de las actividades no canceladas, también en la lista", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx, 3);
      const [a1, a2, a3] = ids;
      await registrarSeguimiento(responsable, seguimiento(a1, 40), c(AHORA, tx));
      await registrarSeguimiento(responsable, seguimiento(a2, 100), c(AHORA, tx));
      await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = ${AHORA} WHERE id = ${a3}`;
      const d = await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(AHORA) });
      expect(d?.rondas[0].acciones[0].avance).toBe(70);
      expect(d?.avance).toBe(70);
      const { filas } = await listarHallazgos(b.lider, {}, { sql: tx, ahora: new Date(AHORA) });
      expect(filas.find((f) => f.id === h.id)?.avance).toBe(70);
    }));

  it("ver algún hallazgo (también por una actividad) y cuántas actividades tiene: lo que decide la redirección y las pestañas", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, ids } = await enEjecucion(tx, 2);
      expect(await veAlgunHallazgo(responsable, { sql: tx })).toBe(true);
      expect(await veAlgunHallazgo(b.lider, { sql: tx })).toBe(true);
      expect(await veAlgunHallazgo(b.consulta, { sql: tx })).toBe(false);
      expect(await contarMisActividades(responsable, { sql: tx })).toBe(2);
      expect(await contarMisActividades(b.consulta, { sql: tx })).toBe(0);
      // Las de un borrador no cuentan.
      await tx`UPDATE mejora_actividades SET fin_original = NULL WHERE id = ${ids[0]}`;
      expect(await contarMisActividades(responsable, { sql: tx })).toBe(1);
    }));

  it("misActividades: las suyas de un plan aprobado, con lo vencido y lo devuelto", () =>
    revertida(sql, async (tx) => {
      const { responsable, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      await tx`UPDATE mejora_actividades SET verificacion = 'devuelta' WHERE id = ${a2}`;
      const despues = c("2026-12-16T15:00:00Z", tx);
      const lista = await misActividades(responsable, despues);
      expect(lista).toEqual([
        { id: a1, descripcion: "Actividad 1 del plan de prueba", hallazgoId: h.id, hallazgoCodigo: h.codigo, etiqueta: "A1.1", fin: "2026-12-15", vence: "2026-12-15", avance: 0, estado: "abierta", vencida: true, devuelta: false },
        { id: a2, descripcion: "Actividad 2 del plan de prueba", hallazgoId: h.id, hallazgoCodigo: h.codigo, etiqueta: "A1.2", fin: "2026-12-15", vence: "2026-12-15", avance: 0, estado: "abierta", vencida: true, devuelta: true },
      ]);
      expect((await misActividades(responsable, c(AHORA, tx))).every((x) => !x.vencida)).toBe(true);
      // Una actividad de un borrador no es de nadie todavía.
      await tx`UPDATE mejora_actividades SET fin_original = NULL WHERE id = ${a1}`;
      expect((await misActividades(responsable, c(AHORA, tx))).map((x) => x.id)).toEqual([a2]);
    }));
});
