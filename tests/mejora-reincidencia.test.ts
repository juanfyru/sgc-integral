/**
 * Parecidos, reincidencia, ocurrencias, edición, reclasificación y anulación de un hallazgo (Fase 15A, Tarea 8). Contra
 * la BD de trabajo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const { sesionDePeticion } = vi.hoisted(() => ({ sesionDePeticion: vi.fn() }));
vi.mock("@/lib/sesion-actual", () => ({ sesionDePeticion }));

import type { TransactionSql } from "postgres";
import { GET as pedirParecidos } from "@/app/(app)/mejoramiento/parecidos/route";
import { obtenerSql } from "@/db/cliente";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { listarHallazgos } from "@/db/consultas/mejoramiento/lectura";
import { parecidosDeOtrosProcesos, parecidosDelProceso } from "@/db/consultas/mejoramiento/parecidos";
import {
  anularHallazgo,
  cambiarProceso,
  editarHallazgo,
  reclasificarHallazgo,
  registrarHallazgo,
  registrarOcurrencia,
} from "@/db/consultas/mejoramiento/registro";
import { formularAntesDe } from "@/lib/mejoramiento/plazos";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso } from "@/lib/permisos";
import { actividadPorSql, baseDeMejora, c, datosDeHallazgo, otroProcesoConLider, type BaseDeMejora } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";
const DESPUES = "2026-11-18T15:00:00Z";

const nuevo = (tx: TransactionSql, b: BaseDeMejora, quien = b.control, cambios?: Parameters<typeof datosDeHallazgo>[1]) =>
  registrarHallazgo(quien, datosDeHallazgo(b.procesoId, cambios), c(AHORA, tx));
const poner = (tx: TransactionSql, id: number, estado: string) => tx`UPDATE mejora_hallazgos SET estado = ${estado} WHERE id = ${id}`;
const cerrarPorSql = (tx: TransactionSql, id: number) =>
  tx`UPDATE mejora_hallazgos SET estado = 'cerrado', cerrado_en = ${new Date(AHORA)}, resultado_cierre = 'con_correccion' WHERE id = ${id}`;
const fila = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM mejora_hallazgos WHERE id = ${id}`)[0];
const eventos = (tx: TransactionSql, id: number, tipo: string) =>
  tx`SELECT tipo, detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = ${tipo} ORDER BY id`;
const avisos = async (tx: TransactionSql, id: number, tipo: string) =>
  (await tx`SELECT usuario_id FROM notificaciones WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND tipo = ${tipo} ORDER BY usuario_id`).map((f) =>
    Number(f.usuario_id),
  );
const totalDeHallazgos = async (tx: TransactionSql) => Number((await tx`SELECT count(*) AS n FROM mejora_hallazgos`)[0].n);

describe("parecidosDelProceso", () => {
  it("encuentra el del mismo proceso con el texto parecido y las tildes distintas, no el de otro proceso ni el anulado", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const mismo = await nuevo(tx, b);
      const ajeno = await registrarHallazgo(b.control, datosDeHallazgo(otro.procesoId), c(AHORA, tx));
      const anulado = await nuevo(tx, b);
      await poner(tx, anulado.id, "anulado");
      const rechazado = await nuevo(tx, b);
      await poner(tx, rechazado.id, "rechazado");

      const d = datosDeHallazgo(b.procesoId);
      const texto = `${d.titulo} ${d.descripcion}`.replace("revisión", "revision").replace("diligenciar", "díligenciár");
      const r = await parecidosDelProceso(tx, { procesoId: b.procesoId, texto });
      expect(r.map((p) => p.id)).toEqual([mismo.id]);
      expect(r[0]).toMatchObject({ codigo: mismo.codigo, abierto: true, etiqueta: "Por aceptar" });
      expect(r[0].cuando).toBeInstanceOf(Date);
      expect(r.map((p) => p.id)).not.toContain(ajeno.id);

      expect(await parecidosDelProceso(tx, { procesoId: b.procesoId, texto, excluirId: mismo.id })).toEqual([]);
      expect(await parecidosDelProceso(tx, { procesoId: b.procesoId, texto: "Algo completamente distinto sobre otra cosa" })).toEqual([]);

      await cerrarPorSql(tx, mismo.id);
      expect((await parecidosDelProceso(tx, { procesoId: b.procesoId, texto }))[0]).toMatchObject({ id: mismo.id, abierto: false });
    });
  });

  it("los de otros procesos los ve quien revisa el plan, con su proceso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const propio = await nuevo(tx, b);
      const ajeno = await registrarHallazgo(b.control, datosDeHallazgo(otro.procesoId), c(AHORA, tx));
      const r = await parecidosDeOtrosProcesos(tx, propio.id);
      expect(r.map((p) => p.id)).toEqual([ajeno.id]);
      expect(typeof r[0].proceso).toBe("string");
    });
  });
});

describe("la ruta de parecidos", () => {
  beforeEach(() => sesionDePeticion.mockReset());
  const pedir = (consulta: string) => pedirParecidos(new NextRequest(`http://sgc.local/mejoramiento/parecidos?${consulta}`));
  const TEXTO = "q=" + encodeURIComponent("Formatos de entrega de turno sin diligenciar en la unidad");

  it("sin sesión responde 401", async () => {
    sesionDePeticion.mockResolvedValue(null);
    expect((await pedir(`proceso=1&${TEXTO}`)).status).toBe(401);
  });

  it("responde 404 a quien no puede registrar en ese proceso", async () => {
    // Un líder que no lidera nada: otro proceso. (El usuario no existe: su alcance es vacío.)
    sesionDePeticion.mockResolvedValue({ usuarioId: 2147483000, rol: "lider_proceso", verHistorial: false });
    expect((await pedir(`proceso=1&${TEXTO}`)).status).toBe(404);
    // Un rol sin el permiso de registrar.
    sesionDePeticion.mockResolvedValue({ usuarioId: 2147483001, rol: "consulta", verHistorial: false });
    expect((await pedir(`proceso=1&${TEXTO}`)).status).toBe(404);
    // Un proceso que no es un número.
    sesionDePeticion.mockResolvedValue({ usuarioId: 2147483002, rol: "admin_sgc", verHistorial: false });
    expect((await pedir(`proceso=abc&${TEXTO}`)).status).toBe(404);
  });

  it("a quien puede registrar le responde con la lista (vacía si el texto es corto)", async () => {
    sesionDePeticion.mockResolvedValue({ usuarioId: 2147483002, rol: "admin_sgc", verHistorial: false });
    const corto = await pedir("proceso=1&q=hola");
    expect(corto.status).toBe(200);
    expect(await corto.json()).toEqual({ parecidos: [] });
    const largo = await pedir(`proceso=1&${TEXTO}`);
    expect(largo.status).toBe(200);
    expect(Array.isArray((await largo.json()).parecidos)).toBe(true);
  });
});

describe("registrarOcurrencia", () => {
  const dato = (hallazgoId: number) => ({ hallazgoId, fecha: "2026-11-16", descripcion: "Volvió a ocurrir en el turno de la noche" });

  it("no crea un hallazgo: deja la fila, el evento y el aviso a los líderes y al Admin SGC", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      const antes = await totalDeHallazgos(tx);
      await registrarOcurrencia(b.control, dato(h.id), c(DESPUES, tx));
      expect(await totalDeHallazgos(tx)).toBe(antes);

      const o = await tx`SELECT hallazgo_id, origen, registrado_por, to_char(fecha, 'YYYY-MM-DD') AS fecha, descripcion
        FROM mejora_ocurrencias WHERE hallazgo_id = ${h.id}`;
      expect(o).toHaveLength(1);
      expect(o[0]).toMatchObject({ origen: "registro", fecha: "2026-11-16" });
      expect(Number(o[0].registrado_por)).toBe(b.control.usuarioId);
      expect((await eventos(tx, h.id, "ocurrencia")).length).toBe(1);

      const avisados = await avisos(tx, h.id, "mejora.ocurrencia");
      expect(avisados).toContain(b.lider.usuarioId);
      expect(avisados).toContain(b.admin.usuarioId);
      expect(avisados).not.toContain(b.control.usuarioId);
      const activos = await tx`SELECT id FROM usuarios WHERE rol = 'admin_sgc' AND activo`;
      for (const a of activos) expect(avisados).toContain(Number(a.id));
    });
  });

  it("en uno en espera de eficacia avisa además a quienes pueden verificarlo, como posible recurrencia", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "en_espera");
      await registrarOcurrencia(b.lider, dato(h.id), c(DESPUES, tx));
      const recurrencia = await avisos(tx, h.id, "mejora.recurrencia");
      expect(recurrencia).toContain(b.control.usuarioId);
      expect(recurrencia).toContain(b.gerencia.usuarioId);
    });
  });

  it("sobre un hallazgo cerrado lanza «regístrelo como reincidencia»; un líder de otro proceso, «no existe»", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await nuevo(tx, b);
      await expect(registrarOcurrencia(otro.lider, dato(h.id), c(DESPUES, tx))).rejects.toThrow("El hallazgo no existe");
      await cerrarPorSql(tx, h.id);
      await expect(registrarOcurrencia(b.control, dato(h.id), c(DESPUES, tx))).rejects.toThrow(
        "El hallazgo ya terminó: regístrelo como reincidencia",
      );
      await expect(registrarOcurrencia(b.consulta, dato(h.id), c(DESPUES, tx))).rejects.toBeInstanceOf(ErrorPermiso);
    });
  });
});

describe("la reincidencia", () => {
  it("solo enlaza un cerrado del mismo proceso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const abierto = await nuevo(tx, b);
      const cerrado = await nuevo(tx, b);
      await cerrarPorSql(tx, cerrado.id);
      const deOtro = await registrarHallazgo(b.control, datosDeHallazgo(otro.procesoId), c(AHORA, tx));
      await cerrarPorSql(tx, deOtro.id);

      await expect(nuevo(tx, b, b.control, { reincidenteDe: abierto.id })).rejects.toThrow("Solo se marca reincidencia de un hallazgo cerrado");
      await expect(nuevo(tx, b, b.control, { reincidenteDe: deOtro.id })).rejects.toThrow("del mismo proceso");

      const r = await nuevo(tx, b, b.control, { reincidenteDe: cerrado.id });
      expect(Number((await fila(tx, r.id)).reincidente_de)).toBe(cerrado.id);
    });
  });
});

describe("editarHallazgo", () => {
  it("quien lo registró, en «Por aceptar», cambia el título y queda el evento con el antes y el después", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await editarHallazgo(b.control, h.id, datosDeHallazgo(b.procesoId, { titulo: "Entrega de turno sin diligenciar" }), c(DESPUES, tx));
      expect((await fila(tx, h.id)).titulo).toBe("Entrega de turno sin diligenciar");
      const e = await eventos(tx, h.id, "editado");
      expect(e).toHaveLength(1);
      expect(e[0].detalle).toEqual({
        antes: { titulo: "Formatos de entrega de turno sin diligenciar" },
        despues: { titulo: "Entrega de turno sin diligenciar" },
      });
      await expect(editarHallazgo(b.control, h.id, datosDeHallazgo(b.procesoId, { titulo: "Entrega de turno sin diligenciar" }), c(DESPUES, tx))).rejects.toThrow(
        "No cambió ningún dato del hallazgo",
      );
    });
  });

  it("en «Por corregir» lanza YA_CAMBIO; otra persona, ErrorPermiso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await expect(editarHallazgo(b.admin, h.id, datosDeHallazgo(b.procesoId, { titulo: "Otro título" }), c(DESPUES, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      await poner(tx, h.id, "por_corregir");
      await expect(editarHallazgo(b.control, h.id, datosDeHallazgo(b.procesoId, { titulo: "Otro título" }), c(DESPUES, tx))).rejects.toThrow(YA_CAMBIO);
    });
  });

  it("si el origen pasa a externo, el hallazgo queda aceptado", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await editarHallazgo(
        b.control,
        h.id,
        datosDeHallazgo(b.procesoId, { origen: "ente_control", fechaLimiteEnte: "2026-12-15", fuente: "Visita de la Superintendencia" }),
        c(DESPUES, tx),
      );
      expect((await fila(tx, h.id)).estado).toBe("por_corregir");
    });
  });
});

type Ajuste = Partial<Parameters<typeof reclasificarHallazgo>[1]>;

/** Reclasifica con lo que la fila ya tiene, más lo que cambia. */
async function reclasificar(tx: TransactionSql, quien: BaseDeMejora["admin"], id: number, cambios: Ajuste, ahora = DESPUES) {
  const f = await fila(tx, id);
  return reclasificarHallazgo(
    quien,
    {
      hallazgoId: id,
      clase: f.clase,
      criticidad: f.criticidad,
      origen: f.origen,
      fuente: f.fuente,
      titulo: f.titulo,
      requisitoClausula: f.requisito_clausula,
      requisitoNormaId: null,
      requisitoDocumentoId: null,
      reincidenteDe: f.reincidente_de === null ? null : Number(f.reincidente_de),
      fechaLimiteEnte: null,
      nota: null,
      justificacion: "Se corrige la clasificación",
      ...cambios,
    },
    c(ahora, tx),
  );
}

describe("reclasificarHallazgo (spec §7.6)", () => {
  it("de no conformidad a oportunidad en «Por decidir»: queda «Por formular», conserva la corrección y cuenta el plazo otra vez", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "por_decidir");
      await tx`UPDATE mejora_hallazgos SET correccion_requerida = true, correccion_descripcion = 'Se corrigió el registro',
        correccion_registrada_en = ${new Date(AHORA)} WHERE id = ${h.id}`;
      await reclasificar(tx, b.admin, h.id, { clase: "oportunidad", criticidad: null, nota: "Es una oportunidad, no un incumplimiento" });
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({ estado: "por_formular", clase: "oportunidad", criticidad: null, correccion_descripcion: "Se corrigió el registro" });

      const ctx = await contextoDeMejora(tx, new Date(DESPUES));
      const esperado = formularAntesDe({ registradoEn: new Date(DESPUES), fechaLimiteEnte: null }, ctx);
      expect(f.vence_en).toEqual(esperado);
      const [r] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      expect(r.formular_antes_de).toEqual(esperado);

      const [e] = await eventos(tx, h.id, "reclasificar");
      expect(e.detalle).toMatchObject({
        antes: { clase: "no_conformidad", criticidad: "media" },
        despues: { clase: "oportunidad", criticidad: null },
        justificacion: "Se corrige la clasificación",
        nota: "Es una oportunidad, no un incumplimiento",
        estado: { antes: "por_decidir", despues: "por_formular" },
      });
      expect(await avisos(tx, h.id, "mejora.turno")).toContain(b.lider.usuarioId);
    });
  });

  it("de oportunidad a no conformidad en «Por formular», sin corrección: queda «Por corregir»", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b, b.control, { clase: "oportunidad", criticidad: null });
      await poner(tx, h.id, "por_formular");
      await reclasificar(tx, b.admin, h.id, { clase: "no_conformidad", criticidad: "media" });
      expect((await fila(tx, h.id)).estado).toBe("por_corregir");
    });
  });

  it("de oportunidad a no conformidad con corrección ya registrada: «Por decidir», o «Por formular» si la acción es obligada", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const a = await nuevo(tx, b, b.control, { clase: "oportunidad", criticidad: null });
      const z = await nuevo(tx, b, b.control, { clase: "oportunidad", criticidad: null });
      for (const id of [a.id, z.id]) {
        await poner(tx, id, "por_formular");
        await tx`UPDATE mejora_hallazgos SET correccion_descripcion = 'Corregido', correccion_registrada_en = ${new Date(AHORA)} WHERE id = ${id}`;
      }
      await reclasificar(tx, b.admin, a.id, { clase: "no_conformidad", criticidad: "media" });
      await reclasificar(tx, b.admin, z.id, { clase: "no_conformidad", criticidad: "alta" });
      expect((await fila(tx, a.id)).estado).toBe("por_decidir");
      expect((await fila(tx, z.id)).estado).toBe("por_formular");
    });
  });

  it("subir la criticidad a alta en «Por validar la corrección» deja «Por formular»", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "por_validar");
      await reclasificar(tx, b.admin, h.id, { criticidad: "alta" });
      expect(await fila(tx, h.id)).toMatchObject({ estado: "por_formular", criticidad: "alta" });
    });
  });

  it("marcarlo reincidente en «Por decidir» deja «Por formular»", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const anterior = await nuevo(tx, b);
      await cerrarPorSql(tx, anterior.id);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "por_decidir");
      await reclasificar(tx, b.admin, h.id, { reincidenteDe: anterior.id });
      expect(await fila(tx, h.id)).toMatchObject({ estado: "por_formular", reincidente_de: anterior.id });
    });
  });

  it("el origen a ente de control en «Por aceptar» lo deja aceptado, y avisa como externo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await reclasificar(tx, b.admin, h.id, { origen: "ente_control", fuente: "Visita de la Superintendencia", fechaLimiteEnte: "2026-12-15" });
      expect(await fila(tx, h.id)).toMatchObject({ estado: "por_corregir", origen: "ente_control" });
      expect(await avisos(tx, h.id, "mejora.externo")).toContain(b.gerencia.usuarioId);
    });
  });

  it("bajar la criticidad en «Por formular» no cambia el estado ni el plazo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b, b.control, { criticidad: "alta" });
      await poner(tx, h.id, "por_formular");
      const antes = await fila(tx, h.id);
      await reclasificar(tx, b.admin, h.id, { criticidad: "media" });
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({ estado: "por_formular", criticidad: "media" });
      expect(f.vence_en).toEqual(antes.vence_en);
    });
  });

  it("pide una justificación de diez caracteres, y solo el Admin SGC reclasifica", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await expect(reclasificar(tx, b.admin, h.id, { criticidad: "alta", justificacion: "corto" })).rejects.toThrow(
        "La justificación debe tener al menos 10 caracteres",
      );
      await expect(reclasificar(tx, b.lider, h.id, { criticidad: "alta" })).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(reclasificar(tx, b.control, h.id, { criticidad: "alta" })).rejects.toBeInstanceOf(ErrorPermiso);
    });
  });

  it("en «En revisión» lanza YA_CAMBIO", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "en_revision");
      await expect(reclasificar(tx, b.admin, h.id, { criticidad: "alta" })).rejects.toThrow(YA_CAMBIO);
    });
  });

  it("lo firmado no se reclasifica: tras una devolución del plan o en la ronda 2", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "por_formular");
      await tx`UPDATE mejora_rondas SET enviado_en = ${new Date(AHORA)} WHERE hallazgo_id = ${h.id} AND numero = 1`;
      await expect(reclasificar(tx, b.admin, h.id, { criticidad: "alta" })).rejects.toThrow("La identificación ya se firmó: no se puede reclasificar");

      const k = await nuevo(tx, b);
      await poner(tx, k.id, "por_formular");
      await tx`UPDATE mejora_hallazgos SET ronda = 2 WHERE id = ${k.id}`;
      await expect(reclasificar(tx, b.admin, k.id, { criticidad: "alta" })).rejects.toBeInstanceOf(ErrorMejora);
      await expect(reclasificar(tx, b.admin, k.id, { criticidad: "alta" })).rejects.toThrow("La identificación ya se firmó");
    });
  });
});

describe("cambiarProceso", () => {
  it("solo en «Por aceptar», y avisa a los líderes del proceso nuevo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await nuevo(tx, b);
      await cambiarProceso(b.admin, { hallazgoId: h.id, procesoId: otro.procesoId, justificacion: "Corresponde a otro proceso" }, c(DESPUES, tx));
      expect(Number((await fila(tx, h.id)).proceso_id)).toBe(otro.procesoId);
      expect(await avisos(tx, h.id, "mejora.turno")).toContain(otro.lider.usuarioId);
      expect((await eventos(tx, h.id, "proceso_cambiado")).length).toBe(1);

      await poner(tx, h.id, "por_corregir");
      await expect(
        cambiarProceso(b.admin, { hallazgoId: h.id, procesoId: b.procesoId, justificacion: "Corresponde a otro proceso" }, c(DESPUES, tx)),
      ).rejects.toThrow(YA_CAMBIO);
    });
  });
});

describe("anularHallazgo", () => {
  it("queda «Anulado» con su código; cancela las actividades sin terminar, avisa y no cuenta en las cifras", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await poner(tx, h.id, "en_ejecucion");
      const abierta = await actividadPorSql(tx, h.id, b.consulta.usuarioId);
      const hecha = await actividadPorSql(tx, h.id, b.consulta.usuarioId, { accionDe: abierta, estado: "terminada" });
      const antes = (await listarHallazgos(b.admin, {}, { sql: tx, ahora: new Date(DESPUES) })).cifras.abiertos;

      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró por error" }, c(DESPUES, tx));

      expect(await fila(tx, h.id)).toMatchObject({ estado: "anulado", anulado_motivo: "Se registró por error", codigo: h.codigo });
      const acts = await tx`SELECT id, estado, cancelada_en FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`;
      expect(acts.find((a) => Number(a.id) === abierta)).toMatchObject({ estado: "cancelada" });
      expect(acts.find((a) => Number(a.id) === abierta)!.cancelada_en).toEqual(new Date(DESPUES));
      expect(acts.find((a) => Number(a.id) === hecha)).toMatchObject({ estado: "terminada", cancelada_en: null });

      const avisados = await avisos(tx, h.id, "mejora.anulado");
      expect(avisados).toContain(b.lider.usuarioId);
      expect(avisados).toContain(b.consulta.usuarioId);
      expect(avisados).not.toContain(b.admin.usuarioId);

      const despues = (await listarHallazgos(b.admin, {}, { sql: tx, ahora: new Date(DESPUES) })).cifras.abiertos;
      expect(despues).toBe(antes - 1);
      const [ev] = await eventos(tx, h.id, "anular");
      expect(ev.detalle).toMatchObject({ justificacion: "Se registró por error", estado: { antes: "en_ejecucion", despues: "anulado" } });
    });
  });

  it("anula en cualquier estado no terminal; uno cerrado lanza YA_CAMBIO; pide justificación y permiso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await nuevo(tx, b);
      await expect(anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "corto" }, c(DESPUES, tx))).rejects.toThrow(
        "La justificación debe tener al menos 10 caracteres",
      );
      await expect(anularHallazgo(b.lider, { hallazgoId: h.id, justificacion: "Un duplicado de otro" }, c(DESPUES, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Un duplicado de otro" }, c(DESPUES, tx));
      expect((await fila(tx, h.id)).estado).toBe("anulado");

      const k = await nuevo(tx, b);
      await cerrarPorSql(tx, k.id);
      await expect(anularHallazgo(b.admin, { hallazgoId: k.id, justificacion: "Un duplicado de otro" }, c(DESPUES, tx))).rejects.toThrow(YA_CAMBIO);
    });
  });
});
