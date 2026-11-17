/**
 * El motor del hallazgo y su registro (Fase 15A, Tarea 5): cómo nace, el código, los avisos y el turno, y que una
 * transición sobre un estado que ya cambió no escribe nada. Contra la BD de trabajo, dentro de una transacción que se
 * revierte.
 */
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import type { TransactionSql } from "postgres";
import { obtenerSql } from "@/db/cliente";
import { enTransaccion } from "@/db/consultas/flujo/contrato";
import { asegurarMediciones } from "@/db/consultas/indicadores/mediciones";
import { actuaPorElProceso, quienTieneElTurno } from "@/db/consultas/mejoramiento/avisos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo, dejarEvento, legible, transicionarHallazgo } from "@/db/consultas/mejoramiento/flujo";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { adminsActivos, lideresDeProceso } from "@/db/consultas/tramites";
import { formularAntesDe, venceEn } from "@/lib/mejoramiento/plazos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { indicadorDePrueba } from "./utiles/indicadores";
import { baseDeMejora, c, datosDeHallazgo } from "./utiles/mejoramiento";
import { medicionDe, procesoNuevo } from "./utiles/mixto";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

const AHORA = "2026-11-17T15:00:00Z";
const ahora = new Date(AHORA);

const codigoDe = (anio: number, n: number) => `HZ-${anio}-${String(n).padStart(3, "0")}`;

/** El consecutivo que sigue en el año; sin hallazgos de ese año en la base, el contador vuelve a empezar. */
async function siguienteDe(tx: TransactionSql, anio: number): Promise<number> {
  await tx`DELETE FROM mejora_consecutivos WHERE anio = ${anio}
    AND NOT EXISTS (SELECT 1 FROM mejora_hallazgos WHERE anio = ${anio})`;
  const [f] = await tx`SELECT ultimo FROM mejora_consecutivos WHERE anio = ${anio}`;
  return (f ? Number(f.ultimo) : 0) + 1;
}

const hallazgo = async (tx: TransactionSql, id: number) =>
  (
    await tx`SELECT *, to_char(fecha_limite_ente, 'YYYY-MM-DD') AS fecha_ente, to_char(detectado_en, 'YYYY-MM-DD') AS detectado
      FROM mejora_hallazgos WHERE id = ${id}`
  )[0];
const eventos = (tx: TransactionSql, id: number) =>
  tx`SELECT tipo, ronda, usuario_id, detalle, fuera, ocurrio_en FROM mejora_eventos WHERE hallazgo_id = ${id} ORDER BY id`;
const avisos = async (tx: TransactionSql, id: number, tipo: string) =>
  (
    await tx`SELECT usuario_id FROM notificaciones WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND tipo = ${tipo}
      ORDER BY usuario_id`
  ).map((f) => Number(f.usuario_id));
const activosDe = async (tx: TransactionSql, roles: string[]) =>
  (await tx`SELECT id FROM usuarios WHERE rol = ANY(${roles}) AND activo ORDER BY id`).map((f) => Number(f.id));

describe("registrarHallazgo", () => {
  it("Control Interno registra una no conformidad interna", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const n = await siguienteDe(tx, 2026);
      const { id, codigo } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      expect(codigo).toBe(codigoDe(2026, n));
      if (n === 1) expect(codigo).toBe("HZ-2026-001");

      const ctx = await contextoDeMejora(tx, ahora);
      const h = await hallazgo(tx, id);
      expect(h).toMatchObject({ estado: "por_aceptar", ronda: 1, anio: 2026, consecutivo: n, cargado: false, criticidad: "media" });
      expect(Number(h.registrado_por)).toBe(b.control.usuarioId);
      expect(h.registrado_en).toEqual(ahora);
      expect(h.vence_en).toEqual(venceEn("aceptar", ahora, ctx));

      const rondas = await tx`SELECT numero, formular_antes_de, estado_plan FROM mejora_rondas WHERE hallazgo_id = ${id}`;
      expect(rondas).toHaveLength(1);
      expect(rondas[0]).toMatchObject({ numero: 1, estado_plan: "borrador" });
      expect(rondas[0].formular_antes_de).toEqual(venceEn("formular", ahora, ctx));

      const [evento, ...otros] = await eventos(tx, id);
      expect(otros).toHaveLength(0);
      expect(evento).toMatchObject({ tipo: "registrar", ronda: 1, fuera: false });
      expect(Number(evento.usuario_id)).toBe(b.control.usuarioId);
      expect(evento.ocurrio_en).toEqual(ahora);
      expect(evento.detalle).toEqual({ estado: { antes: null, despues: "por_aceptar" } });

      const bitacora = await tx`SELECT accion, usuario_id, detalle FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id}`;
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0]).toMatchObject({
        accion: "mejora_registrar",
        detalle: { codigo, ronda: 1, titulo: datosDeHallazgo(b.procesoId).titulo, estado: { antes: null, despues: "por_aceptar" } },
      });

      expect(await avisos(tx, id, "mejora.turno")).toEqual(await lideresDeProceso(b.procesoId, { sql: tx }));
      expect(await avisos(tx, id, "mejora.turno")).toEqual([b.lider.usuarioId]);
      const [aviso] = await tx`SELECT titulo, cuerpo, enlace FROM notificaciones WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id}`;
      expect(aviso).toMatchObject({ titulo: `Aceptar o rechazar ${codigo}`, enlace: `/mejoramiento/${id}` });
      expect(await avisos(tx, id, "mejora.externo")).toEqual([]);
    });
  });

  it("el líder del proceso la registra y nace aceptada", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);

      const nc = await registrarHallazgo(b.lider, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      const h1 = await hallazgo(tx, nc.id);
      expect(h1.estado).toBe("por_corregir");
      expect(h1.vence_en).toEqual(venceEn("correccion", ahora, ctx));
      expect((await eventos(tx, nc.id))[0].detalle).toEqual({ estado: { antes: null, despues: "por_corregir" } });
      // Nadie se avisa de lo que acaba de hacer: el único líder es quien lo registró.
      expect(await avisos(tx, nc.id, "mejora.turno")).toEqual([]);

      const om = await registrarHallazgo(
        b.lider,
        datosDeHallazgo(b.procesoId, { clase: "oportunidad", criticidad: undefined, requisitoClausula: undefined }),
        c(AHORA, tx),
      );
      const h2 = await hallazgo(tx, om.id);
      expect(h2.estado).toBe("por_formular");
      const [ronda] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${om.id} AND numero = 1`;
      expect(h2.vence_en).toEqual(ronda.formular_antes_de);
      expect(h2.vence_en).toEqual(venceEn("formular", ahora, ctx));
    });
  });

  it("un líder no registra en un proceso ajeno", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await procesoNuevo(tx);
      await expect(registrarHallazgo(b.lider, datosDeHallazgo(otro), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect((await tx`SELECT count(*)::int AS n FROM mejora_hallazgos WHERE proceso_id = ${otro}`)[0].n).toBe(0);
    });
  });

  it("el rol Consulta no registra", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      await expect(registrarHallazgo(b.consulta, datosDeHallazgo(b.procesoId), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(registrarHallazgo(b.gerencia, datosDeHallazgo(b.procesoId), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
    });
  });

  it("un origen externo nace aceptado y pide la fecha del ente", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      await expect(
        registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { origen: "ente_control", fuente: "Visita de la Supersalud" }), c(AHORA, tx)),
      ).rejects.toThrow(new ErrorMejora("Escriba la fecha límite de respuesta al ente"));

      const { id } = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { origen: "ente_control", fuente: "Visita de la Supersalud", fechaLimiteEnte: "2026-12-15" }),
        c(AHORA, tx),
      );
      const h = await hallazgo(tx, id);
      expect(h.estado).toBe("por_corregir");
      expect(h.fecha_ente).toBe("2026-12-15");
      const [ronda] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = 1`;
      expect(ronda.formular_antes_de).toEqual(formularAntesDe({ registradoEn: ahora, fechaLimiteEnte: "2026-12-15" }, ctx));

      expect(await avisos(tx, id, "mejora.turno")).toEqual([b.lider.usuarioId]);
      const externos = await avisos(tx, id, "mejora.externo");
      expect(externos).toEqual(await activosDe(tx, ["gerencia", "admin_sgc"]));
      expect(externos).toEqual(expect.arrayContaining([b.gerencia.usuarioId, b.admin.usuarioId]));
      const [aviso] = await tx`SELECT titulo FROM notificaciones WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND tipo = 'mejora.externo' LIMIT 1`;
      expect(aviso.titulo).toContain(h.codigo);

      // En «Auditoría externa» la fecha es opcional: sin ella, el plazo de formular es el de siempre.
      const sinFecha = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { clase: "observacion", criticidad: undefined, origen: "auditoria_externa" }),
        c(AHORA, tx),
      );
      expect((await hallazgo(tx, sinFecha.id)).estado).toBe("por_formular");
      const [r2] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${sinFecha.id}`;
      expect(r2.formular_antes_de).toEqual(venceEn("formular", ahora, ctx));

      // En un origen interno la fecha del ente no se guarda.
      const interno = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { fechaLimiteEnte: "2026-12-15" }), c(AHORA, tx));
      expect((await hallazgo(tx, interno.id)).fecha_ente).toBeNull();
    });
  });

  it("un hallazgo externo avisa a cada Gerencia y Admin SGC, aunque también tengan el turno", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const sinLider = await procesoNuevo(tx);
      const externo = { origen: "ente_control" as const, fuente: "Visita de la Supersalud", fechaLimiteEnte: "2026-12-15" };

      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(sinLider, externo), c(AHORA, tx));
      const admins = await adminsActivos({ sql: tx });
      expect(await avisos(tx, id, "mejora.turno")).toEqual(admins);
      expect(await avisos(tx, id, "mejora.externo")).toEqual(await activosDe(tx, ["gerencia", "admin_sgc"]));
      for (const admin of admins) {
        const tipos = (
          await tx`SELECT tipo FROM notificaciones WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id}
            AND usuario_id = ${admin} ORDER BY tipo`
        ).map((f) => f.tipo);
        expect(tipos).toEqual(["mejora.externo", "mejora.turno"]);
      }

      // Quien lo registra no se avisa a sí mismo de ninguno de los dos.
      const otro = await registrarHallazgo(b.admin, datosDeHallazgo(sinLider, externo), c(AHORA, tx));
      expect(await avisos(tx, otro.id, "mejora.turno")).toEqual(admins.filter((u) => u !== b.admin.usuarioId));
      expect(await avisos(tx, otro.id, "mejora.externo")).toEqual(
        (await activosDe(tx, ["gerencia", "admin_sgc"])).filter((u) => u !== b.admin.usuarioId),
      );
    });
  });

  it("en un proceso sin líder nace aceptado y el turno es del Admin SGC", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const sinLider = await procesoNuevo(tx);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(sinLider), c(AHORA, tx));
      const h = await bloquearHallazgo(tx, id);
      expect(h.estado).toBe("por_corregir");
      const admins = await adminsActivos({ sql: tx });
      expect(await quienTieneElTurno(tx, h)).toEqual(admins);
      expect(await avisos(tx, id, "mejora.turno")).toEqual(admins);

      expect(await actuaPorElProceso(tx, b.admin, sinLider)).toBe(true);
      expect(await actuaPorElProceso(tx, b.control, sinLider)).toBe(false);
      expect(await actuaPorElProceso(tx, b.admin, b.procesoId)).toBe(false);
      expect(await actuaPorElProceso(tx, b.lider, b.procesoId)).toBe(true);
      expect(await actuaPorElProceso(tx, b.lider, sinLider)).toBe(false);
    });
  });

  it("validaciones", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const registrar = (cambios: Parameters<typeof datosDeHallazgo>[1]) =>
        registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, cambios), c(AHORA, tx));

      await expect(registrar({ criticidad: undefined })).rejects.toThrow(new ErrorMejora("Elija la criticidad"));
      await expect(registrar({ criticidad: null })).rejects.toThrow(new ErrorMejora("Elija la criticidad"));

      const obs = await registrar({ clase: "observacion", criticidad: "alta" });
      expect((await hallazgo(tx, obs.id)).criticidad).toBeNull();

      await expect(registrar({ requisitoClausula: undefined })).rejects.toThrow(new ErrorMejora("Indique al menos un requisito incumplido"));
      await expect(registrar({ requisitoClausula: "   " })).rejects.toThrow(new ErrorMejora("Indique al menos un requisito incumplido"));
      await expect(registrar({ origen: "pqrsf" })).rejects.toThrow(new ErrorMejora("Escriba la referencia del caso"));
      const pqrsf = await registrar({ origen: "pqrsf", referenciaCaso: "PQRSF-2026-0141" });
      expect((await hallazgo(tx, pqrsf.id)).referencia_caso).toBe("PQRSF-2026-0141");

      await expect(registrar({ detectadoEn: "2026-11-18" })).rejects.toThrow(new ErrorMejora("La fecha en que se detectó no puede ser futura"));
      // Hoy en Bogotá todavía es el 17 a las 04:00 del 18 en UTC.
      await expect(
        registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { detectadoEn: "2026-11-18" }), c("2026-11-18T04:00:00Z", tx)),
      ).rejects.toThrow(new ErrorMejora("La fecha en que se detectó no puede ser futura"));
      const hoy = await registrar({ detectadoEn: "2026-11-17" });
      expect((await hallazgo(tx, hoy.id)).detectado).toBe("2026-11-17");

      const borrador = await indicadorDePrueba(tx, { procesoId: b.procesoId, estado: "borrador" });
      await expect(registrar({ indicadorId: borrador.id })).rejects.toThrow(new ErrorMejora("Solo se puede enlazar un indicador activo o retirado"));

      const activo = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      await asegurarMediciones({ sql: tx, ahora, indicadorId: activo.id });
      const medicionId = await medicionDe(tx, activo.id, "2026-01");
      await expect(registrar({ indicadorId: activo.id, medicionId })).rejects.toThrow(
        new ErrorMejora("Solo se puede enlazar una medición que ya tiene resultado"),
      );
      const conIndicador = await registrar({ indicadorId: activo.id });
      expect(Number((await hallazgo(tx, conIndicador.id)).indicador_id)).toBe(activo.id);

      // Nada de lo rechazado dejó un hallazgo.
      expect((await tx`SELECT count(*)::int AS n FROM mejora_hallazgos WHERE proceso_id = ${b.procesoId}`)[0].n).toBe(4);
    });
  });

  it("el consecutivo no deja huecos y reinicia con el año", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const n = await siguienteDe(tx, 2026);
      const primero = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      const segundo = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      expect([primero.codigo, segundo.codigo]).toEqual([codigoDe(2026, n), codigoDe(2026, n + 1)]);
      if (n === 1) expect([primero.codigo, segundo.codigo]).toEqual(["HZ-2026-001", "HZ-2026-002"]);

      // Un registro que falla después de tomar el número (la llave foránea del documento) no lo quema.
      await expect(registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { documentoId: 0x7fffffff }), c(AHORA, tx))).rejects.toThrow(
        ErrorMejora,
      );
      const tercero = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      expect(tercero.codigo).toBe(codigoDe(2026, n + 2));

      await tx`UPDATE mejora_consecutivos SET ultimo = 999 WHERE anio = 2026`;
      const mil = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      expect(mil.codigo).toBe("HZ-2026-1000");
      expect(mil.codigo).toMatch(/^HZ-\d{4}-\d{3,}$/);

      // A las 04:00 UTC del 1 de enero todavía es 31 de diciembre en Bogotá: el código es de 2026.
      const diciembre = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { detectadoEn: "2026-12-31" }),
        c("2027-01-01T04:00:00Z", tx),
      );
      expect(diciembre.codigo).toBe("HZ-2026-1001");

      const n2027 = await siguienteDe(tx, 2027);
      const enero = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { detectadoEn: "2027-01-01" }),
        c("2027-01-01T06:00:00Z", tx),
      );
      expect(enero.codigo).toBe(codigoDe(2027, n2027));
      if (n2027 === 1) expect(enero.codigo).toBe("HZ-2027-001");
      expect((await hallazgo(tx, enero.id)).anio).toBe(2027);
    });
  });
});

describe("transicionarHallazgo", () => {
  it("la segunda transición sobre un estado que ya cambió", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      const ctx = await contextoDeMejora(tx, ahora);
      const viejo = await bloquearHallazgo(tx, id);
      expect(viejo.estado).toBe("por_aceptar");

      const r = await transicionarHallazgo(tx, b.lider, viejo, "aceptar", { detalle: { nota: "De acuerdo" } }, ctx);
      expect(r).toEqual({ antes: "por_aceptar", despues: "por_corregir", ronda: 1 });
      const nuevo = await hallazgo(tx, id);
      expect(nuevo.estado).toBe("por_corregir");
      expect(nuevo.vence_en).toEqual(venceEn("correccion", ahora, ctx));
      const ev = await eventos(tx, id);
      expect(ev.map((e) => e.tipo)).toEqual(["registrar", "aceptar"]);
      expect(ev[1].detalle).toEqual({ nota: "De acuerdo", estado: { antes: "por_aceptar", despues: "por_corregir" } });
      const [bitacora] = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND accion = 'mejora_aceptar'`;
      expect(bitacora.detalle).toEqual({ nota: "De acuerdo", codigo: nuevo.codigo, ronda: 1, estado: { antes: "por_aceptar", despues: "por_corregir" } });

      // Con el `h` de antes, el estado releído ya no es el suyo: nada se escribe.
      await expect(transicionarHallazgo(tx, b.lider, viejo, "rechazar", {}, ctx)).rejects.toThrow(new ErrorMejora(YA_CAMBIO));
      expect((await eventos(tx, id)).map((e) => e.tipo)).toEqual(["registrar", "aceptar"]);
      expect((await hallazgo(tx, id)).estado).toBe("por_corregir");
      // Y una acción que el estado no admite tampoco.
      await expect(transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "aceptar", {}, ctx)).rejects.toThrow(
        new ErrorMejora(YA_CAMBIO),
      );
      expect(await eventos(tx, id)).toHaveLength(2);
    });
  });

  it("el turno de cada estado y el plazo de cada paso", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));

      await transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "rechazar", { detalle: { justificacion: "No es de este proceso" } }, ctx);
      let h = await bloquearHallazgo(tx, id);
      expect(h.estado).toBe("rechazo");
      expect((await hallazgo(tx, id)).vence_en).toEqual(venceEn("decision", ahora, ctx));
      expect(await quienTieneElTurno(tx, h)).toEqual([b.control.usuarioId]);
      expect(await avisos(tx, id, "mejora.turno")).toEqual([b.lider.usuarioId, b.control.usuarioId].sort((x, y) => x - y));

      // Quien registró ya no está activo: el turno pasa al Admin SGC.
      await tx`UPDATE usuarios SET activo = false WHERE id = ${b.control.usuarioId}`;
      expect(await quienTieneElTurno(tx, h)).toEqual(await adminsActivos({ sql: tx }));
      await tx`UPDATE usuarios SET activo = true WHERE id = ${b.control.usuarioId}`;

      // Lo sostiene: arbitra el Admin SGC, porque lo registró Control Interno.
      await transicionarHallazgo(tx, b.control, h, "sostener", {}, ctx);
      h = await bloquearHallazgo(tx, id);
      expect(await quienTieneElTurno(tx, h)).toEqual(await adminsActivos({ sql: tx }));

      // El arbitraje confirma el hallazgo y queda por corregir; el plazo y las marcas son las del paso nuevo.
      await tx`UPDATE mejora_hallazgos SET aviso_vencido_en = now(), escalado_en = now(), aviso_evaluar_en = now() WHERE id = ${id}`;
      await transicionarHallazgo(tx, b.admin, h, "confirmar_hallazgo", { acta: { numero: "12", fecha: "2026-11-16" } }, ctx);
      const fila = await hallazgo(tx, id);
      expect(fila).toMatchObject({ estado: "por_corregir", aviso_vencido_en: null, escalado_en: null, aviso_evaluar_en: null });
      expect((await eventos(tx, id)).at(-1)?.detalle).toMatchObject({ acta: { numero: "12", fecha: "2026-11-16" } });
    });
  });

  it("devolver el plan da el plazo de reenviar; volver a por formular, el de la ronda", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      const { id } = await registrarHallazgo(
        b.lider,
        datosDeHallazgo(b.procesoId, { clase: "oportunidad", criticidad: undefined }),
        c(AHORA, tx),
      );
      const [ronda] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${id}`;

      const despues = new Date("2026-11-19T15:00:00Z");
      const ctx2 = { ...ctx, ahora: despues };
      await transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "enviar_plan", {}, ctx2);
      expect((await hallazgo(tx, id)).vence_en).toEqual(venceEn("revisar", despues, ctx));
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, id))).toEqual(await adminsActivos({ sql: tx }));

      await transicionarHallazgo(tx, b.admin, await bloquearHallazgo(tx, id), "devolver_plan", {}, ctx2);
      const devuelto = await hallazgo(tx, id);
      expect(devuelto.estado).toBe("por_formular");
      expect(devuelto.vence_en).toEqual(venceEn("reenviar", despues, ctx));
      expect(devuelto.vence_en).not.toEqual(ronda.formular_antes_de);
      // La devolución no toca el plazo de formular de la ronda.
      const [rondaDespues] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${id}`;
      expect(rondaDespues.formular_antes_de).toEqual(ronda.formular_antes_de);
      expect(rondaDespues.formular_antes_de).toEqual(venceEn("formular", ahora, ctx));

      await transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "enviar_plan", { rumbo: { saltaRevision: true } }, ctx2);
      const h = await bloquearHallazgo(tx, id);
      expect(h.estado).toBe("en_aprobacion");
      expect((await hallazgo(tx, id)).vence_en).toEqual(venceEn("aprobar", despues, ctx));
      expect(await quienTieneElTurno(tx, h)).toEqual(await activosDe(tx, ["gerencia"]));

      await transicionarHallazgo(tx, b.gerencia, h, "aprobar_plan", {}, ctx2);
      expect((await hallazgo(tx, id)).vence_en).toBeNull();
      // `reclasificar` no aplica aquí; un estado que no cambia por `ajustar` conserva su plazo y no vuelve a avisar.
      const enEjecucion = await bloquearHallazgo(tx, id);
      const avisosAntes = (await tx`SELECT count(*)::int AS n FROM notificaciones WHERE entidad_id = ${id} AND entidad = 'mejora_hallazgo'`)[0].n;
      await transicionarHallazgo(tx, b.admin, enEjecucion, "ajustar", { rumbo: { quedaEn: "en_ejecucion" } }, ctx2);
      expect((await tx`SELECT count(*)::int AS n FROM notificaciones WHERE entidad_id = ${id} AND entidad = 'mejora_hallazgo'`)[0].n).toBe(avisosAntes);
      expect((await eventos(tx, id)).at(-1)).toMatchObject({ tipo: "ajustar", detalle: { estado: { antes: "en_ejecucion", despues: "en_ejecucion" } } });

      // `completar` lo hace el sistema: sin sesión, el evento y la bitácora van sin usuario.
      const r = await transicionarHallazgo(tx, null, await bloquearHallazgo(tx, id), "completar", {}, ctx2);
      expect(r).toEqual({ antes: "en_ejecucion", despues: "por_verificar", ronda: 1 });
      expect((await hallazgo(tx, id)).vence_en).toEqual(venceEn("verificar", despues, ctx));
      expect((await eventos(tx, id)).at(-1)).toMatchObject({ tipo: "completar", usuario_id: null });
      const [completar] = await tx`SELECT usuario_id FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND accion = 'mejora_completar'`;
      expect(completar.usuario_id).toBeNull();
      const verificadores = await activosDe(tx, ["admin_sgc", "control_interno"]);
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, id))).toEqual(verificadores);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM notificaciones
        WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND tipo = 'mejora.turno' AND titulo LIKE 'Verificar la implementación%'`;
      expect(n).toBe(verificadores.length);
    });
  });

  it("un hallazgo terminado: el evento va antes del estado y después no admite hijas", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      await transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "rechazar", { detalle: { justificacion: "No es de este proceso" } }, ctx);
      const turnos = await avisos(tx, id, "mejora.turno");

      const r = await transicionarHallazgo(tx, b.control, await bloquearHallazgo(tx, id), "retirar", {}, ctx);
      expect(r).toEqual({ antes: "rechazo", despues: "rechazado", ronda: 1 });
      expect(await hallazgo(tx, id)).toMatchObject({ estado: "rechazado", vence_en: null });
      expect((await eventos(tx, id)).at(-1)).toMatchObject({ tipo: "retirar", detalle: { estado: { antes: "rechazo", despues: "rechazado" } } });
      const [bitacora] = await tx`SELECT accion FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND accion = 'mejora_retirar'`;
      expect(bitacora).toBeDefined();
      // Nadie tiene el turno de un terminado: no hay aviso nuevo.
      expect(await avisos(tx, id, "mejora.turno")).toEqual(turnos);

      // El trigger rechaza toda hija nueva con `42501`, y `legible` lo vuelve una frase (en un savepoint: el test sigue).
      await expect(
        legible(
          enTransaccion(tx, (t) => dejarEvento(t, { hallazgoId: id, ronda: 1, tipo: "nota", usuarioId: b.admin.usuarioId, ocurrioEn: ahora })),
        ),
      ).rejects.toThrow(new ErrorMejora("El hallazgo ya terminó y no admite cambios"));
      await expect(transicionarHallazgo(tx, b.admin, await bloquearHallazgo(tx, id), "anular", {}, ctx)).rejects.toThrow(
        new ErrorMejora(YA_CAMBIO),
      );
      expect((await eventos(tx, id)).map((e) => e.tipo)).toEqual(["registrar", "rechazar", "retirar"]);
    });
  });

  it("un estado que no cambia conserva su plazo y sus marcas", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      await tx`UPDATE mejora_hallazgos SET aviso_vencido_en = ${ahora} WHERE id = ${id}`;
      const antes = await hallazgo(tx, id);
      const tarde = { ...ctx, ahora: new Date("2026-11-25T15:00:00Z") };
      await transicionarHallazgo(tx, b.admin, await bloquearHallazgo(tx, id), "reclasificar", { rumbo: { quedaEn: "por_aceptar" } }, tarde);
      const despues = await hallazgo(tx, id);
      expect(despues).toMatchObject({ estado: "por_aceptar", aviso_vencido_en: ahora });
      expect(despues.vence_en).toEqual(antes.vence_en);
      expect(await avisos(tx, id, "mejora.turno")).toEqual([b.lider.usuarioId]);
      const [bitacora] = await tx`SELECT accion FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND accion = 'mejora_reclasificar'`;
      expect(bitacora).toBeDefined();
    });
  });

  it("llegar a por formular más tarde da el plazo de la ronda, no uno nuevo", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      const { id } = await registrarHallazgo(
        b.control,
        datosDeHallazgo(b.procesoId, { clase: "oportunidad", criticidad: undefined }),
        c(AHORA, tx),
      );
      expect((await hallazgo(tx, id)).estado).toBe("por_aceptar");
      const [ronda] = await tx`SELECT formular_antes_de FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = 1`;
      expect(ronda.formular_antes_de).toEqual(venceEn("formular", ahora, ctx));

      const tarde = new Date("2026-11-24T15:00:00Z");
      await transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "aceptar", {}, { ...ctx, ahora: tarde });
      const h = await hallazgo(tx, id);
      expect(h.estado).toBe("por_formular");
      expect(h.vence_en).toEqual(ronda.formular_antes_de);
      expect(h.vence_en).not.toEqual(venceEn("formular", tarde, ctx));
    });
  });

  it("el cambio de estado va aparte del detalle de quien llama", async () => {
    await revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ctx = await contextoDeMejora(tx, ahora);
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(AHORA, tx));
      const propio = {
        antes: { titulo: "Formatos sin diligenciar" },
        despues: { titulo: "Formatos de entrega de turno sin diligenciar" },
        justificacion: "El título no decía qué formatos",
      };
      await transicionarHallazgo(
        tx,
        b.admin,
        await bloquearHallazgo(tx, id),
        "reclasificar",
        { rumbo: { quedaEn: "por_aceptar" }, detalle: propio },
        ctx,
      );
      const estado = { antes: "por_aceptar", despues: "por_aceptar" };
      expect((await eventos(tx, id)).at(-1)?.detalle).toEqual({ ...propio, estado });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} AND accion = 'mejora_reclasificar'`;
      expect(bitacora.detalle).toEqual({ ...propio, estado, codigo: (await hallazgo(tx, id)).codigo, ronda: 1 });

      // Las claves del motor no las pone quien llama: es un error de programación, no una frase para la persona.
      for (const clave of ["estado", "codigo", "ronda", "acta"]) {
        const intento = transicionarHallazgo(tx, b.lider, await bloquearHallazgo(tx, id), "aceptar", { detalle: { [clave]: 1 } }, ctx);
        const error = await intento.catch((e: unknown) => e);
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(ErrorMejora);
        expect((error as Error).message).toContain(clave);
      }
      expect((await eventos(tx, id)).map((e) => e.tipo)).toEqual(["registrar", "reclasificar"]);
      expect((await hallazgo(tx, id)).estado).toBe("por_aceptar");
    });
  });

  it("un hallazgo que no existe", async () => {
    await revertida(sql, async (tx) => {
      await expect(bloquearHallazgo(tx, 0x7fffffff)).rejects.toThrow(new ErrorMejora("El hallazgo no existe"));
    });
  });
});

describe("legible", () => {
  it.each([
    ["23503", "Uno de los datos elegidos ya no existe: vuelva a cargar la página"],
    ["23505", "Otra persona guardó lo mismo a la vez: vuelva a cargar la página"],
    ["42501", "El hallazgo ya terminó y no admite cambios"],
    ["40P01", "Otra persona cambió el hallazgo a la vez: vuelva a intentarlo"],
  ])("traduce el %s", async (code, mensaje) => {
    const crudo = Object.assign(new Error("error crudo de PostgreSQL"), { code });
    await expect(legible(Promise.reject(crudo))).rejects.toThrow(new ErrorMejora(mensaje));
  });

  it("deja pasar los demás", async () => {
    const permiso = new ErrorPermiso();
    await expect(legible(Promise.reject(permiso))).rejects.toBe(permiso);
    const otro = Object.assign(new Error("violación de un CHECK"), { code: "23514" });
    await expect(legible(Promise.reject(otro))).rejects.toBe(otro);
    expect(await legible(Promise.resolve(7))).toBe(7);
  });
});
