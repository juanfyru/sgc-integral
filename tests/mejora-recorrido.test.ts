/**
 * El recorrido del hallazgo hasta el plan (Fase 15A, Tarea 10, spec §8.3 a §8.5): aceptar o rechazar, retirar o sostener
 * tras un rechazo, arbitrar, registrar la corrección, decidir la acción correctiva (y cambiar el «no» por «sí») y validar o
 * devolver la corrección, con el camino corto y el cierre sin acción. Contra la BD de trabajo, dentro de una transacción
 * que se revierte. La base demo tiene otros Admin SGC, Gerencia y Control Interno activos: los casos de «ningún otro» los
 * desactivan dentro de la transacción.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { quienTieneElTurno } from "@/db/consultas/mejoramiento/avisos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo, NO_EXISTE } from "@/db/consultas/mejoramiento/flujo";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import {
  aceptarHallazgo,
  arbitrarHallazgo,
  decidirAccionCorrectiva,
  devolverCorreccion,
  ofreceRechazo,
  rechazarHallazgo,
  registrarCorreccion,
  retirarHallazgo,
  sostenerHallazgo,
  validarCorreccion,
} from "@/db/consultas/mejoramiento/recorrido";
import { cambiarProceso, registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { puedeValidarCorreccion } from "@/lib/alcance";
import { venceEn } from "@/lib/mejoramiento/plazos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso } from "@/lib/permisos";
import { baseDeMejora, c, datosDeHallazgo, evidenciaDeCorreccion, hallazgoEn, otroProcesoConLider } from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

/** La hora a la que `hallazgoEn` lleva el hallazgo (martes 17); los actos de cada caso, otros días hábiles después. */
const REGISTRO = "2026-11-17T15:00:00Z";
const LUEGO = "2026-11-20T15:00:00Z";
const DESPUES = "2026-11-24T15:00:00Z";

const fila = async (tx: TransactionSql, id: number) =>
  (
    await tx`SELECT *, to_char(correccion_implementada_en, 'YYYY-MM-DD') AS implementada FROM mejora_hallazgos WHERE id = ${id}`
  )[0];
const ultimoEvento = async (tx: TransactionSql, id: number) =>
  (await tx`SELECT tipo, detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${id} ORDER BY id DESC LIMIT 1`)[0];
const formularAntes = async (tx: TransactionSql, id: number) =>
  (await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = 1`)[0].formular_antes_de as Date;
const activos = async (tx: TransactionSql, roles: string[]) =>
  (await tx`SELECT id FROM usuarios WHERE rol = ANY(${roles}) AND activo ORDER BY id`).map((f) => Number(f.id));
const contexto = (tx: TransactionSql, ahora: string) => contextoDeMejora(tx, new Date(ahora));

const JUSTIFICACION = "El formato no es de este proceso sino del de admisiones";
const REPLICA = "La evidencia muestra que el formato es de este proceso";
const NOTA = "La evidencia del registro es suficiente para sostenerlo";

describe("aceptar o rechazar", () => {
  it("el líder acepta: la no conformidad pasa a «Por corregir» y la oportunidad a «Por formular»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contexto(tx, LUEGO);
      const nc = await hallazgoEn(tx, b, "por_aceptar");
      await aceptarHallazgo(b.lider, { hallazgoId: nc.id }, c(LUEGO, tx));
      const f = await fila(tx, nc.id);
      expect(f.estado).toBe("por_corregir");
      expect(f.vence_en).toEqual(venceEn("correccion", new Date(LUEGO), ctx));
      expect(await ultimoEvento(tx, nc.id)).toMatchObject({ tipo: "aceptar", detalle: { estado: { antes: "por_aceptar", despues: "por_corregir" } } });

      const om = await hallazgoEn(tx, b, "por_aceptar", { clase: "oportunidad", criticidad: undefined, requisitoClausula: undefined });
      await aceptarHallazgo(b.lider, { hallazgoId: om.id }, c(LUEGO, tx));
      const g = await fila(tx, om.id);
      expect(g.estado).toBe("por_formular");
      // El plazo de formular corre desde el registro: lo que tardó la aceptación no lo corre (spec §13.3).
      expect(g.vence_en).toEqual(venceEn("formular", new Date(REGISTRO), ctx));
      expect(g.vence_en).not.toEqual(venceEn("formular", new Date(LUEGO), ctx));
    }));

  it("quien lo registró no lo acepta aunque lidere el proceso; un líder de otro proceso no lo ve", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_aceptar");
      // Quien lo registró (Control Interno) pasa a liderar el proceso del hallazgo.
      await tx`UPDATE usuarios SET rol = 'lider_proceso' WHERE id = ${b.control.usuarioId}`;
      await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${b.control.usuarioId}, ${b.procesoId})`;
      const registrador = { ...b.control, rol: "lider_proceso" as const };
      await expect(aceptarHallazgo(registrador, { hallazgoId: h.id }, c(LUEGO, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(
        rechazarHallazgo(registrador, { hallazgoId: h.id, justificacion: JUSTIFICACION }, c(LUEGO, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      // Para quien no lo ve, no existe.
      await expect(aceptarHallazgo(otro.lider, { hallazgoId: h.id }, c(LUEGO, tx))).rejects.toThrow(NO_EXISTE);
      // Gerencia no tiene el permiso de la matriz.
      await expect(aceptarHallazgo(b.gerencia, { hallazgoId: h.id }, c(LUEGO, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect((await fila(tx, h.id)).estado).toBe("por_aceptar");
    }));

  it("rechazar pide justificación y solo existe en un origen interno y con líder", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const externo = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { origen: "ente_control", fechaLimiteEnte: "2026-12-30" }),
        c(REGISTRO, tx),
      );
      await expect(
        rechazarHallazgo(b.lider, { hallazgoId: externo.id, justificacion: JUSTIFICACION }, c(LUEGO, tx)),
      ).rejects.toThrow("Un hallazgo de origen externo no se rechaza: se responde");

      const h = await hallazgoEn(tx, b, "por_aceptar");
      await expect(rechazarHallazgo(b.lider, { hallazgoId: h.id, justificacion: "No es" }, c(LUEGO, tx))).rejects.toThrow(
        /al menos 10/,
      );
      await rechazarHallazgo(b.lider, { hallazgoId: h.id, justificacion: JUSTIFICACION }, c(LUEGO, tx));
      const enRechazo = await bloquearHallazgo(tx, h.id);
      expect(enRechazo.estado).toBe("rechazo");
      expect((await fila(tx, h.id)).vence_en).toEqual(venceEn("decision", new Date(LUEGO), await contexto(tx, LUEGO)));
      expect((await ultimoEvento(tx, h.id)).detalle).toMatchObject({ justificacion: JUSTIFICACION });
      expect(await quienTieneElTurno(tx, enRechazo)).toEqual([b.control.usuarioId]);

      // Sin líder activo, el Admin SGC acepta por el proceso, pero no rechaza: un rechazo solo existe con líder (§8.3).
      const otro = await hallazgoEn(tx, b, "por_aceptar");
      await tx`UPDATE usuarios SET activo = false WHERE id = ${b.lider.usuarioId}`;
      await expect(
        rechazarHallazgo(b.admin, { hallazgoId: otro.id, justificacion: JUSTIFICACION }, c(LUEGO, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      // Quien no puede rechazar no lee «o rechazarlo», ni se le ofrece.
      expect((await leerHallazgo(b.admin, otro.id, { sql: tx }))?.loQueSigue).toEqual({
        paso: "aceptar",
        puede: true,
        turno: "A usted le toca aceptar el hallazgo.",
      });
      expect((await leerHallazgo(b.control, otro.id, { sql: tx }))?.loQueSigue.turno).toBe(
        "Tiene el turno: el Administrador del SGC, para aceptar el hallazgo.",
      );
      expect(await ofreceRechazo(tx, b.admin, otro)).toBe(false);
      await aceptarHallazgo(b.admin, { hallazgoId: otro.id }, c(LUEGO, tx));
      expect((await fila(tx, otro.id)).estado).toBe("por_corregir");
    }));

  it("el aviso a quien acepta sin poder rechazar dice «Aceptar», y el rechazo se ofrece solo al líder en un origen interno", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_aceptar");
      const turno = (id: number) =>
        tx`SELECT usuario_id, titulo FROM notificaciones WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND tipo = 'mejora.turno' ORDER BY id`;
      expect((await turno(h.id)).map((a) => a.titulo)).toEqual([`Aceptar o rechazar ${h.codigo}`]);
      expect(await ofreceRechazo(tx, b.lider, h)).toBe(true);
      expect(await ofreceRechazo(tx, b.control, h)).toBe(false);

      // En un proceso sin líder lo acepta el Admin SGC, que no rechaza: su aviso dice «Aceptar».
      const sinLider = await procesoNuevo(tx);
      await cambiarProceso(b.admin, { hallazgoId: h.id, procesoId: sinLider, justificacion: "El hecho ocurrió en otro servicio" }, c(LUEGO, tx));
      const nuevos = (await turno(h.id)).slice(1);
      expect(nuevos.length).toBeGreaterThan(0);
      expect(new Set(nuevos.map((a) => a.titulo))).toEqual(new Set([`Aceptar ${h.codigo}`]));
      expect(nuevos.map((a) => Number(a.usuario_id))).toEqual((await activos(tx, ["admin_sgc"])).filter((u) => u !== b.admin.usuarioId));
      expect(await ofreceRechazo(tx, b.admin, await bloquearHallazgo(tx, h.id))).toBe(false);
    }));
});

describe("tras el rechazo y el arbitraje", () => {
  it("retirar: quien lo registró, o un Admin SGC en su lugar, lo deja «Rechazado»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "rechazo");
      // El líder tiene el permiso de registrar, pero no lo registró.
      await expect(retirarHallazgo(b.lider, { hallazgoId: h.id }, c(LUEGO, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await retirarHallazgo(b.control, { hallazgoId: h.id }, c(LUEGO, tx));
      expect((await fila(tx, h.id)).estado).toBe("rechazado");
      expect((await leerHallazgo(b.control, h.id, { sql: tx }))?.etiqueta).toBe("Rechazado");

      const otro = await hallazgoEn(tx, b, "rechazo");
      await retirarHallazgo(b.admin, { hallazgoId: otro.id }, c(LUEGO, tx));
      expect((await fila(tx, otro.id)).estado).toBe("rechazado");
      expect((await ultimoEvento(tx, otro.id)).detalle).toMatchObject({ enLugarDeQuienRegistro: true });
    }));

  it("rechazo sostenido y arbitraje: sostiene Control Interno, arbitra el Admin SGC y el plazo de formular se cuenta desde el arbitraje", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "rechazo");
      await expect(sostenerHallazgo(b.lider, { hallazgoId: h.id, replica: REPLICA }, c(LUEGO, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      await expect(sostenerHallazgo(b.control, { hallazgoId: h.id, replica: "Sí es" }, c(LUEGO, tx))).rejects.toThrow(/al menos 10/);
      await sostenerHallazgo(b.control, { hallazgoId: h.id, replica: REPLICA }, c(LUEGO, tx));
      const enArbitraje = await bloquearHallazgo(tx, h.id);
      expect(enArbitraje.estado).toBe("arbitraje");
      expect((await ultimoEvento(tx, h.id)).detalle).toMatchObject({ replica: REPLICA });
      expect((await ultimoEvento(tx, h.id)).detalle).not.toHaveProperty("enLugarDeQuienRegistro");
      expect(await quienTieneElTurno(tx, enArbitraje)).toEqual(await activos(tx, ["admin_sgc"]));
      // No le toca a Gerencia: lo registró y lo sostuvo Control Interno.
      await expect(
        arbitrarHallazgo(b.gerencia, { hallazgoId: h.id, confirma: "hallazgo", nota: NOTA }, c(DESPUES, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(
        arbitrarHallazgo(b.admin, { hallazgoId: h.id, confirma: "hallazgo", nota: NOTA, acta: { numero: "12", fecha: "2026-11-25" } }, c(DESPUES, tx)),
      ).rejects.toThrow(/futura/);

      await arbitrarHallazgo(
        b.admin,
        { hallazgoId: h.id, confirma: "hallazgo", nota: NOTA, acta: { numero: "12", fecha: "2026-11-23" } },
        c(DESPUES, tx),
      );
      expect((await fila(tx, h.id)).estado).toBe("por_corregir");
      const ctx = await contexto(tx, DESPUES);
      expect(await formularAntes(tx, h.id)).toEqual(venceEn("formular", new Date(DESPUES), ctx));
      expect(await formularAntes(tx, h.id)).not.toEqual(venceEn("formular", new Date(REGISTRO), ctx));
      expect(await ultimoEvento(tx, h.id)).toMatchObject({
        tipo: "confirmar_hallazgo",
        detalle: { nota: NOTA, acta: { numero: "12", fecha: "2026-11-23" } },
      });
      // Confirmado, es definitivo: no vuelve a «Por aceptar» ni se rechaza otra vez.
      await expect(
        rechazarHallazgo(b.lider, { hallazgoId: h.id, justificacion: JUSTIFICACION }, c(DESPUES, tx)),
      ).rejects.toThrow(YA_CAMBIO);
      await expect(aceptarHallazgo(b.lider, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toThrow(YA_CAMBIO);
    }));

  it("si lo registró el Admin SGC, él no arbitra y Gerencia sí; sin Gerencia activa, otro Admin SGC", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId), c(REGISTRO, tx));
      await rechazarHallazgo(b.lider, { hallazgoId: id, justificacion: JUSTIFICACION }, c(REGISTRO, tx));
      await sostenerHallazgo(b.admin, { hallazgoId: id, replica: REPLICA }, c(REGISTRO, tx));
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, id))).toEqual(await activos(tx, ["gerencia"]));

      // Sin Gerencia activa arbitra un Admin SGC, nunca quien lo registró.
      const gerencias = await tx`UPDATE usuarios SET activo = false WHERE rol = 'gerencia' AND activo RETURNING id`;
      const respaldo = await quienTieneElTurno(tx, await bloquearHallazgo(tx, id));
      expect(respaldo).toEqual((await activos(tx, ["admin_sgc"])).filter((u) => u !== b.admin.usuarioId));
      await tx`UPDATE usuarios SET activo = true WHERE id = ANY(${gerencias.map((g) => Number(g.id))}::bigint[])`;

      await expect(
        arbitrarHallazgo(b.admin, { hallazgoId: id, confirma: "rechazo", nota: NOTA }, c(LUEGO, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      await expect(
        arbitrarHallazgo(otroAdmin, { hallazgoId: id, confirma: "rechazo", nota: NOTA }, c(LUEGO, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      await arbitrarHallazgo(b.gerencia, { hallazgoId: id, confirma: "rechazo", nota: NOTA }, c(LUEGO, tx));
      expect((await fila(tx, id)).estado).toBe("rechazado");
      expect(await ultimoEvento(tx, id)).toMatchObject({ tipo: "confirmar_rechazo", detalle: { nota: NOTA } });
    }));

  it("si el Admin SGC lo sostuvo en lugar de Control Interno, arbitra Gerencia; sin ella, un Admin SGC que no lo sostuvo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "rechazo");
      await sostenerHallazgo(b.admin, { hallazgoId: h.id, replica: REPLICA }, c(LUEGO, tx));
      const e = await ultimoEvento(tx, h.id);
      expect(Number(e.usuario_id)).toBe(b.admin.usuarioId);
      expect(e.detalle).toMatchObject({ replica: REPLICA, enLugarDeQuienRegistro: true });
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id))).toEqual(await activos(tx, ["gerencia"]));
      await expect(
        arbitrarHallazgo(b.admin, { hallazgoId: h.id, confirma: "hallazgo", nota: NOTA }, c(DESPUES, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);

      await tx`UPDATE usuarios SET activo = false WHERE rol = 'gerencia'`;
      const respaldo = await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id));
      expect(respaldo).toEqual((await activos(tx, ["admin_sgc"])).filter((u) => u !== b.admin.usuarioId));
      await expect(
        arbitrarHallazgo(b.admin, { hallazgoId: h.id, confirma: "hallazgo", nota: NOTA }, c(DESPUES, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      await arbitrarHallazgo(otroAdmin, { hallazgoId: h.id, confirma: "hallazgo", nota: NOTA }, c(DESPUES, tx));
      expect((await fila(tx, h.id)).estado).toBe("por_corregir");
    }));
});

describe("la corrección", () => {
  const corregida = (hallazgoId: number, responsableId: number, cambios?: Record<string, unknown>) => ({
    hallazgoId,
    requerida: true,
    descripcion: "Se diligenciaron los formatos pendientes con el turno",
    responsableId,
    implementadaEn: "2026-11-19",
    ...cambios,
  });

  it("sin evidencia no se registra; con evidencia y acción obligada (criticidad alta) pasa a «Por formular»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_corregir", { criticidad: "alta" });
      await expect(registrarCorreccion(b.lider, corregida(h.id, b.lider.usuarioId), c(LUEGO, tx))).rejects.toThrow(
        "Adjunte la evidencia de la corrección",
      );
      await evidenciaDeCorreccion(tx, h.id, b.lider.usuarioId);
      await expect(
        registrarCorreccion(b.lider, corregida(h.id, b.lider.usuarioId, { implementadaEn: "2026-11-21" }), c(LUEGO, tx)),
      ).rejects.toThrow(/futura/);
      await expect(
        registrarCorreccion(b.lider, corregida(h.id, b.lider.usuarioId, { responsableId: null }), c(LUEGO, tx)),
      ).rejects.toThrow(/responsable/);
      await expect(registrarCorreccion(otro.lider, corregida(h.id, b.lider.usuarioId), c(LUEGO, tx))).rejects.toThrow(NO_EXISTE);
      // El proceso tiene líder: el Admin SGC no registra la corrección por él.
      await expect(registrarCorreccion(b.admin, corregida(h.id, b.lider.usuarioId), c(LUEGO, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );

      await registrarCorreccion(b.lider, corregida(h.id, b.lider.usuarioId), c(LUEGO, tx));
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({
        estado: "por_formular",
        accion_requerida: true,
        correccion_requerida: true,
        correccion_descripcion: "Se diligenciaron los formatos pendientes con el turno",
        correccion_responsable_nombre: null,
        implementada: "2026-11-19",
      });
      expect(Number(f.correccion_responsable_id)).toBe(b.lider.usuarioId);
      expect(Number(f.correccion_registrada_por)).toBe(b.lider.usuarioId);
      expect(f.correccion_registrada_en).toEqual(new Date(LUEGO));
      expect(f.accion_decidida_por).toBeNull();
      // La corrección no corre el plazo de formular: es el del registro.
      expect(f.vence_en).toEqual(await formularAntes(tx, h.id));
      expect(await formularAntes(tx, h.id)).toEqual(venceEn("formular", new Date(REGISTRO), await contexto(tx, REGISTRO)));
    }));

  it("tras una devolución, «sí requirió» pide evidencia subida después de devolverla: la devuelta no basta", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_validar");
      const [vieja] = await tx`SELECT id FROM archivos WHERE contexto = 'mejora_hallazgo' AND contexto_id = ${h.id} AND rol = 'correccion'`;
      await devolverCorreccion(b.control, { hallazgoId: h.id, nota: "La foto no muestra los formatos diligenciados" }, c(LUEGO, tx));
      expect((await ultimoEvento(tx, h.id)).detalle).toMatchObject({ evidenciaDevuelta: [Number(vieja.id)] });
      await expect(registrarCorreccion(b.lider, corregida(h.id, b.lider.usuarioId), c(DESPUES, tx))).rejects.toThrow(
        "Adjunte la evidencia nueva de la corrección: la anterior se devolvió",
      );
      await evidenciaDeCorreccion(tx, h.id, b.lider.usuarioId);
      await registrarCorreccion(b.lider, corregida(h.id, b.lider.usuarioId), c(DESPUES, tx));
      expect((await fila(tx, h.id)).estado).toBe("por_decidir");
    }));

  it("sin acción obligada pasa a «Por decidir»; «no requiere corrección inmediata» pide su justificación", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_corregir");
      await expect(
        registrarCorreccion(b.lider, { hallazgoId: h.id, requerida: false, descripcion: "No hizo" }, c(LUEGO, tx)),
      ).rejects.toThrow(/al menos 10/);
      await registrarCorreccion(
        b.lider,
        { hallazgoId: h.id, requerida: false, descripcion: "No hubo nada que contener: los turnos siguientes ya lo diligenciaron", responsableId: b.lider.usuarioId, implementadaEn: "2026-11-19" },
        c(LUEGO, tx),
      );
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({
        estado: "por_decidir",
        accion_requerida: null,
        correccion_requerida: false,
        correccion_responsable_id: null,
        correccion_responsable_nombre: null,
        implementada: null,
      });
      expect(f.vence_en).toEqual(venceEn("decision", new Date(LUEGO), await contexto(tx, LUEGO)));

      // Con evidencia y un responsable sin cuenta (su nombre), también va a «Por decidir».
      const otro = await hallazgoEn(tx, b, "por_corregir");
      await evidenciaDeCorreccion(tx, otro.id, b.lider.usuarioId);
      await registrarCorreccion(
        b.lider,
        corregida(otro.id, b.lider.usuarioId, { responsableId: null, responsableNombre: "Auxiliar de enfermería del turno" }),
        c(LUEGO, tx),
      );
      expect(await fila(tx, otro.id)).toMatchObject({
        estado: "por_decidir",
        correccion_responsable_id: null,
        correccion_responsable_nombre: "Auxiliar de enfermería del turno",
      });
    }));
});

describe("la decisión y el camino corto", () => {
  const DECISION = "Fue un hecho aislado y la corrección lo contuvo";

  it("decidir «no» y validar: quien registró la corrección o fue su responsable no la valida; Control Interno sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      // Sin líder el hallazgo nace aceptado y la corrección la registra el Admin SGC.
      const sinLider = await procesoNuevo(tx);
      const h = await hallazgoEn(tx, b, "por_corregir", { procesoId: sinLider });
      const responsable = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      await evidenciaDeCorreccion(tx, h.id, b.admin.usuarioId);
      await registrarCorreccion(
        b.admin,
        { hallazgoId: h.id, requerida: true, descripcion: "Se reubicaron los formatos en la estación", responsableId: responsable.usuarioId, implementadaEn: "2026-11-19" },
        c(LUEGO, tx),
      );
      expect((await fila(tx, h.id)).estado).toBe("por_decidir");
      // En «Por decidir» decide el Admin SGC; Gerencia no.
      await expect(
        decidirAccionCorrectiva(b.gerencia, { hallazgoId: h.id, requiere: false, justificacion: DECISION }, c(LUEGO, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(
        decidirAccionCorrectiva(b.admin, { hallazgoId: h.id, requiere: false, justificacion: "Aislado" }, c(LUEGO, tx)),
      ).rejects.toThrow(/al menos 10/);
      await decidirAccionCorrectiva(b.admin, { hallazgoId: h.id, requiere: false, justificacion: DECISION }, c(LUEGO, tx));
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({ estado: "por_validar", accion_requerida: false, accion_justificacion: DECISION });
      expect(Number(f.accion_decidida_por)).toBe(b.admin.usuarioId);
      expect(f.accion_decidida_en).toEqual(new Date(LUEGO));
      expect((await leerHallazgo(b.control, h.id, { sql: tx }))?.etiqueta).toBe("Por validar la corrección");

      await expect(validarCorreccion(b.admin, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(validarCorreccion(responsable, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      // Gerencia valida solo si ningún Admin SGC ni Control Interno puede.
      expect(await puedeValidarCorreccion(h.id, b.gerencia, { sql: tx })).toBe(false);
      await expect(validarCorreccion(b.gerencia, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await puedeValidarCorreccion(h.id, b.control, { sql: tx })).toBe(true);
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id))).not.toContain(b.admin.usuarioId);

      await validarCorreccion(b.control, { hallazgoId: h.id }, c(DESPUES, tx));
      const g = await fila(tx, h.id);
      expect(g).toMatchObject({ estado: "cerrado", resultado_cierre: "con_correccion" });
      expect(Number(g.validada_por)).toBe(b.control.usuarioId);
      expect(Number(g.cerrado_por)).toBe(b.control.usuarioId);
      expect(g.validada_en).toEqual(new Date(DESPUES));
      expect(g.cerrado_en).toEqual(new Date(DESPUES));
      expect((await leerHallazgo(b.control, h.id, { sql: tx }))?.etiqueta).toBe("Cerrado con corrección");
    }));

  it("cierre sin acción: «Por validar el cierre sin acción», quien decidió el «no» no valida y Control Interno sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_corregir");
      await registrarCorreccion(
        b.lider,
        { hallazgoId: h.id, requerida: false, descripcion: "No hubo nada que contener: el formato ya estaba al día" },
        c(LUEGO, tx),
      );
      await decidirAccionCorrectiva(b.admin, { hallazgoId: h.id, requiere: false, justificacion: DECISION }, c(LUEGO, tx));
      const leido = await leerHallazgo(b.control, h.id, { sql: tx });
      expect(leido?.etiqueta).toBe("Por validar el cierre sin acción");
      expect(leido?.loQueSigue).toMatchObject({ paso: "validar", puede: true, turno: "A usted le toca validar el cierre sin acción." });
      await expect(validarCorreccion(b.admin, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await puedeValidarCorreccion(h.id, b.admin, { sql: tx })).toBe(false);

      await validarCorreccion(b.control, { hallazgoId: h.id }, c(DESPUES, tx));
      expect(await fila(tx, h.id)).toMatchObject({ estado: "cerrado", resultado_cierre: "sin_accion" });
      expect((await leerHallazgo(b.control, h.id, { sql: tx }))?.etiqueta).toBe("Cerrado sin acción");
      expect((await ultimoEvento(tx, h.id)).detalle).toMatchObject({ resultado: "sin_accion" });
    }));

  it("cierre sin acción sin Control Interno activo y con un solo Admin SGC (el que decidió): valida Gerencia", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_corregir");
      await registrarCorreccion(
        b.lider,
        { hallazgoId: h.id, requerida: false, descripcion: "No hubo nada que contener: el formato ya estaba al día" },
        c(LUEGO, tx),
      );
      await decidirAccionCorrectiva(b.admin, { hallazgoId: h.id, requiere: false, justificacion: DECISION }, c(LUEGO, tx));
      await tx`UPDATE usuarios SET activo = false WHERE rol IN ('control_interno', 'admin_sgc') AND id <> ${b.admin.usuarioId}`;
      // Sin Gerencia activa tampoco, nadie puede: no hay excepción de «único administrador» y la pantalla dice por qué.
      const gerencias = await tx`UPDATE usuarios SET activo = false WHERE rol = 'gerencia' AND activo RETURNING id`;
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id))).toEqual([]);
      expect((await leerHallazgo(b.admin, h.id, { sql: tx }))?.loQueSigue).toMatchObject({
        paso: "validar",
        puede: false,
        turno: expect.stringMatching(/^Nadie puede validarla: .*Dé el rol de Administrador del SGC o de Control Interno a otra persona\.$/),
      });
      await tx`UPDATE usuarios SET activo = true WHERE id = ANY(${gerencias.map((g) => Number(g.id))}::bigint[])`;
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id))).toEqual(await activos(tx, ["gerencia"]));
      expect(await puedeValidarCorreccion(h.id, b.gerencia, { sql: tx })).toBe(true);
      await expect(validarCorreccion(b.admin, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await validarCorreccion(b.gerencia, { hallazgoId: h.id }, c(DESPUES, tx));
      expect(await fila(tx, h.id)).toMatchObject({ estado: "cerrado", resultado_cierre: "sin_accion" });
    }));

  it("validar vuelve a contar la evidencia: una corrección que se quedó sin archivos no se valida, se devuelve", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_validar");
      // Una evidencia que se perdió por fuera del dominio (a mano en la base, o antes de la regla de quitar).
      await tx`DELETE FROM archivos WHERE contexto = 'mejora_hallazgo' AND contexto_id = ${h.id} AND rol = 'correccion'`;
      await expect(validarCorreccion(b.control, { hallazgoId: h.id }, c(DESPUES, tx))).rejects.toThrow(
        "La corrección ya no tiene evidencia: devuélvala",
      );
      expect((await fila(tx, h.id)).estado).toBe("por_validar");
      await devolverCorreccion(b.control, { hallazgoId: h.id, nota: "La evidencia de la corrección ya no está" }, c(DESPUES, tx));
      expect((await fila(tx, h.id)).estado).toBe("por_corregir");
    }));

  it("cambiar el «no» por «sí»: en «Por validar» Gerencia exige la acción y el plazo de formular se cuenta desde ese acto", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_validar");
      // Control Interno valida, pero no decide la acción correctiva.
      await expect(
        decidirAccionCorrectiva(b.control, { hallazgoId: h.id, requiere: true, justificacion: DECISION }, c(DESPUES, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      // En «Por validar» solo se cambia el «no» por «sí».
      await expect(
        decidirAccionCorrectiva(b.gerencia, { hallazgoId: h.id, requiere: false, justificacion: DECISION }, c(DESPUES, tx)),
      ).rejects.toThrow(YA_CAMBIO);

      const exige = "El Comité pidió analizar la causa: se repite en otros servicios";
      await decidirAccionCorrectiva(
        b.gerencia,
        { hallazgoId: h.id, requiere: true, justificacion: exige, acta: { numero: "7", fecha: "2026-11-23" } },
        c(DESPUES, tx),
      );
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({ estado: "por_formular", accion_requerida: true, accion_justificacion: exige });
      expect(Number(f.accion_decidida_por)).toBe(b.gerencia.usuarioId);
      const plazo = venceEn("formular", new Date(DESPUES), await contexto(tx, DESPUES));
      expect(await formularAntes(tx, h.id)).toEqual(plazo);
      expect(f.vence_en).toEqual(plazo);
      expect(await ultimoEvento(tx, h.id)).toMatchObject({
        tipo: "decidir_si",
        detalle: { justificacion: exige, acta: { numero: "7", fecha: "2026-11-23" }, antes: { accionRequerida: false } },
      });
    }));

  it("devolver la corrección: vuelve a «Por corregir», el evento lleva la nota y la decisión se toma otra vez", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_validar");
      await expect(devolverCorreccion(b.control, { hallazgoId: h.id, nota: "Falta" }, c(LUEGO, tx))).rejects.toThrow(/al menos 10/);
      await expect(devolverCorreccion(b.lider, { hallazgoId: h.id, nota: "La foto no muestra nada" }, c(LUEGO, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      const nota = "La foto no muestra los formatos diligenciados";
      await devolverCorreccion(b.control, { hallazgoId: h.id, nota }, c(LUEGO, tx));
      const f = await fila(tx, h.id);
      expect(f).toMatchObject({ estado: "por_corregir", accion_requerida: null, accion_justificacion: null, accion_decidida_por: null });
      expect(f.vence_en).toEqual(venceEn("correccion", new Date(LUEGO), await contexto(tx, LUEGO)));
      expect(await ultimoEvento(tx, h.id)).toMatchObject({
        tipo: "devolver_correccion",
        detalle: { nota, decision: { antes: { accionRequerida: false } } },
      });

      // Se registra otra vez («no requiere» ya no lleva responsable ni fecha) y vuelve a «Por decidir».
      await registrarCorreccion(
        b.lider,
        { hallazgoId: h.id, requerida: false, descripcion: "Tras revisarlo, no había nada que contener en el turno" },
        c(DESPUES, tx),
      );
      expect(await fila(tx, h.id)).toMatchObject({
        estado: "por_decidir",
        correccion_requerida: false,
        correccion_responsable_id: null,
        implementada: null,
      });
    }));

  it("decidir sobre una obligada no existe: en «Por formular» lanza que ya cambió", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { criticidad: "alta" });
      expect(await fila(tx, h.id)).toMatchObject({ estado: "por_formular", accion_requerida: true });
      for (const requiere of [false, true]) {
        await expect(
          decidirAccionCorrectiva(b.admin, { hallazgoId: h.id, requiere, justificacion: DECISION }, c(LUEGO, tx)),
        ).rejects.toThrow(YA_CAMBIO);
      }
    }));
});

describe("lo que sigue", () => {
  it("dice el paso, si quien mira puede darlo y, si no, quién tiene el turno", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_aceptar");
      expect((await leerHallazgo(b.lider, h.id, { sql: tx }))?.loQueSigue).toEqual({
        paso: "aceptar",
        puede: true,
        turno: "A usted le toca aceptar el hallazgo o rechazarlo.",
      });
      expect((await leerHallazgo(b.control, h.id, { sql: tx }))?.loQueSigue).toEqual({
        paso: "aceptar",
        puede: false,
        turno: "Tiene el turno: la líder del proceso, para aceptar el hallazgo o rechazarlo.",
      });

      // Tras el rechazo, el Admin SGC puede retirarlo o sostenerlo en lugar de quien lo registró.
      const r = await hallazgoEn(tx, b, "rechazo");
      expect((await leerHallazgo(b.admin, r.id, { sql: tx }))?.loQueSigue).toMatchObject({ paso: "tras_rechazo", puede: true });
      expect((await leerHallazgo(b.lider, r.id, { sql: tx }))?.loQueSigue).toMatchObject({ paso: "tras_rechazo", puede: false });

      const v = await hallazgoEn(tx, b, "por_validar");
      expect((await leerHallazgo(b.gerencia, v.id, { sql: tx }))?.loQueSigue).toMatchObject({ paso: "validar", puede: false });
    }));
});
