/**
 * Las firmas del plan (spec 15 §8.6, §12.1 y §12.2, Tarea 13): enviar con «Elaboró», devolver con observaciones, revisar con
 * «Revisó» (que vale como aprobación si no aplica Gerencia) y aprobar con «Aprobó». Lo firmado es el plan congelado al
 * enviarlo. Todo dentro de una transacción que se revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { ErrorFirma } from "@/db/consultas/flujo/contrato";
import { aprobarPlan, devolverPlan, enviarPlan, firmarRevision, firmasDeHallazgo } from "@/db/consultas/mejoramiento/aprobacion";
import { quienTieneElTurno } from "@/db/consultas/mejoramiento/avisos";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import { leerHallazgo, listarHallazgos } from "@/db/consultas/mejoramiento/lectura";
import { examinarPlan, guardarAccion } from "@/db/consultas/mejoramiento/plan";
import type { Verificador } from "@/lib/firma";
import { cierrePrevisto } from "@/lib/mejoramiento/eficacia";
import type { PlanFirmado } from "@/lib/mejoramiento/huellas";
import { venceEn } from "@/lib/mejoramiento/plazos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import type { TipoAccion } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { baseDeMejora, c, hallazgoEn, planDePrueba, type BaseDeMejora } from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { usuarioDePrueba } from "./utiles/tramites";
import { firmaDePrueba } from "./utiles/vigencia";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18, jueves 19 y viernes 20 de noviembre de 2026, 10:00 en Bogotá.
const AHORA = "2026-11-18T15:00:00Z";
const LUEGO = "2026-11-19T15:00:00Z";
const DESPUES = "2026-11-20T15:00:00Z";

const CLAVE = { clave: "ok" };
const firmasDe = async (tx: TransactionSql, hallazgoId: number) =>
  tx`SELECT firma, ronda, usuario_id, hash_sha256, tramite_id, version_id, indicador_version_id, mejora_hallazgo_id
    FROM firmas WHERE mejora_hallazgo_id = ${hallazgoId} ORDER BY id`;
const rondaDe = async (tx: TransactionSql, hallazgoId: number) =>
  (await tx`SELECT * FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} ORDER BY numero DESC LIMIT 1`)[0];
const eventosDe = async (tx: TransactionSql, hallazgoId: number, tipo: string) =>
  tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${hallazgoId} AND tipo = ${tipo} ORDER BY id`;
const examinar = async (tx: TransactionSql, hallazgoId: number, ahora = AHORA) =>
  examinarPlan(tx, hallazgoId, await contextoDeMejora(tx, new Date(ahora)));

/** Cambia la descripción de la acción del plan en borrador, con sus mismas causas y actividades. */
async function cambiarLaAccion(tx: TransactionSql, b: BaseDeMejora, hallazgoId: number, descripcion: string, ahora: string) {
  const [a] = await tx`SELECT id, tipo FROM mejora_acciones WHERE hallazgo_id = ${hallazgoId} ORDER BY id DESC LIMIT 1`;
  const causas = await tx`SELECT causa_id FROM mejora_accion_causas WHERE accion_id = ${a.id}`;
  const actividades = await tx`SELECT id, descripcion, responsable_id, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fin, 'YYYY-MM-DD') AS fin
    FROM mejora_actividades WHERE accion_id = ${a.id} ORDER BY orden`;
  await guardarAccion(
    b.lider,
    {
      hallazgoId,
      accionId: Number(a.id),
      tipo: a.tipo as TipoAccion,
      descripcion,
      causaIds: causas.map((x) => Number(x.causa_id)),
      actividades: actividades.map((x) => ({
        id: Number(x.id),
        descripcion: x.descripcion as string,
        responsableId: Number(x.responsable_id),
        inicio: x.inicio as string,
        fin: x.fin as string,
      })),
    },
    c(ahora, tx),
  );
}

describe("enviarPlan", () => {
  it("enviar un plan con faltas lanza la primera falta de examinarPlan y no firma", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const { faltas } = await examinar(tx, h.id);
      expect(faltas.length).toBeGreaterThan(0);
      await expect(enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx))).rejects.toThrow(faltas[0]);
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_formular");
    }));

  it("enviar uno completo: «En revisión», el plan enviado, una firma «Elaboró» con la huella y el plan congelado en el evento", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      await planDePrueba(tx, b, h.id);
      const examen = await examinar(tx, h.id);
      expect(examen.faltas).toEqual([]);
      await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx));

      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_revision");
      const r = await rondaDe(tx, h.id);
      expect(r.estado_plan).toBe("enviado");
      expect((r.enviado_en as Date).toISOString()).toBe(new Date(AHORA).toISOString());
      expect(Number(r.elaborado_por)).toBe(b.lider.usuarioId);

      const firmas = await firmasDe(tx, h.id);
      expect(firmas).toHaveLength(1);
      expect(firmas[0]).toMatchObject({ firma: "elaboro", ronda: 1, hash_sha256: examen.huella, tramite_id: null, version_id: null });
      expect(Number(firmas[0].mejora_hallazgo_id)).toBe(h.id);
      expect(Number(firmas[0].usuario_id)).toBe(b.lider.usuarioId);

      // El evento guarda el plan completo con su huella; la bitácora, el código, la ronda y la huella, nunca el texto.
      const [evento] = await eventosDe(tx, h.id, "enviar_plan");
      expect(evento.detalle.huella).toBe(examen.huella);
      expect(evento.detalle.plan).toEqual(examen.plan);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_enviar_plan' AND entidad_id = ${h.id}`;
      expect(bitacora.detalle).toMatchObject({ codigo: h.codigo, ronda: 1, huella: examen.huella });
      expect(bitacora.detalle).not.toHaveProperty("plan");
      expect(JSON.stringify(bitacora.detalle)).not.toContain("cadena de frío");
      // La lectura del hallazgo no lleva el plan congelado en su historial: la huella sí.
      const leido = await leerHallazgo(b.lider, h.id, { sql: tx });
      const delEnvio = leido?.eventos.find((x) => x.tipo === "enviar_plan")?.detalle as Record<string, unknown>;
      expect(delEnvio.huella).toBe(examen.huella);
      expect(delEnvio).not.toHaveProperty("plan");
    }));

  it("la clave equivocada no escribe nada: ErrorFirma, sin firma, sin evento y sin cambio de estado", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      await planDePrueba(tx, b, h.id);
      const envio = enviarPlan(b.lider, { hallazgoId: h.id, credenciales: { clave: "mala" } }, c(AHORA, tx));
      await expect(envio).rejects.toBeInstanceOf(ErrorFirma);
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      expect(await eventosDe(tx, h.id, "enviar_plan")).toHaveLength(0);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_formular");
      expect((await rondaDe(tx, h.id)).estado_plan).toBe("borrador");
    }));

  it("dos envíos a la vez: el segundo lanza YA_CAMBIO y queda una sola firma «Elaboró»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      await planDePrueba(tx, b, h.id);
      // Mientras el primero espera su clave, el otro envío llega y se confirma.
      const conOtroEnvio: Verificador = async (sesion, credenciales, contexto, ahora) => {
        await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx));
        return firmaDePrueba(sesion, credenciales, contexto, ahora);
      };
      await expect(
        enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, { ...c(AHORA, tx), verificar: conOtroEnvio }),
      ).rejects.toThrow(YA_CAMBIO);
      expect((await firmasDe(tx, h.id)).filter((f) => f.firma === "elaboro")).toHaveLength(1);
      expect(await eventosDe(tx, h.id, "enviar_plan")).toHaveLength(1);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_revision");
    }));

  it("el plan cambió entre el validador y la transacción: la huella de dentro no es la de fuera y lanza YA_CAMBIO", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      await planDePrueba(tx, b, h.id);
      const conCambio: Verificador = async (sesion, credenciales, contexto, ahora) => {
        await cambiarLaAccion(tx, b, h.id, "Reescribir el procedimiento de cadena de frío desde cero", AHORA);
        return firmaDePrueba(sesion, credenciales, contexto, ahora);
      };
      await expect(
        enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, { ...c(AHORA, tx), verificar: conCambio }),
      ).rejects.toThrow(YA_CAMBIO);
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_formular");
      expect((await rondaDe(tx, h.id)).estado_plan).toBe("borrador");
    }));
});

describe("devolverPlan", () => {
  it("vuelve a «Por formular» en borrador, con el plazo de reenviar; enviado_en no cambia y cada reenvío firma otra vez", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision");
      const enviadoEn = ((await rondaDe(tx, h.id)).enviado_en as Date).toISOString();

      await devolverPlan(b.admin, { hallazgoId: h.id, observaciones: "Falta decir quién verifica el registro del turno de noche" }, c(AHORA, tx));
      const [devuelto] = await tx`SELECT estado, vence_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(devuelto.estado).toBe("por_formular");
      const ctx = await contextoDeMejora(tx, new Date(AHORA));
      expect((devuelto.vence_en as Date).toISOString()).toBe(venceEn("reenviar", new Date(AHORA), ctx).toISOString());
      expect((await rondaDe(tx, h.id)).estado_plan).toBe("borrador");
      const [ev] = await eventosDe(tx, h.id, "devolver_plan");
      expect(ev.detalle.observaciones).toBe("Falta decir quién verifica el registro del turno de noche");

      // Reenviado sin cambios: otra firma «Elaboró», con la misma huella; la primera vez es la que cuenta.
      await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(LUEGO, tx));
      let elaboro = (await firmasDe(tx, h.id)).filter((f) => f.firma === "elaboro");
      expect(elaboro).toHaveLength(2);
      expect(elaboro[1].hash_sha256).toBe(elaboro[0].hash_sha256);
      expect(((await rondaDe(tx, h.id)).enviado_en as Date).toISOString()).toBe(enviadoEn);

      // Devuelto otra vez y cambiado: la firma nueva lleva la huella nueva.
      await devolverPlan(b.admin, { hallazgoId: h.id, observaciones: "La acción debe decir qué cambia en el procedimiento" }, c(LUEGO, tx));
      await cambiarLaAccion(tx, b, h.id, "Incluir el turno de noche en el procedimiento de cadena de frío", LUEGO);
      await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(DESPUES, tx));
      elaboro = (await firmasDe(tx, h.id)).filter((f) => f.firma === "elaboro");
      expect(elaboro).toHaveLength(3);
      expect(elaboro[2].hash_sha256).not.toBe(elaboro[0].hash_sha256);
      expect(elaboro[2].hash_sha256).toBe((await examinar(tx, h.id, DESPUES)).huella);
      expect(((await rondaDe(tx, h.id)).enviado_en as Date).toISOString()).toBe(enviadoEn);
    }));

  it("en revisión lo devuelve el Admin SGC, no Gerencia; en aprobación, Gerencia, y el plan vuelve a revisarse", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision", { criticidad: "alta" });
      const obs = { hallazgoId: h.id, observaciones: "Las fechas no alcanzan para socializar el cambio" };
      await expect(devolverPlan(b.gerencia, obs, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);

      await firmarRevision(b.admin, { hallazgoId: h.id, requiereRecursos: true, notaRecursos: "Hay que comprar un registrador", credenciales: CLAVE }, c(AHORA, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
      await expect(devolverPlan(b.admin, obs, c(LUEGO, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await devolverPlan(b.gerencia, obs, c(LUEGO, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_formular");
      const r = await rondaDe(tx, h.id);
      expect(r).toMatchObject({ estado_plan: "borrador", revisado_por: null, revisado_en: null, requiere_recursos: false, nota_recursos: null });

      // El reenvío pasa otra vez por la revisión.
      await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(DESPUES, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_revision");
    }));
});

describe("las cuatro condiciones de Gerencia", () => {
  const revisar = (tx: TransactionSql, b: BaseDeMejora, hallazgoId: number, requiereRecursos = false, notaRecursos: string | null = null) =>
    firmarRevision(b.admin, { hallazgoId, requiereRecursos, notaRecursos, credenciales: CLAVE }, c(AHORA, tx));

  it("criticidad alta: tras «Revisó» queda «En aprobación»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision", { criticidad: "alta" });
      await revisar(tx, b, h.id);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
      const firmas = await firmasDe(tx, h.id);
      expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso"]);
      expect(firmas[1].hash_sha256).toBe(firmas[0].hash_sha256);
      expect(Number(firmas[1].usuario_id)).toBe(b.admin.usuarioId);
      const r = await rondaDe(tx, h.id);
      expect(r).toMatchObject({ estado_plan: "enviado", aprobado_rol: null });
      expect(Number(r.revisado_por)).toBe(b.admin.usuarioId);
    }));

  it("origen externo: tras «Revisó» queda «En aprobación»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision", { origen: "auditoria_externa", fuente: "Auditoría de la Secretaría de Salud" });
      await revisar(tx, b, h.id);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
    }));

  it("«Requiere recursos adicionales» marcado al revisar: «En aprobación», con su nota; sin nota no se firma", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision");
      await expect(revisar(tx, b, h.id, true, null)).rejects.toThrow("Escriba la nota de los recursos o del impacto institucional");
      expect(await firmasDe(tx, h.id)).toHaveLength(1);
      await revisar(tx, b, h.id, true, "Hay que comprar un registrador de temperatura");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
      expect(await rondaDe(tx, h.id)).toMatchObject({ requiere_recursos: true, nota_recursos: "Hay que comprar un registrador de temperatura" });
      const [ev] = await eventosDe(tx, h.id, "revisar_plan");
      expect(ev.detalle).toMatchObject({ requiereRecursos: true });
    }));

  it("ninguna: «Revisó» vale como aprobación y queda «En ejecución», aprobado por el Admin SGC", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision");
      await revisar(tx, b, h.id);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      const r = await rondaDe(tx, h.id);
      expect(r).toMatchObject({ estado_plan: "aprobado", aprobado_rol: "admin_sgc" });
      expect(Number(r.aprobado_por)).toBe(b.admin.usuarioId);
      expect((r.aprobado_en as Date).toISOString()).toBe(new Date(AHORA).toISOString());
      const firmas = await firmasDe(tx, h.id);
      expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso"]);
      // La revisión que aprueba lleva el plan congelado, como la aprobación.
      const [ev] = await eventosDe(tx, h.id, "revisar_plan");
      expect(ev.detalle.huella).toBe(firmas[0].hash_sha256);
      expect((ev.detalle.plan as PlanFirmado).identificacion.codigo).toBe(h.codigo);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_revisar_plan' AND entidad_id = ${h.id}`;
      expect(bitacora.detalle).toMatchObject({ codigo: h.codigo, ronda: 1, huella: firmas[0].hash_sha256, aprobadoRol: "admin_sgc" });
      expect(bitacora.detalle).not.toHaveProperty("plan");
      const sinFin = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} AND fin_original IS DISTINCT FROM fin`;
      expect(sinFin).toHaveLength(0);
    }));
});

describe("cuando elabora un Admin SGC (proceso sin líder)", () => {
  async function sinLider(tx: TransactionSql, deLaBase?: BaseDeMejora) {
    const b = deLaBase ?? (await baseDeMejora(tx));
    const procesoId = await procesoNuevo(tx);
    const base = { ...b, procesoId };
    const h = await hallazgoEn(tx, base, "por_formular");
    await planDePrueba(tx, base, h.id);
    return { b: base, h };
  }

  it("con otro Admin SGC activo, el envío queda en revisión, el turno es del otro y quien elaboró no firma la revisión", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await sinLider(tx);
      const otro = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      await enviarPlan(b.admin, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx));
      const enviado = await bloquearHallazgo(tx, h.id);
      expect(enviado.estado).toBe("en_revision");
      const turno = await quienTieneElTurno(tx, enviado);
      expect(turno).toContain(otro.usuarioId);
      expect(turno).not.toContain(b.admin.usuarioId);
      await expect(
        firmarRevision(b.admin, { hallazgoId: h.id, requiereRecursos: false, credenciales: CLAVE }, c(LUEGO, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(devolverPlan(b.admin, { hallazgoId: h.id, observaciones: "Lo devuelvo yo mismo para cambiarlo" }, c(LUEGO, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      // Elaboró un Admin SGC: aunque no haya otra condición, aprueba Gerencia.
      await firmarRevision(otro, { hallazgoId: h.id, requiereRecursos: false, credenciales: CLAVE }, c(LUEGO, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
      const leido = await leerHallazgo(otro, h.id, { sql: tx });
      expect(leido?.rondas[0]).toMatchObject({ elaboroAdmin: true, requiereRecursos: false });
    }));

  it("en la lista, «espera su decisión» de revisar cada plan según quién lo elaboró, no el primero que se resolvió", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ajeno = await hallazgoEn(tx, b, "en_revision");
      const { h: propio } = await sinLider(tx, b);
      await usuarioDePrueba(tx, { rol: "admin_sgc" });
      await enviarPlan(b.admin, { hallazgoId: propio.id, credenciales: CLAVE }, c(AHORA, tx));
      // Sea cual sea el orden en que la lista resuelve los turnos, el que elaboró el Admin SGC no espera su revisión.
      const { filas } = await listarHallazgos(b.admin, { esperanSuDecision: true, estado: "en_revision" }, { sql: tx });
      expect(filas.map((f) => f.id).filter((id) => id === ajeno.id || id === propio.id)).toEqual([ajeno.id]);
    }));

  it("sin otro Admin SGC activo, el envío pasa directo a «En aprobación», sin firma «Revisó»", () =>
    revertida(sql, async (tx) => {
      const { b, h } = await sinLider(tx);
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND id <> ${b.admin.usuarioId}`;
      await enviarPlan(b.admin, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
      expect((await firmasDe(tx, h.id)).map((f) => f.firma)).toEqual(["elaboro"]);
      await aprobarPlan(b.gerencia, { hallazgoId: h.id, credenciales: CLAVE }, c(LUEGO, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      expect((await firmasDe(tx, h.id)).map((f) => f.firma)).toEqual(["elaboro", "aprobo"]);
    }));
});

describe("aprobarPlan", () => {
  it("queda «En ejecución»: el fin original de cada actividad, el cierre previsto, el plan en el evento y un aviso por actividad", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "por_formular", { criticidad: "alta" });
      await planDePrueba(tx, b, h.id, { actividades: 2, responsableId: responsable.usuarioId, fin: "2026-12-11" });
      await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx));
      await firmarRevision(b.admin, { hallazgoId: h.id, requiereRecursos: false, credenciales: CLAVE }, c(AHORA, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");

      // Un Admin SGC no aprueba.
      await expect(aprobarPlan(b.admin, { hallazgoId: h.id, credenciales: CLAVE }, c(LUEGO, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await aprobarPlan(b.gerencia, { hallazgoId: h.id, credenciales: CLAVE }, c(LUEGO, tx));

      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      const r = await rondaDe(tx, h.id);
      expect(r).toMatchObject({ estado_plan: "aprobado", aprobado_rol: "gerencia" });
      expect(Number(r.aprobado_por)).toBe(b.gerencia.usuarioId);
      const actividades = await tx`SELECT id, to_char(fin_original, 'YYYY-MM-DD') AS fin_original, to_char(fin, 'YYYY-MM-DD') AS fin
        FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`;
      expect(actividades).toHaveLength(2);
      for (const a of actividades) expect(a.fin_original).toBe("2026-12-11");
      const ctx = await contextoDeMejora(tx, new Date(LUEGO));
      const previsto = cierrePrevisto(
        { clase: "no_conformidad", finPlaneado: "2026-12-11", fechaEvaluacion: null, periodicidad: null, plazoReporteDias: null },
        ctx,
      );
      expect((r.cierre_previsto as Date).toISOString()).toBe(previsto.toISOString());

      // Las tres firmas y el evento comparten una huella; el evento guarda el plan.
      const firmas = await firmasDe(tx, h.id);
      expect(firmas.map((f) => f.firma)).toEqual(["elaboro", "reviso", "aprobo"]);
      expect(new Set(firmas.map((f) => f.hash_sha256)).size).toBe(1);
      const [ev] = await eventosDe(tx, h.id, "aprobar_plan");
      expect(ev.detalle.huella).toBe(firmas[0].hash_sha256);
      const [envio] = await eventosDe(tx, h.id, "enviar_plan");
      expect(ev.detalle.plan).toEqual(envio.detalle.plan);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_aprobar_plan' AND entidad_id = ${h.id}`;
      expect(bitacora.detalle).toMatchObject({ codigo: h.codigo, ronda: 1, huella: firmas[0].hash_sha256 });
      expect(bitacora.detalle).not.toHaveProperty("plan");

      // Un aviso por actividad a su responsable, sin el contenido del hallazgo.
      const avisos = await tx`SELECT titulo, cuerpo, entidad, entidad_id, enlace FROM notificaciones
        WHERE usuario_id = ${responsable.usuarioId} AND tipo = 'mejora.actividad_asignada' ORDER BY entidad_id`;
      expect(avisos).toHaveLength(2);
      expect(avisos.map((a) => Number(a.entidad_id))).toEqual(actividades.map((a) => Number(a.id)));
      for (const a of avisos) {
        expect(a).toMatchObject({ titulo: "Tiene una actividad a su cargo", entidad: "mejora_actividad" });
        expect(a.cuerpo).toContain("del plan de prueba");
        expect(a.cuerpo).toContain("11 de diciembre de 2026");
        expect(a.cuerpo).not.toContain(h.codigo);
        expect(a.cuerpo).not.toContain("Formatos de entrega de turno");
      }

      // firmasDeHallazgo: las tres, en orden, con quien firmó y su huella.
      const leidas = await firmasDeHallazgo(tx, h.id);
      expect(leidas.map((f) => [f.firma, f.ronda])).toEqual([
        ["elaboro", 1],
        ["reviso", 1],
        ["aprobo", 1],
      ]);
      expect(leidas[2].nombre).toBe(b.gerencia.nombre);
      expect(leidas[2].huella).toBe(firmas[0].hash_sha256);
      expect(leidas[2].cuando.toISOString()).toBe(new Date(LUEGO).toISOString());
    }));

  it("firma lo congelado: renombrar a un responsable y el proceso entre el envío y la aprobación no la bloquea", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_aprobacion");
      const [envio] = await eventosDe(tx, h.id, "enviar_plan");
      const plan = envio.detalle.plan as PlanFirmado;
      await tx`UPDATE usuarios SET nombre = 'Otro nombre de la líder' WHERE id = ${b.lider.usuarioId}`;
      await tx`UPDATE procesos SET nombre = 'Proceso renombrado' WHERE id = ${b.procesoId}`;
      await aprobarPlan(b.gerencia, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      const firmas = await firmasDe(tx, h.id);
      expect(new Set(firmas.map((f) => f.hash_sha256)).size).toBe(1);
      const [ev] = await eventosDe(tx, h.id, "aprobar_plan");
      expect((ev.detalle.plan as PlanFirmado).identificacion.proceso).toBe(plan.identificacion.proceso);
      expect((ev.detalle.plan as PlanFirmado).acciones[0].actividades[0].responsable).toBe(plan.acciones[0].actividades[0].responsable);
      expect((ev.detalle.plan as PlanFirmado).identificacion.proceso).not.toBe("Proceso renombrado");
    }));

  it("un responsable desactivado antes de aprobar: pide devolver el plan y no firma", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_aprobacion");
      await tx`UPDATE usuarios SET activo = false WHERE id = ${b.lider.usuarioId}`;
      await expect(aprobarPlan(b.gerencia, { hallazgoId: h.id, credenciales: CLAVE }, c(AHORA, tx))).rejects.toThrow(
        "El responsable de la actividad A1.1 ya no está activo: devuelva el plan",
      );
      expect((await firmasDe(tx, h.id)).map((f) => f.firma)).not.toContain("aprobo");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_aprobacion");
    }));

  it("un responsable desactivado antes de la revisión que aprueba: tampoco se firma «Revisó»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision");
      await tx`UPDATE usuarios SET activo = false WHERE id = ${b.lider.usuarioId}`;
      await expect(
        firmarRevision(b.admin, { hallazgoId: h.id, requiereRecursos: false, credenciales: CLAVE }, c(AHORA, tx)),
      ).rejects.toThrow("El responsable de la actividad A1.1 ya no está activo: devuelva el plan");
      expect((await firmasDe(tx, h.id)).map((f) => f.firma)).toEqual(["elaboro"]);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_revision");
    }));
});

describe("hallazgoEn (utilidad de las pruebas)", () => {
  it("llega a «En ejecución» por la revisión que aprueba y por Gerencia, con el plan aprobado", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const directo = await hallazgoEn(tx, b, "en_ejecucion");
      const porGerencia = await hallazgoEn(tx, b, "en_ejecucion", { criticidad: "alta" });
      expect((await rondaDe(tx, directo.id)).aprobado_rol).toBe("admin_sgc");
      expect((await rondaDe(tx, porGerencia.id)).aprobado_rol).toBe("gerencia");
      const oportunidad = await hallazgoEn(tx, b, "en_ejecucion", { clase: "oportunidad", criticidad: null });
      expect(oportunidad.estado).toBe("en_ejecucion");
    }));
});
