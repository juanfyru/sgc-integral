/**
 * Los reportes de funcionarios (Fase 15A, Tarea 18; spec 15 §7.3, §6.3 y F15-DC5): cualquier persona reporta; el Admin SGC lo
 * convierte en un hallazgo, lo suma como ocurrencia de uno abierto o lo descarta. Quien reportó ve su reporte y una etiqueta,
 * nunca el código, el título ni el enlace del hallazgo; su nombre lo ven solo los roles de control. Contra la BD de trabajo,
 * dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { abiertosParecidosAlReporte } from "@/db/consultas/mejoramiento/parecidos";
import { rechazarHallazgo, retirarHallazgo, validarCorreccion } from "@/db/consultas/mejoramiento/recorrido";
import { anularHallazgo, registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import {
  AVISO_ATENDIDO,
  AVISO_DESCARTADO,
  AVISO_EN_TRAMITE,
  descartarReporte,
  enviarReporte,
  leerReporte,
  misReportes,
  reportesRecibidos,
  sumarReporte,
  YA_CLASIFICADO,
} from "@/db/consultas/mejoramiento/reportes";
import { puedeVerHallazgo } from "@/lib/alcance";
import { FECHA_FUERA_DE_RANGO } from "@/lib/esquemas/mejoramiento";
import { formularAntesDe, venceEn } from "@/lib/mejoramiento/plazos";
import { ErrorPermiso } from "@/lib/permisos";
import { baseDeMejora, c, datosDeHallazgo, hallazgoEn, HORA_DE_ESCENA, otroProcesoConLider, type BaseDeMejora } from "./utiles/mejoramiento";
import { usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

/** Lo que reporta la funcionaria: un texto que no aparece en ningún otro lado. */
const LO_QUE_VIO = "La nevera del servicio de urgencias marcaba 12 grados en la mañana y nadie la registró";
const REFERENCIA = "EA-2026-0417";

/** Martes 10 de noviembre de 2026, 10:00 en Bogotá: una semana antes de la escena. */
const ANTES = "2026-11-10T15:00:00Z";

/** Quien reporta, con un nombre que no aparece en ningún otro lado (los de prueba son «Prueba N»). */
async function funcionaria(tx: TransactionSql): Promise<SesionFlujo> {
  const s = await usuarioDePrueba(tx, { rol: "consulta" });
  const nombre = `Funcionaria Reportante ${Date.now()}`;
  await tx`UPDATE usuarios SET nombre = ${nombre} WHERE id = ${s.usuarioId}`;
  return { ...s, nombre };
}

const reporteDe = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM mejora_reportes WHERE id = ${id}`)[0];
const eventosDe = async (tx: TransactionSql, id: number) =>
  (await tx`SELECT tipo, usuario_id, detalle FROM mejora_reporte_eventos WHERE reporte_id = ${id} ORDER BY id`).map((e) => ({
    tipo: e.tipo as string,
    usuarioId: Number(e.usuario_id),
    detalle: e.detalle as Record<string, unknown>,
  }));
const bitacoraDe = async (tx: TransactionSql, id: number) =>
  tx`SELECT accion, usuario_id, detalle FROM auditoria WHERE entidad = 'mejora_reporte' AND entidad_id = ${id} ORDER BY id`;
const avisosDe = async (tx: TransactionSql, usuarioId: number) =>
  tx`SELECT tipo, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${usuarioId} ORDER BY id`;
const activosDe = async (tx: TransactionSql, roles: string[]) =>
  (await tx`SELECT id FROM usuarios WHERE rol = ANY(${roles}) AND activo ORDER BY id`).map((f) => Number(f.id));

/** Un reporte de `quien` en el proceso de la base, enviado a `ahora`. */
async function reportar(tx: TransactionSql, b: BaseDeMejora, quien: SesionFlujo, ahora = HORA_DE_ESCENA, cambios?: { procesoId?: number | null }) {
  return enviarReporte(
    quien,
    { descripcion: LO_QUE_VIO, vistoEn: "2026-11-09", procesoId: cambios && "procesoId" in cambios ? cambios.procesoId : b.procesoId, referenciaCaso: REFERENCIA },
    c(ahora, tx),
  );
}

/** El Admin SGC convierte el reporte en un hallazgo (una no conformidad de la base). */
const convertir = (tx: TransactionSql, b: BaseDeMejora, reporteId: number, ahora = HORA_DE_ESCENA) =>
  registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId, { reporteId }), c(ahora, tx));

/** Nada de lo que recibe quien reportó lleva el código, el título ni el enlace del hallazgo. */
async function sinNadaDelHallazgo(tx: TransactionSql, quien: SesionFlujo, h: { codigo: string; titulo: string }) {
  const lo = JSON.stringify({ mios: await misReportes(quien, { sql: tx }), avisos: await avisosDe(tx, quien.usuarioId) });
  expect(lo).not.toContain(h.codigo);
  expect(lo).not.toContain(h.titulo);
  for (const a of await avisosDe(tx, quien.usuarioId)) {
    expect(a.entidad).toBe("mejora_reporte");
    expect(String(a.enlace ?? "")).not.toMatch(/^\/mejoramiento\/\d/);
  }
}

describe("enviarReporte", () => {
  it("cualquier rol reporta, también Consulta: queda recibido, con su plazo de clasificar y un aviso a cada Admin SGC", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ahora = new Date(HORA_DE_ESCENA);
      const ctx = await contextoDeMejora(tx, ahora);
      const admins = await activosDe(tx, ["admin_sgc"]);
      for (const quien of [b.admin, b.control, b.gerencia, b.lider, b.consulta]) {
        const { id } = await reportar(tx, b, quien);
        const r = await reporteDe(tx, id);
        expect(r).toMatchObject({ estado: "recibido", descripcion: LO_QUE_VIO, referencia_caso: REFERENCIA, hallazgo_id: null });
        expect(Number(r.reportado_por)).toBe(quien.usuarioId);
        expect(r.reportado_en).toEqual(ahora);
        expect(r.vence_en).toEqual(venceEn("clasificar", ahora, ctx));
        expect((await eventosDe(tx, id)).map((e) => e.tipo)).toEqual(["enviado"]);
        const avisados = (
          await tx`SELECT usuario_id FROM notificaciones WHERE tipo = 'mejora.reporte_recibido' AND entidad = 'mejora_reporte'
            AND entidad_id = ${id} ORDER BY usuario_id`
        ).map((f) => Number(f.usuario_id));
        // Nadie se avisa de lo que acaba de hacer.
        expect(avisados).toEqual(admins.filter((u) => u !== quien.usuarioId));
      }
    });
  });

  it("la bitácora y los avisos no llevan lo que se escribió", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await reportar(tx, b, b.consulta);
      const bitacora = await bitacoraDe(tx, id);
      expect(bitacora.map((f) => f.accion)).toEqual(["mejora_reporte_enviado"]);
      expect(Number(bitacora[0].usuario_id)).toBe(b.consulta.usuarioId);
      const avisos = await tx`SELECT titulo, cuerpo, enlace FROM notificaciones WHERE entidad = 'mejora_reporte' AND entidad_id = ${id}`;
      const todo = JSON.stringify({ bitacora, avisos });
      expect(todo).not.toContain(LO_QUE_VIO);
      expect(todo).not.toContain(REFERENCIA);
      expect(avisos.every((a) => a.enlace === "/mejoramiento/reportes?vista=recibidos")).toBe(true);
    });
  });

  it("rechaza lo que no se puede guardar", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(HORA_DE_ESCENA, tx);
      const base = { descripcion: LO_QUE_VIO, vistoEn: "2026-11-09" };
      await expect(enviarReporte(b.consulta, { ...base, descripcion: "Muy corto" }, o)).rejects.toThrow("Cuente qué vio, en al menos 10 caracteres");
      await expect(enviarReporte(b.consulta, { ...base, vistoEn: "2026-11-18" }, o)).rejects.toThrow("La fecha en que lo vio no puede ser futura");
      await expect(enviarReporte(b.consulta, { ...base, vistoEn: "1999-12-31" }, o)).rejects.toThrow(FECHA_FUERA_DE_RANGO);
      await expect(enviarReporte(b.consulta, { ...base, vistoEn: "2026-02-30" }, o)).rejects.toThrow("Escriba una fecha válida en que lo vio");
      await tx`UPDATE procesos SET activo = false WHERE id = ${b.procesoId}`;
      await expect(enviarReporte(b.consulta, { ...base, procesoId: b.procesoId }, o)).rejects.toThrow("Elija un proceso activo");
      // Sin proceso («no sé») y sin referencia, sí.
      const { id } = await enviarReporte(b.consulta, base, o);
      expect(await reporteDe(tx, id)).toMatchObject({ proceso_id: null, referencia_caso: null, estado: "recibido" });
    });
  });
});

describe("convertir un reporte en hallazgo", () => {
  it("quien reportó ve su reporte y nada del hallazgo (Review Focus 1)", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const { id: reporteId } = await reportar(tx, b, quien);
      const h = await convertir(tx, b, reporteId);
      const titulo = datosDeHallazgo(b.procesoId).titulo;

      const mios = await misReportes(quien, { sql: tx });
      expect(mios.find((r) => r.id === reporteId)).toMatchObject({ etiqueta: "En trámite", descripcion: LO_QUE_VIO, motivo: null });
      const leido = await leerReporte(quien, reporteId, { sql: tx });
      expect(leido).toMatchObject({ etiqueta: "En trámite", suyo: true, control: null });
      expect(JSON.stringify(leido)).not.toContain(h.codigo);
      expect(JSON.stringify(leido)).not.toContain(titulo);
      expect(await leerHallazgo(quien, h.id, { sql: tx })).toBeNull();
      expect(await puedeVerHallazgo(h.id, quien, { sql: tx })).toBe(false);
      await sinNadaDelHallazgo(tx, quien, { codigo: h.codigo, titulo });
    });
  });

  it("solo con mejora.gestionar; el plazo de formular corre desde la conversión; quien reportó recibe su aviso, sin enlace al hallazgo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const { id: reporteId } = await reportar(tx, b, quien, ANTES);
      // Control Interno registra hallazgos, pero no clasifica reportes.
      await expect(registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { reporteId }), c(HORA_DE_ESCENA, tx))).rejects.toThrow(ErrorPermiso);
      expect((await reporteDe(tx, reporteId)).estado).toBe("recibido");

      const h = await convertir(tx, b, reporteId);
      const ahora = new Date(HORA_DE_ESCENA);
      const ctx = await contextoDeMejora(tx, ahora);
      const r = await reporteDe(tx, reporteId);
      expect(r).toMatchObject({ estado: "convertido" });
      expect(Number(r.hallazgo_id)).toBe(h.id);
      expect(Number(r.clasificado_por)).toBe(b.admin.usuarioId);
      expect(r.clasificado_en).toEqual(ahora);

      const [ronda] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${h.id} AND numero = 1`;
      expect(ronda.formular_antes_de).toEqual(formularAntesDe({ registradoEn: ahora, fechaLimiteEnte: null }, ctx));
      expect(ronda.formular_antes_de).not.toEqual(formularAntesDe({ registradoEn: new Date(ANTES), fechaLimiteEnte: null }, ctx));
      const [registro] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'registrar'`;
      expect(registro.detalle).toMatchObject({ reporteId });

      expect((await eventosDe(tx, reporteId)).map((e) => [e.tipo, e.usuarioId, e.detalle])).toEqual([
        ["enviado", quien.usuarioId, {}],
        ["convertido", b.admin.usuarioId, { hallazgoId: h.id }],
      ]);
      const bitacora = await bitacoraDe(tx, reporteId);
      expect(bitacora.map((f) => f.accion)).toEqual(["mejora_reporte_enviado", "mejora_reporte_convertido"]);
      expect(bitacora[1].detalle).toMatchObject({ hallazgoId: h.id, codigo: h.codigo, estado: { antes: "recibido", despues: "convertido" } });
      expect(JSON.stringify(bitacora)).not.toContain(LO_QUE_VIO);
      expect(JSON.stringify(bitacora)).not.toContain(REFERENCIA);

      const avisos = await avisosDe(tx, quien.usuarioId);
      expect(avisos.map((a) => [a.tipo, a.titulo, a.enlace, a.entidad, Number(a.entidad_id)])).toEqual([
        ["mejora.reporte_clasificado", AVISO_EN_TRAMITE, "/mejoramiento/reportes", "mejora_reporte", reporteId],
      ]);
      await sinNadaDelHallazgo(tx, quien, { codigo: h.codigo, titulo: datosDeHallazgo(b.procesoId).titulo });
    });
  });

  it("la identidad de quien reportó: el nombre solo con mejora.ver_todo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const { id: reporteId } = await reportar(tx, b, quien);
      const h = await convertir(tx, b, reporteId);

      const paraElLider = await leerHallazgo(b.lider, h.id, { sql: tx });
      expect(paraElLider).toMatchObject({ reportadoPor: null, naceDeUnReporte: true });
      expect(JSON.stringify(paraElLider)).not.toContain(quien.nombre);
      for (const control of [b.admin, b.control, b.gerencia]) {
        expect(await leerHallazgo(control, h.id, { sql: tx })).toMatchObject({ reportadoPor: quien.nombre, naceDeUnReporte: true });
      }
      // Uno registrado directamente no nace de un reporte.
      const { id: directo } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(HORA_DE_ESCENA, tx));
      expect(await leerHallazgo(b.admin, directo, { sql: tx })).toMatchObject({ reportadoPor: null, naceDeUnReporte: false });
    });
  });
});

describe("sumar y descartar", () => {
  it("sumar a un hallazgo abierto: una ocurrencia con origen «reporte» y el reporte sumado", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const h = await hallazgoEn(tx, b, "por_aceptar");
      const { id: reporteId } = await reportar(tx, b, quien);
      const o = c(HORA_DE_ESCENA, tx);
      await expect(sumarReporte(b.control, { reporteId, hallazgoId: h.id }, o)).rejects.toThrow(ErrorPermiso);

      await sumarReporte(b.admin, { reporteId, hallazgoId: h.id }, o);
      const ocurrencias = await tx`SELECT origen, reporte_id, descripcion, to_char(fecha, 'YYYY-MM-DD') AS fecha, registrado_por
        FROM mejora_ocurrencias WHERE hallazgo_id = ${h.id}`;
      expect(ocurrencias.map((x) => [x.origen, Number(x.reporte_id), x.descripcion, x.fecha, Number(x.registrado_por)])).toEqual([
        ["reporte", reporteId, LO_QUE_VIO, "2026-11-09", b.admin.usuarioId],
      ]);
      const r = await reporteDe(tx, reporteId);
      expect(r).toMatchObject({ estado: "sumado" });
      expect(Number(r.hallazgo_id)).toBe(h.id);
      expect((await eventosDe(tx, reporteId)).map((e) => e.tipo)).toEqual(["enviado", "sumado"]);
      const bitacora = await bitacoraDe(tx, reporteId);
      expect(bitacora.map((f) => f.accion)).toEqual(["mejora_reporte_enviado", "mejora_reporte_sumado"]);
      expect(bitacora[1].detalle).toMatchObject({ hallazgoId: h.id, codigo: h.codigo, estado: { antes: "recibido", despues: "sumado" } });

      expect((await misReportes(quien, { sql: tx })).find((x) => x.id === reporteId)?.etiqueta).toBe("En trámite");
      expect((await avisosDe(tx, quien.usuarioId)).map((a) => a.titulo)).toEqual([AVISO_EN_TRAMITE]);
      await sinNadaDelHallazgo(tx, quien, { codigo: h.codigo, titulo: datosDeHallazgo(b.procesoId).titulo });
    });
  });

  it("solo a un hallazgo abierto que quien clasifica ve", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(HORA_DE_ESCENA, tx);
      const h = await hallazgoEn(tx, b, "por_aceptar");
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Se registró dos veces por error" }, o);
      const { id: reporteId } = await reportar(tx, b, b.consulta);
      await expect(sumarReporte(b.admin, { reporteId, hallazgoId: h.id }, o)).rejects.toThrow(
        "Solo se añade a un hallazgo abierto: convierta el reporte en uno nuevo",
      );
      const [{ mayor }] = await tx`SELECT coalesce(max(id), 0)::bigint AS mayor FROM mejora_hallazgos`;
      await expect(sumarReporte(b.admin, { reporteId, hallazgoId: Number(mayor) + 1000 }, o)).rejects.toThrow("El hallazgo no existe");
      expect((await reporteDe(tx, reporteId)).estado).toBe("recibido");
    });
  });

  it("los parecidos para sumarlo: solo abiertos, del proceso del reporte o, si no lo dice, de todos", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(HORA_DE_ESCENA, tx);
      const otro = await otroProcesoConLider(tx);
      const abierto = await hallazgoEn(tx, b, "por_aceptar");
      const anulado = await hallazgoEn(tx, b, "por_aceptar");
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, o);
      const texto = `${datosDeHallazgo(b.procesoId).titulo}. ${datosDeHallazgo(b.procesoId).descripcion}`;
      const ids = async (procesoId: number | null) =>
        (await abiertosParecidosAlReporte(tx, { procesoId, texto, ahora: new Date(HORA_DE_ESCENA) })).map((p) => p.id);
      expect(await ids(b.procesoId)).toContain(abierto.id);
      expect(await ids(b.procesoId)).not.toContain(anulado.id);
      expect(await ids(otro.procesoId)).not.toContain(abierto.id);
      expect(await ids(null)).toContain(abierto.id);
    });
  });

  it("descartar: sin un motivo de 10 caracteres se rechaza; con él, queda descartado y quien reportó lee el motivo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const { id: reporteId } = await reportar(tx, b, quien);
      const o = c(HORA_DE_ESCENA, tx);
      const motivo = "La nevera se calibró ese día: no es una falla del registro";
      await expect(descartarReporte(b.admin, { reporteId, motivo: "Corto" }, o)).rejects.toThrow(
        "Escriba el motivo del descarte en al menos 10 caracteres",
      );
      await expect(descartarReporte(b.gerencia, { reporteId, motivo }, o)).rejects.toThrow(ErrorPermiso);

      await descartarReporte(b.admin, { reporteId, motivo }, o);
      const r = await reporteDe(tx, reporteId);
      expect(r).toMatchObject({ estado: "descartado", motivo_descarte: motivo, hallazgo_id: null });
      expect(Number(r.clasificado_por)).toBe(b.admin.usuarioId);
      expect((await misReportes(quien, { sql: tx })).find((x) => x.id === reporteId)).toMatchObject({ etiqueta: "Descartado", motivo });
      expect(await leerReporte(quien, reporteId, { sql: tx })).toMatchObject({ etiqueta: "Descartado", motivo });
      expect((await avisosDe(tx, quien.usuarioId)).map((a) => [a.tipo, a.titulo, a.cuerpo, a.enlace])).toEqual([
        ["mejora.reporte_clasificado", AVISO_DESCARTADO, motivo, "/mejoramiento/reportes"],
      ]);
      const bitacora = await bitacoraDe(tx, reporteId);
      expect(bitacora.map((f) => f.accion)).toEqual(["mejora_reporte_enviado", "mejora_reporte_descartado"]);
      expect(bitacora[1].detalle).toMatchObject({ estado: { antes: "recibido", despues: "descartado" } });
      expect(JSON.stringify(bitacora)).not.toContain(motivo);
    });
  });

  it("un reporte clasificado no se clasifica dos veces", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(HORA_DE_ESCENA, tx);
      const abierto = await hallazgoEn(tx, b, "por_aceptar");
      const motivo = "Ya se había registrado por otro camino";

      const { id: descartado } = await reportar(tx, b, b.consulta);
      await descartarReporte(b.admin, { reporteId: descartado, motivo }, o);
      await expect(descartarReporte(b.admin, { reporteId: descartado, motivo }, o)).rejects.toThrow(YA_CLASIFICADO);
      await expect(sumarReporte(b.admin, { reporteId: descartado, hallazgoId: abierto.id }, o)).rejects.toThrow(YA_CLASIFICADO);
      await expect(convertir(tx, b, descartado)).rejects.toThrow(YA_CLASIFICADO);

      const { id: convertido } = await reportar(tx, b, b.consulta);
      const h = await convertir(tx, b, convertido);
      const [{ antes }] = await tx`SELECT count(*)::int AS antes FROM mejora_hallazgos`;
      await expect(convertir(tx, b, convertido)).rejects.toThrow(YA_CLASIFICADO);
      await expect(descartarReporte(b.admin, { reporteId: convertido, motivo }, o)).rejects.toThrow(YA_CLASIFICADO);
      const [{ despues }] = await tx`SELECT count(*)::int AS despues FROM mejora_hallazgos`;
      expect(despues).toBe(antes);
      expect(Number((await reporteDe(tx, convertido)).hallazgo_id)).toBe(h.id);
      expect((await eventosDe(tx, convertido)).map((e) => e.tipo)).toEqual(["enviado", "convertido"]);
    });
  });
});

describe("al terminarse el hallazgo", () => {
  it("validada la corrección (cerrado), la etiqueta pasa a «Cerrado» y quien reportó recibe un aviso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const o = c(HORA_DE_ESCENA, tx);
      const h = await hallazgoEn(tx, b, "por_validar");
      const { id: reporteId } = await reportar(tx, b, quien);
      await sumarReporte(b.admin, { reporteId, hallazgoId: h.id }, o);
      await validarCorreccion(b.control, { hallazgoId: h.id }, o);

      expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${h.id}`)[0].estado).toBe("cerrado");
      expect((await misReportes(quien, { sql: tx })).find((x) => x.id === reporteId)?.etiqueta).toBe("Cerrado");
      expect((await avisosDe(tx, quien.usuarioId)).map((a) => [a.tipo, a.titulo, a.enlace, Number(a.entidad_id)])).toEqual([
        ["mejora.reporte_clasificado", AVISO_EN_TRAMITE, "/mejoramiento/reportes", reporteId],
        ["mejora.reporte_atendido", AVISO_ATENDIDO, "/mejoramiento/reportes", reporteId],
      ]);
      await sinNadaDelHallazgo(tx, quien, { codigo: h.codigo, titulo: datosDeHallazgo(b.procesoId).titulo });
    });
  });

  it("anulado o rechazado también se lee «Cerrado», con su aviso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const o = c(HORA_DE_ESCENA, tx);

      const { id: anuladoR } = await reportar(tx, b, quien);
      const anulado = await convertir(tx, b, anuladoR);
      await anularHallazgo(b.admin, { hallazgoId: anulado.id, justificacion: "Se registró dos veces por error" }, o);

      // Lo registró el Admin SGC y el proceso tiene líder: nace «Por aceptar», la líder lo rechaza y el Admin SGC lo retira.
      const { id: rechazadoR } = await reportar(tx, b, quien);
      const rechazado = await convertir(tx, b, rechazadoR);
      await rechazarHallazgo(b.lider, { hallazgoId: rechazado.id, justificacion: "El hecho no corresponde a este proceso" }, o);
      await retirarHallazgo(b.admin, { hallazgoId: rechazado.id }, o);

      const mios = await misReportes(quien, { sql: tx });
      expect(mios.find((x) => x.id === anuladoR)?.etiqueta).toBe("Cerrado");
      expect(mios.find((x) => x.id === rechazadoR)?.etiqueta).toBe("Cerrado");
      const atendidos = (await avisosDe(tx, quien.usuarioId)).filter((a) => a.tipo === "mejora.reporte_atendido");
      expect(atendidos.map((a) => Number(a.entidad_id)).sort((x, y) => x - y)).toEqual([anuladoR, rechazadoR].sort((x, y) => x - y));
      expect(atendidos.every((a) => a.titulo === AVISO_ATENDIDO)).toBe(true);
      await sinNadaDelHallazgo(tx, quien, { codigo: anulado.codigo, titulo: datosDeHallazgo(b.procesoId).titulo });
      await sinNadaDelHallazgo(tx, quien, { codigo: rechazado.codigo, titulo: datosDeHallazgo(b.procesoId).titulo });
    });
  });
});

describe("quién ve los reportes", () => {
  it("otro funcionario no ve reportes ajenos; los roles de control ven los recibidos, con quién reportó", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const quien = await funcionaria(tx);
      const { id: reporteId } = await reportar(tx, b, quien);
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });

      for (const ajeno of [otro, b.lider, b.consulta]) {
        expect(await leerReporte(ajeno, reporteId, { sql: tx })).toBeNull();
        expect((await misReportes(ajeno, { sql: tx })).some((r) => r.id === reporteId)).toBe(false);
        expect(await reportesRecibidos(ajeno, { sql: tx })).toEqual([]);
      }
      for (const control of [b.admin, b.control, b.gerencia]) {
        const fila = (await reportesRecibidos(control, { sql: tx })).find((r) => r.id === reporteId);
        expect(fila).toMatchObject({ reportadoPor: quien.nombre, descripcion: LO_QUE_VIO, estado: "recibido" });
        expect(await leerReporte(control, reporteId, { sql: tx })).toMatchObject({
          suyo: false,
          control: { reportadoPor: quien.nombre, estado: "recibido", hallazgo: null },
        });
      }
      const [{ mayor }] = await tx`SELECT coalesce(max(id), 0)::bigint AS mayor FROM mejora_reportes`;
      expect(await leerReporte(b.admin, Number(mayor) + 1000, { sql: tx })).toBeNull();
    });
  });

  it("los recibidos van primero, por su vencimiento", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(HORA_DE_ESCENA, tx);
      const { id: viejo } = await reportar(tx, b, b.consulta, ANTES);
      const { id: descartado } = await reportar(tx, b, b.consulta, ANTES);
      await descartarReporte(b.admin, { reporteId: descartado, motivo: "No corresponde a una no conformidad" }, o);
      const { id: nuevo } = await reportar(tx, b, b.consulta);
      const ids = (await reportesRecibidos(b.admin, { sql: tx })).map((r) => r.id).filter((id) => [viejo, descartado, nuevo].includes(id));
      expect(ids).toEqual([viejo, nuevo, descartado]);
    });
  });
});
