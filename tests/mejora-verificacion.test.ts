/**
 * Verificar la implementación, evaluar la eficacia, cerrar y abrir la ronda siguiente (spec 15 §11 y §8.7, Tarea 16). Quien
 * ejecuta no verifica (`puedeVerificar`); la evaluación firma «Verificó» y el cierre «Cerró» (F13A-R4); «no eficaz» abre otra
 * ronda. Contra la BD de trabajo, dentro de una transacción que se revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { ErrorTramite } from "@/db/consultas/flujo/contrato";
import { reasignarActividad } from "@/db/consultas/mejoramiento/actividades";
import { pedirAjuste } from "@/db/consultas/mejoramiento/ajustes";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo, dejarEvento } from "@/db/consultas/mejoramiento/flujo";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { registrarOcurrencia } from "@/db/consultas/mejoramiento/registro";
import {
  cerrarHallazgo,
  datosDeEvaluacion,
  evaluableDesde,
  evaluarEficacia,
  fechaMinimaDe,
  METODOS_DE_VERIFICACION,
  verificarImplementacion,
} from "@/db/consultas/mejoramiento/verificacion";
import { puedeVerificar, quienesVerifican } from "@/lib/alcance";
import type { Verificador } from "@/lib/firma";
import { yaSePuedeEvaluar } from "@/lib/mejoramiento/eficacia";
import { venceEn } from "@/lib/mejoramiento/plazos";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";
import { YA_CAMBIO } from "@/lib/mejoramiento/transiciones";
import { ErrorPermiso } from "@/lib/permisos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, versionTrimestral } from "./utiles/indicadores";
import { baseDeMejora, c, hallazgoEn, terminarTodas, type BaseDeMejora } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();
afterAll(() => sql.end());

const CLAVE = { clave: "ok" };
const zona = zonaHoraria();

// R: las actividades terminan el sábado 5 de diciembre de 2026, 10:00 en Bogotá; se verifica el lunes 7.
const TERMINAN = "2026-12-05T15:00:00Z";
const VERIFICA = "2026-12-07T15:00:00Z";
// Sin indicador, una no conformidad se evalúa desde R más dos meses: el viernes 5 de febrero de 2027.
const LA_VISPERA = "2027-02-04T15:00:00Z";
const LA_MINIMA = "2027-02-05T15:00:00Z";
// Con un indicador mensual, desde el 1 de marzo (enero y febrero son los dos periodos completos después de R).
const CON_INDICADOR = "2027-03-01T15:00:00Z";

type Plan = Parameters<typeof hallazgoEn>[4];

/** Un hallazgo «Por verificar» cuyas actividades terminan el día R (`TERMINAN`). */
async function porVerificar(tx: TransactionSql, b: BaseDeMejora, plan?: Plan): Promise<HallazgoBase> {
  const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, plan);
  await terminarTodas(tx, b, h.id, TERMINAN);
  const leido = await bloquearHallazgo(tx, h.id);
  expect(leido.estado).toBe("por_verificar");
  return leido;
}

const actividadesDe = (tx: TransactionSql, hallazgoId: number) =>
  tx`SELECT a.id, a.estado, a.verificacion, a.verificacion_nota, to_char(a.corregir_antes_de, 'YYYY-MM-DD') AS corregir,
      a.terminada_en, to_char(a.fin_original, 'YYYY-MM-DD') AS fin_original, to_char(a.fin, 'YYYY-MM-DD') AS fin, a.responsable_id
    FROM mejora_actividades a WHERE a.hallazgo_id = ${hallazgoId} ORDER BY a.id`;

/** Cada actividad terminada de la ronda, conforme. */
async function todasConformes(tx: TransactionSql, hallazgoId: number) {
  return (await actividadesDe(tx, hallazgoId)).filter((a) => a.estado === "terminada").map((a) => ({ id: Number(a.id), conforme: true }));
}

/** Un hallazgo «En espera de eficacia»: Control Interno verifica todas conformes el lunes 7 de diciembre. */
async function enEspera(tx: TransactionSql, b: BaseDeMejora, plan?: Plan): Promise<HallazgoBase> {
  const h = await porVerificar(tx, b, plan);
  await verificarImplementacion(b.control, { hallazgoId: h.id, actividades: await todasConformes(tx, h.id), metodos: ["evidencias"] }, c(VERIFICA, tx));
  const leido = await bloquearHallazgo(tx, h.id);
  expect(leido.estado).toBe("en_espera");
  return leido;
}

const evaluacion = (hallazgoId: number, x?: Partial<Parameters<typeof evaluarEficacia>[1]>): Parameters<typeof evaluarEficacia>[1] => ({
  hallazgoId,
  resultado: "eficaz",
  criterios: ["no_recurrencia"],
  desde: "2026-12-05",
  hasta: "2027-02-05",
  justificacion: "No se repitió el hecho en los dos meses siguientes al plan",
  credenciales: CLAVE,
  ...x,
});

const LECCIONES = "Asignar cada registro a un turno evita que se pierda en el cambio de turno";

const firmasDe = (tx: TransactionSql, hallazgoId: number) =>
  tx`SELECT firma, ronda, usuario_id, hash_sha256 FROM firmas WHERE mejora_hallazgo_id = ${hallazgoId} AND firma IN ('verifico', 'cerro') ORDER BY id`;
const rondasDe = (tx: TransactionSql, hallazgoId: number) =>
  tx`SELECT * FROM mejora_rondas WHERE hallazgo_id = ${hallazgoId} ORDER BY numero`;
const avisosDe = (tx: TransactionSql, hallazgoId: number, tipo: string) =>
  tx`SELECT usuario_id, titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones WHERE tipo = ${tipo} AND entidad_id = ${hallazgoId} ORDER BY id`;
const bitacoraDe = (tx: TransactionSql, hallazgoId: number, accion: string) =>
  tx`SELECT detalle FROM auditoria WHERE accion = ${accion} AND entidad = 'mejora_hallazgo' AND entidad_id = ${hallazgoId} ORDER BY id`;
const eventosDe = (tx: TransactionSql, hallazgoId: number, tipo: string) =>
  tx`SELECT ronda, detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${hallazgoId} AND tipo = ${tipo} ORDER BY id`;

/** Deja inactivos a todos los usuarios activos de esos roles, salvo a `menos` (dentro de la transacción que se revierte). */
const desactivar = (tx: TransactionSql, roles: string[], menos: number[] = []) =>
  tx`UPDATE usuarios SET activo = false WHERE activo AND rol = ANY(${roles}) AND NOT (id = ANY(${menos}))`;

// ─────────────────────────────────────────────────────────────────────────────
// Quién verifica (spec §11.1)
// ─────────────────────────────────────────────────────────────────────────────

describe("puedeVerificar: quien ejecutó no verifica", () => {
  it("el responsable actual de una actividad no verifica; un Admin SGC y un Control Interno que no ejecutaron, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ejecuta = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await porVerificar(tx, b, { responsableId: ejecuta.usuarioId });
      expect(await puedeVerificar(h.id, ejecuta, { sql: tx })).toBe(false);
      expect(await puedeVerificar(h.id, b.control, { sql: tx })).toBe(true);
      expect(await puedeVerificar(h.id, b.admin, { sql: tx })).toBe(true);
      const quienes = await quienesVerifican(tx, h.id);
      expect(quienes).toEqual(expect.arrayContaining([b.control.usuarioId, b.admin.usuarioId]));
      expect(quienes).not.toContain(ejecuta.usuarioId);
      // Gerencia no, mientras otro pueda; el líder no tiene el permiso.
      expect(quienes).not.toContain(b.gerencia.usuarioId);
      expect(await puedeVerificar(h.id, b.gerencia, { sql: tx })).toBe(false);
      const otroLider = await usuarioDePrueba(tx, { rol: "lider_proceso", procesos: [b.procesoId] });
      expect(await puedeVerificar(h.id, otroLider, { sql: tx })).toBe(false);
      await expect(
        verificarImplementacion(ejecuta, { hallazgoId: h.id, actividades: await todasConformes(tx, h.id), metodos: ["evidencias"] }, c(VERIFICA, tx)),
      ).rejects.toBeInstanceOf(ErrorPermiso);
    }));

  it("quien fue responsable y lo reasignaron no verifica", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const fue = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: fue.usuarioId });
      const [a] = await actividadesDe(tx, h.id);
      await reasignarActividad(
        b.lider,
        { actividadId: Number(a.id), responsableId: b.lider.usuarioId, motivo: "Pasa al líder del proceso por carga de trabajo" },
        c("2026-11-18T15:00:00Z", tx),
      );
      expect(Number((await actividadesDe(tx, h.id))[0].responsable_id)).toBe(b.lider.usuarioId);
      expect(await puedeVerificar(h.id, fue, { sql: tx })).toBe(false);
      expect(await quienesVerifican(tx, h.id)).not.toContain(fue.usuarioId);
    }));

  it("quien registró un seguimiento no verifica", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const siguio = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const [a] = await actividadesDe(tx, h.id);
      expect(await puedeVerificar(h.id, siguio, { sql: tx })).toBe(true);
      // Solo el seguimiento (de solo inserción), sin haber sido responsable: la forma aislada de «haber registrado un seguimiento».
      await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por, creado_en)
        VALUES (${h.id}, ${a.id}, '2026-11-17', 'Se revisaron los formatos del turno de noche', 20, ${siguio.usuarioId}, now())`;
      expect(await puedeVerificar(h.id, siguio, { sql: tx })).toBe(false);
    }));

  it("quien terminó una actividad no verifica", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const termino = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const [a] = await actividadesDe(tx, h.id);
      expect(await puedeVerificar(h.id, termino, { sql: tx })).toBe(true);
      // El evento (de solo inserción) dice quién la terminó, aunque una devolución borre después la marca de la fila.
      await dejarEvento(tx, {
        hallazgoId: h.id,
        ronda: 1,
        tipo: "actividad_terminada",
        detalle: { actividadId: Number(a.id), actividad: "A1.1", archivos: 1 },
        usuarioId: termino.usuarioId,
        ocurrioEn: new Date("2026-11-17T15:00:00Z"),
      });
      expect(await puedeVerificar(h.id, termino, { sql: tx })).toBe(false);
    }));

  it("quien registró la corrección no verifica, ni su responsable", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const registro = await usuarioDePrueba(tx, { rol: "control_interno" });
      const responsable = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const h = await porVerificar(tx, b);
      expect(await puedeVerificar(h.id, registro, { sql: tx })).toBe(true);
      expect(await puedeVerificar(h.id, responsable, { sql: tx })).toBe(true);
      await tx`UPDATE mejora_hallazgos SET correccion_registrada_por = ${registro.usuarioId} WHERE id = ${h.id}`;
      expect(await puedeVerificar(h.id, registro, { sql: tx })).toBe(false);
      expect(await puedeVerificar(h.id, responsable, { sql: tx })).toBe(true);
      await tx`UPDATE mejora_hallazgos SET correccion_responsable_id = ${responsable.usuarioId} WHERE id = ${h.id}`;
      expect(await puedeVerificar(h.id, responsable, { sql: tx })).toBe(false);
      const quienes = await quienesVerifican(tx, h.id);
      expect(quienes).not.toContain(registro.usuarioId);
      expect(quienes).not.toContain(responsable.usuarioId);
    }));

  it("Gerencia verifica solo cuando ningún Admin SGC ni Control Interno activo puede", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await porVerificar(tx, b);
      expect(await puedeVerificar(h.id, b.gerencia, { sql: tx })).toBe(false);
      await desactivar(tx, ["admin_sgc", "control_interno"]);
      expect(await puedeVerificar(h.id, b.gerencia, { sql: tx })).toBe(true);
      expect(await puedeVerificar(h.id, b.control, { sql: tx })).toBe(false);
      expect(await quienesVerifican(tx, h.id)).toContain(b.gerencia.usuarioId);
    }));

  it("el turno de «Por verificar» es de quienes pueden verificar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ejecuta = await usuarioDePrueba(tx, { rol: "control_interno" });
      // La primera actividad es de Control Interno; la última la termina el líder, que no se avisa a sí mismo.
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 2 });
      const [a1] = await actividadesDe(tx, h.id);
      await reasignarActividad(b.lider, { actividadId: Number(a1.id), responsableId: ejecuta.usuarioId, motivo: "La hace Control Interno" }, c("2026-11-18T15:00:00Z", tx));
      await terminarTodas(tx, b, h.id, TERMINAN);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_verificar");
      const turno = await avisosDe(tx, h.id, "mejora.turno");
      const aVerificar = turno.filter((a) => (a.titulo as string).startsWith("Verificar la implementación"));
      expect(aVerificar.map((a) => Number(a.usuario_id))).toContain(b.control.usuarioId);
      expect(aVerificar.map((a) => Number(a.usuario_id))).not.toContain(ejecuta.usuarioId);
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Verificar la implementación (spec §11.4)
// ─────────────────────────────────────────────────────────────────────────────

describe("verificarImplementacion", () => {
  it("nadie puede: con el único Admin SGC como responsable y sin Control Interno ni Gerencia activos", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await porVerificar(tx, b, { responsableId: b.admin.usuarioId });
      await desactivar(tx, ["admin_sgc", "control_interno", "gerencia"], [b.admin.usuarioId]);
      expect(await quienesVerifican(tx, h.id)).toEqual([]);
      await expect(
        verificarImplementacion(b.admin, { hallazgoId: h.id, actividades: await todasConformes(tx, h.id), metodos: ["evidencias"] }, c(VERIFICA, tx)),
      ).rejects.toThrow("Nadie puede verificar este hallazgo: quienes tienen el rol participaron en su ejecución");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_verificar");
    }));

  it("cada actividad terminada se decide y se marca al menos un método", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await porVerificar(tx, b, { actividades: 2 });
      const [primera] = await todasConformes(tx, h.id);
      await expect(
        verificarImplementacion(b.control, { hallazgoId: h.id, actividades: [primera], metodos: ["evidencias"] }, c(VERIFICA, tx)),
      ).rejects.toThrow("Marque cada actividad como conforme o devuélvala");
      await expect(
        verificarImplementacion(b.control, { hallazgoId: h.id, actividades: await todasConformes(tx, h.id), metodos: [] }, c(VERIFICA, tx)),
      ).rejects.toThrow("Indique cómo verificó");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_verificar");
      expect(METODOS_DE_VERIFICACION).toEqual(["evidencias", "observacion", "auditoria", "entrevista"]);
    }));

  it("devolver una: esa actividad vuelve «En proceso» con su nota y su fecha, el fin original intacto, y el hallazgo a «En ejecución»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const h0 = await hallazgoEn(tx, b, "en_ejecucion", undefined, { actividades: 2 });
      const [a1, a2] = await actividadesDe(tx, h0.id);
      await reasignarActividad(b.lider, { actividadId: Number(a1.id), responsableId: otro.usuarioId, motivo: "La hace el auxiliar del turno" }, c("2026-11-18T15:00:00Z", tx));
      await terminarTodas(tx, b, h0.id, TERMINAN);
      const h = await bloquearHallazgo(tx, h0.id);
      const NOTA = "Falta el registro firmado del turno de noche";
      const decisiones = (x: { nota?: string; corregirAntesDe?: string | null }) => [
        { id: Number(a1.id), conforme: true },
        { id: Number(a2.id), conforme: false, ...x },
      ];
      const verificar = (x: Parameters<typeof decisiones>[0]) =>
        verificarImplementacion(b.control, { hallazgoId: h.id, actividades: decisiones(x), metodos: ["evidencias", "observacion"], nota: "Se revisaron los registros" }, c(VERIFICA, tx));
      await expect(verificar({ nota: "Corto", corregirAntesDe: "2026-12-18" })).rejects.toThrow("La nota de la actividad A1.2 debe tener al menos 10 caracteres");
      await expect(verificar({ nota: NOTA })).rejects.toThrow("Escriba hasta cuándo se corrige la actividad A1.2");
      await expect(verificar({ nota: NOTA, corregirAntesDe: "2026-12-04" })).rejects.toThrow("La fecha para corregir la actividad A1.2 no puede ser anterior a hoy");

      await verificar({ nota: NOTA, corregirAntesDe: "2026-12-18" });
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      const [d1, d2] = await actividadesDe(tx, h.id);
      expect(d1).toMatchObject({ estado: "terminada", verificacion: "conforme" });
      expect(d2).toMatchObject({ estado: "en_proceso", verificacion: "devuelta", verificacion_nota: NOTA, corregir: "2026-12-18", terminada_en: null });
      expect(d2.fin_original).toBe(a2.fin_original);
      expect(d2.fin).toBe(a2.fin);
      // La ronda no queda verificada: la verificación vuelve cuando se termine otra vez.
      expect((await rondasDe(tx, h.id))[0].verificada_por).toBeNull();

      // Solo el responsable de la devuelta recibe su aviso, sin la nota ni el contenido del hallazgo; nadie recibe el de turno.
      const devueltas = await tx`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones
        WHERE tipo = 'mejora.actividad_devuelta' AND entidad_id = ${a2.id}`;
      expect(devueltas).toHaveLength(1);
      expect(Number(devueltas[0].usuario_id)).toBe(b.lider.usuarioId);
      expect(devueltas[0].cuerpo).toContain("A1.2");
      expect(devueltas[0].cuerpo).toContain("18 de diciembre de 2026");
      expect(devueltas[0].cuerpo).not.toContain(NOTA);
      expect(devueltas[0].cuerpo).not.toContain("Formatos de entrega de turno");
      expect(await tx`SELECT 1 FROM notificaciones WHERE usuario_id = ${otro.usuarioId} AND tipo = 'mejora.actividad_devuelta'`).toHaveLength(0);
      const turno = await avisosDe(tx, h.id, "mejora.turno");
      expect(turno.filter((a) => (a.titulo as string).startsWith("Ejecutar las actividades"))).toHaveLength(0);

      // La nota queda en el evento y en la fila, nunca en la bitácora.
      const [evento] = await eventosDe(tx, h.id, "verificar_implementacion");
      expect(JSON.stringify(evento.detalle)).toContain(NOTA);
      const [bitacora] = await bitacoraDe(tx, h.id, "mejora_verificar_implementacion");
      expect(bitacora.detalle).toMatchObject({ devueltas: ["A1.2"], conformes: ["A1.1"] });
      expect(JSON.stringify(bitacora.detalle)).not.toContain(NOTA);
      expect(JSON.stringify(bitacora.detalle)).not.toContain("Se revisaron los registros");
    }));

  it("todas conformes: la ronda guarda quién, cuándo, los métodos y la nota, y el hallazgo pasa a «En espera de eficacia»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await porVerificar(tx, b, { actividades: 2 });
      await verificarImplementacion(
        b.control,
        { hallazgoId: h.id, actividades: await todasConformes(tx, h.id), metodos: ["entrevista", "evidencias", "evidencias"], nota: "Se entrevistó a la jefe del turno" },
        c(VERIFICA, tx),
      );
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_espera");
      const [r] = await rondasDe(tx, h.id);
      expect(Number(r.verificada_por)).toBe(b.control.usuarioId);
      expect((r.verificada_en as Date).toISOString()).toBe(new Date(VERIFICA).toISOString());
      expect(r.verificacion_metodos).toEqual(["evidencias", "entrevista"]);
      expect(r.verificacion_nota).toBe("Se entrevistó a la jefe del turno");
      expect((await actividadesDe(tx, h.id)).map((a) => a.verificacion)).toEqual(["conforme", "conforme"]);
      // Sin firma con clave: queda quién y cuándo.
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
    }));

  it("un ajuste por decidir impide verificar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await porVerificar(tx, b);
      const [a] = await tx`SELECT accion_id FROM mejora_actividades WHERE hallazgo_id = ${h.id}`;
      await pedirAjuste(
        b.lider,
        {
          hallazgoId: h.id,
          tipo: "agregar",
          nueva: { accionId: Number(a.accion_id), descripcion: "Capacitar al turno de noche", responsableId: b.lider.usuarioId, inicio: "2026-12-07", fin: "2026-12-20" },
          causa: "La verificación previa mostró que el turno de noche no conoce el formato",
        },
        c("2026-12-06T15:00:00Z", tx),
      );
      await expect(
        verificarImplementacion(b.control, { hallazgoId: h.id, actividades: await todasConformes(tx, h.id), metodos: ["evidencias"] }, c(VERIFICA, tx)),
      ).rejects.toThrow("Hay un ajuste por decidir: decídalo antes de verificar");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_verificar");
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Evaluar la eficacia (spec §11.3 a §11.5)
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluarEficacia", () => {
  it("eficaz antes de la fecha mínima lanza; el mismo día, pasa", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const fm = await fechaMinimaDe(tx, h.id, zona);
      expect(fm).toMatchObject({ r: "2026-12-05", minima: "2027-02-05", indicador: null, indicadorRetirado: false });
      expect(yaSePuedeEvaluar(fm!.minima, new Date(LA_VISPERA), zona)).toBe(false);
      expect(yaSePuedeEvaluar(fm!.minima, new Date(LA_MINIMA), zona)).toBe(true);
      expect((await datosDeEvaluacion(b.control, h.id, c(LA_VISPERA, tx))).yaSePuede).toBe(false);
      expect(await evaluableDesde(tx, h.id, new Date(LA_VISPERA))).toEqual({ desde: "2027-02-05", yaSePuede: false });
      expect(await evaluableDesde(tx, h.id, new Date(LA_MINIMA))).toEqual({ desde: "2027-02-05", yaSePuede: true });
      await expect(evaluarEficacia(b.control, evaluacion(h.id), c(LA_VISPERA, tx))).rejects.toThrow(
        "La eficacia se puede evaluar desde el 5 de febrero de 2027",
      );
      // Sin indicador enlazado, «mejora del indicador» no se marca como evaluado.
      await expect(evaluarEficacia(b.control, evaluacion(h.id, { criterios: ["mejora_indicador"] }), c(LA_MINIMA, tx))).rejects.toThrow(
        "El plan no enlazó un indicador: evalúe con otro criterio",
      );
      // A quien no puede verificar (el líder no tiene el permiso), ni los datos de la evaluación.
      await expect(datosDeEvaluacion(b.lider, h.id, c(LA_MINIMA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      await evaluarEficacia(b.control, evaluacion(h.id), c(LA_MINIMA, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_cerrar");
    }));

  it("no eficaz en cualquier momento: cierra la ronda 1 y abre la 2 en «Por formular», con las filas de la 1 intactas", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const foto = async () => ({
        analisis: await tx`SELECT * FROM mejora_analisis WHERE hallazgo_id = ${h.id} ORDER BY id`,
        causas: await tx`SELECT * FROM mejora_causas WHERE hallazgo_id = ${h.id} ORDER BY id`,
        acciones: await tx`SELECT * FROM mejora_acciones WHERE hallazgo_id = ${h.id} ORDER BY id`,
        actividades: await tx`SELECT * FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`,
      });
      const antes = await foto();
      const AHORA = "2026-12-10T15:00:00Z";
      await evaluarEficacia(
        b.control,
        evaluacion(h.id, { resultado: "no_eficaz", hasta: "2026-12-10", justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre" }),
        c(AHORA, tx),
      );
      const despues = await bloquearHallazgo(tx, h.id);
      expect(despues).toMatchObject({ estado: "por_formular", ronda: 2 });
      const [r1, r2] = await rondasDe(tx, h.id);
      expect(r1).toMatchObject({ numero: 1, resultado: "no_eficaz", evaluacion_justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre" });
      expect(Number(r1.evaluada_por)).toBe(b.control.usuarioId);
      const ctx = await contextoDeMejora(tx, new Date(AHORA));
      expect(r2).toMatchObject({ numero: 2, estado_plan: "borrador" });
      expect((r2.formular_antes_de as Date).toISOString()).toBe(venceEn("formular", new Date(AHORA), ctx).toISOString());
      const [{ vence_en }] = await tx`SELECT vence_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect((vence_en as Date).toISOString()).toBe((r2.formular_antes_de as Date).toISOString());
      expect(await foto()).toEqual(antes);
      const firmas = await firmasDe(tx, h.id);
      expect(firmas).toHaveLength(1);
      expect(firmas[0]).toMatchObject({ firma: "verifico", ronda: 1 });
      // El evento es de la ronda evaluada; la bitácora dice la ronda nueva y no lleva la justificación.
      const [evento] = await eventosDe(tx, h.id, "evaluar_no_eficaz");
      expect(evento.ronda).toBe(1);
      const [bitacora] = await bitacoraDe(tx, h.id, "mejora_evaluar_no_eficaz");
      expect(bitacora.detalle).toMatchObject({ ronda: 1, rondaNueva: 2, resultado: "no_eficaz" });
      expect(JSON.stringify(bitacora.detalle)).not.toContain("turno de noche del 9");
      // Los líderes reciben el turno de formular la ronda nueva.
      const formular = (await avisosDe(tx, h.id, "mejora.turno")).filter((a) => (a.titulo as string).startsWith("Formular"));
      expect(formular.map((a) => Number(a.usuario_id))).toContain(b.lider.usuarioId);
    }));

  it("eficaz por Control Interno queda «Por cerrar»; el Admin SGC cierra con «Cerró» y avisa a los líderes, a quien registró y a Gerencia", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await evaluarEficacia(b.control, evaluacion(h.id), c(LA_MINIMA, tx));
      const evaluado = await bloquearHallazgo(tx, h.id);
      expect(evaluado.estado).toBe("por_cerrar");
      const [verifico] = await firmasDe(tx, h.id);
      expect(verifico).toMatchObject({ firma: "verifico", ronda: 1 });
      expect(Number(verifico.usuario_id)).toBe(b.control.usuarioId);
      const [r] = await rondasDe(tx, h.id);
      expect(r).toMatchObject({ resultado: "eficaz", evaluacion_criterios: ["no_recurrencia"] });
      expect(r.evaluacion_desde).toBeTruthy();

      const CIERRA = "2027-02-08T15:00:00Z";
      await expect(cerrarHallazgo(b.admin, { hallazgoId: h.id, lecciones: "", credenciales: CLAVE }, c(CIERRA, tx))).rejects.toThrow(
        "Escriba las lecciones aprendidas",
      );
      await expect(cerrarHallazgo(b.control, { hallazgoId: h.id, lecciones: LECCIONES, credenciales: CLAVE }, c(CIERRA, tx))).rejects.toBeInstanceOf(
        ErrorPermiso,
      );
      await cerrarHallazgo(b.admin, { hallazgoId: h.id, lecciones: LECCIONES, credenciales: CLAVE }, c(CIERRA, tx));
      const cerrado = await bloquearHallazgo(tx, h.id);
      expect(cerrado).toMatchObject({ estado: "cerrado", resultadoCierre: "eficaz" });
      const [f] = await tx`SELECT cerrado_en, cerrado_por, lecciones, cambios_atendidos FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(Number(f.cerrado_por)).toBe(b.admin.usuarioId);
      expect((f.cerrado_en as Date).toISOString()).toBe(new Date(CIERRA).toISOString());
      expect(f).toMatchObject({ lecciones: LECCIONES, cambios_atendidos: null });
      const firmas = await firmasDe(tx, h.id);
      expect(firmas.map((x) => x.firma)).toEqual(["verifico", "cerro"]);
      expect(Number(firmas[1].usuario_id)).toBe(b.admin.usuarioId);
      expect(firmas[1].hash_sha256).not.toBe(firmas[0].hash_sha256);
      const avisados = (await avisosDe(tx, h.id, "mejora.cerrado")).map((a) => Number(a.usuario_id));
      expect(avisados).toEqual(expect.arrayContaining([b.lider.usuarioId, b.control.usuarioId, b.gerencia.usuarioId]));
      expect(avisados).not.toContain(b.admin.usuarioId);
      // Las lecciones no van a la bitácora.
      const [bitacora] = await bitacoraDe(tx, h.id, "mejora_cerrar");
      expect(JSON.stringify(bitacora.detalle)).not.toContain(LECCIONES);
    }));

  it("eficaz por el Admin SGC cierra en el mismo acto, con las dos firmas y una sola verificación de la clave", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await expect(evaluarEficacia(b.admin, evaluacion(h.id), c(LA_MINIMA, tx))).rejects.toThrow("Escriba las lecciones aprendidas");
      let veces = 0;
      const contando: Verificador = async (...args) => {
        veces += 1;
        return firmaDePrueba(...args);
      };
      await evaluarEficacia(b.admin, evaluacion(h.id, { lecciones: LECCIONES }), { ...c(LA_MINIMA, tx), verificar: contando });
      expect(veces).toBe(1);
      expect(await bloquearHallazgo(tx, h.id)).toMatchObject({ estado: "cerrado", resultadoCierre: "eficaz" });
      const firmas = await firmasDe(tx, h.id);
      expect(firmas.map((x) => [x.firma, Number(x.usuario_id), x.ronda])).toEqual([
        ["verifico", b.admin.usuarioId, 1],
        ["cerro", b.admin.usuarioId, 1],
      ]);
      const [r] = await rondasDe(tx, h.id);
      expect(r).toMatchObject({ resultado: "eficaz" });
      expect(Number(r.evaluada_por)).toBe(b.admin.usuarioId);
      const eventos = await tx`SELECT tipo FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo IN ('evaluar_eficaz', 'cerrar')`;
      expect(eventos.map((e) => e.tipo)).toEqual(["evaluar_eficaz"]);
      const [bitacora] = await bitacoraDe(tx, h.id, "mejora_evaluar_eficaz");
      expect(bitacora.detalle).toMatchObject({ cierra: true, estado: { antes: "en_espera", despues: "cerrado" } });
      expect(JSON.stringify(bitacora.detalle)).not.toContain(LECCIONES);
      expect((await avisosDe(tx, h.id, "mejora.cerrado")).map((a) => Number(a.usuario_id))).toContain(b.gerencia.usuarioId);
    }));

  it("el análisis pidió cambios: cerrar sin decir cómo se atendieron lanza", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await evaluarEficacia(b.control, evaluacion(h.id), c(LA_MINIMA, tx));
      await tx`UPDATE mejora_rondas SET cambios = ${tx.json({ documentos: true, riesgos: false, controles: false })}
        WHERE hallazgo_id = ${h.id} AND numero = 1`;
      const CIERRA = "2027-02-08T15:00:00Z";
      await expect(cerrarHallazgo(b.admin, { hallazgoId: h.id, lecciones: LECCIONES, credenciales: CLAVE }, c(CIERRA, tx))).rejects.toThrow(
        "Diga cómo se atendieron los cambios que el análisis pidió",
      );
      const ATENDIDOS = "Se actualizó el procedimiento de entrega de turno en su versión 3";
      await cerrarHallazgo(b.admin, { hallazgoId: h.id, lecciones: LECCIONES, cambiosAtendidos: ATENDIDOS, credenciales: CLAVE }, c(CIERRA, tx));
      const [f] = await tx`SELECT estado, cambios_atendidos FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(f).toMatchObject({ estado: "cerrado", cambios_atendidos: ATENDIDOS });
    }));

  it("con ocurrencias posteriores a R, «Eficaz» pide confirmarlo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await registrarOcurrencia(
        b.control,
        { hallazgoId: h.id, fecha: "2027-01-10", descripcion: "Otra vez un turno sin el formato de entrega diligenciado" },
        c("2027-01-10T15:00:00Z", tx),
      );
      const datos = await datosDeEvaluacion(b.control, h.id, c(LA_MINIMA, tx));
      expect(datos.ocurrencias).toEqual([{ fecha: "2027-01-10", descripcion: "Otra vez un turno sin el formato de entrega diligenciado" }]);
      await expect(evaluarEficacia(b.control, evaluacion(h.id), c(LA_MINIMA, tx))).rejects.toThrow(
        "Hay 1 ocurrencia posterior a la implementación: confírmelo para registrar la eficacia",
      );
      await evaluarEficacia(b.control, evaluacion(h.id, { confirmaOcurrencias: true }), c(LA_MINIMA, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_cerrar");
    }));

  it("dos evaluaciones a la vez: la segunda lanza YA_CAMBIO y queda una sola firma «Verificó»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await enEspera(tx, b);
      // Mientras el primero espera su clave, la otra evaluación llega y se confirma.
      const conOtra: Verificador = async (...args) => {
        await evaluarEficacia(otro, evaluacion(h.id), c(LA_MINIMA, tx));
        return firmaDePrueba(...args);
      };
      await expect(evaluarEficacia(b.control, evaluacion(h.id), { ...c(LA_MINIMA, tx), verificar: conOtra })).rejects.toThrow(YA_CAMBIO);
      const firmas = await firmasDe(tx, h.id);
      expect(firmas).toHaveLength(1);
      expect(Number(firmas[0].usuario_id)).toBe(otro.usuarioId);
      expect(await eventosDe(tx, h.id, "evaluar_eficaz")).toHaveLength(1);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_cerrar");
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// El indicador enlazado y lo congelado (spec §11.2 a §11.4, §12.2)
// ─────────────────────────────────────────────────────────────────────────────

describe("el indicador enlazado", () => {
  it("mensual: desde el 1 de marzo; retirado, dos meses y no se marca; trimestral, se recalcula", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      const h = await enEspera(tx, b, { indicadorId: ind.id });
      expect(await fechaMinimaDe(tx, h.id, zona)).toMatchObject({
        r: "2026-12-05",
        minima: "2027-03-01",
        indicador: { id: ind.id, codigo: ind.codigo, periodicidad: "mensual" },
        indicadorRetirado: false,
      });

      await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = ${new Date(VERIFICA)},
        baja_motivo = 'Ya no se mide' WHERE id = ${ind.id}`;
      expect(await fechaMinimaDe(tx, h.id, zona)).toMatchObject({ minima: "2027-02-05", indicadorRetirado: true });
      await expect(
        evaluarEficacia(b.control, evaluacion(h.id, { criterios: ["mejora_indicador"] }), c(LA_MINIMA, tx)),
      ).rejects.toThrow("El indicador se retiró: evalúe con otro criterio");

      await tx`UPDATE indicadores SET estado = 'activo', baja_por = NULL, baja_en = NULL, baja_motivo = NULL WHERE id = ${ind.id}`;
      await versionTrimestral(tx, { indicadorId: ind.id, usuarioId: b.admin.usuarioId, rigeDesde: "2027-T1", aprobadaEn: new Date(VERIFICA) });
      // El cuarto trimestre de 2026 contiene R; los dos completos después son el primero y el segundo de 2027.
      expect(await fechaMinimaDe(tx, h.id, zona)).toMatchObject({ minima: "2027-07-01", indicadorRetirado: false });
    }));

  it("con sus periodos sin dato, datosDeEvaluacion los trae con resultado nulo y no bloquea", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      const h = await enEspera(tx, b, { indicadorId: ind.id });
      const datos = await datosDeEvaluacion(b.control, h.id, c(CON_INDICADOR, tx));
      expect(datos).toMatchObject({ minima: "2027-03-01", yaSePuede: true, criterios: ["mejora_indicador"] });
      expect(datos.indicador).toMatchObject({ codigo: ind.codigo });
      // Desde dos periodos antes del que contiene R (octubre) hasta el último que terminó (febrero).
      expect(datos.indicador!.filas.map((f) => [f.periodo, f.momento, f.resultado])).toEqual([
        ["2026-10", "antes", null],
        ["2026-11", "antes", null],
        ["2026-12", "durante", null],
        ["2027-01", "despues", null],
        ["2027-02", "despues", null],
      ]);
      await evaluarEficacia(b.control, evaluacion(h.id, { criterios: ["mejora_indicador"], hasta: "2027-02-28" }), c(CON_INDICADOR, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_cerrar");
    }));

  it("lo congelado: el evento de la evaluación guarda lo que se mostró; la bitácora y la lectura del hallazgo, no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      const h = await enEspera(tx, b, { indicadorId: ind.id });
      const OCURRENCIA = "Un turno de enero quedó otra vez sin el formato";
      await registrarOcurrencia(b.control, { hallazgoId: h.id, fecha: "2027-01-20", descripcion: OCURRENCIA }, c("2027-01-20T15:00:00Z", tx));
      const JUSTIFICACION = "El indicador no bajó y la ocurrencia de enero fue un turno de reemplazo";
      await evaluarEficacia(
        b.control,
        evaluacion(h.id, { criterios: ["mejora_indicador", "no_recurrencia"], confirmaOcurrencias: true, justificacion: JUSTIFICACION, hasta: "2027-02-28" }),
        c(CON_INDICADOR, tx),
      );
      const [evento] = await eventosDe(tx, h.id, "evaluar_eficaz");
      const visto = (evento.detalle as { visto: { indicador: { filas: { momento: string }[] }; ocurrencias: { descripcion: string }[] } }).visto;
      expect(new Set(visto.indicador.filas.map((f) => f.momento))).toEqual(new Set(["antes", "durante", "despues"]));
      expect(visto.ocurrencias.map((o) => o.descripcion)).toEqual([OCURRENCIA]);
      expect((evento.detalle as { justificacion: string }).justificacion).toBe(JUSTIFICACION);

      const [bitacora] = await bitacoraDe(tx, h.id, "mejora_evaluar_eficaz");
      expect(bitacora.detalle).not.toHaveProperty("visto");
      expect(JSON.stringify(bitacora.detalle)).not.toContain(JUSTIFICACION);
      expect(JSON.stringify(bitacora.detalle)).not.toContain(OCURRENCIA);

      const leido = await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(CON_INDICADOR) });
      const deLaEvaluacion = leido!.eventos.find((e) => e.tipo === "evaluar_eficaz");
      expect(deLaEvaluacion?.detalle).not.toHaveProperty("visto");
    }));
});

// ─────────────────────────────────────────────────────────────────────────────
// Un hallazgo cerrado no cambia (spec §11.5)
// ─────────────────────────────────────────────────────────────────────────────

describe("un hallazgo cerrado", () => {
  it("no cambia: cada acto lanza una frase legible, nunca el 42501 crudo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "cerrado");
      expect(await bloquearHallazgo(tx, h.id)).toMatchObject({ estado: "cerrado", resultadoCierre: "eficaz" });
      const DESPUES = "2027-03-10T15:00:00Z";
      const legible = async (p: Promise<unknown>) => {
        const err = await p.then(
          () => null,
          (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ErrorTramite);
        expect((err as Error).message).not.toMatch(/42501|sgc_impedir|no admite cambios \(/);
        return (err as Error).message;
      };
      expect(
        await legible(registrarOcurrencia(b.control, { hallazgoId: h.id, fecha: "2027-03-09", descripcion: "Otra vez el formato sin diligenciar" }, c(DESPUES, tx))),
      ).toBe("El hallazgo ya terminó: regístrelo como reincidencia");
      const [a] = await actividadesDe(tx, h.id);
      expect(
        await legible(
          pedirAjuste(b.lider, { hallazgoId: h.id, tipo: "reprogramar", actividadId: Number(a.id), finNuevo: "2027-04-01", causa: "Hace falta más tiempo para la capacitación" }, c(DESPUES, tx)),
        ),
      ).toBe(YA_CAMBIO);
      expect(await legible(evaluarEficacia(b.control, evaluacion(h.id), c(DESPUES, tx)))).toBe(YA_CAMBIO);
      expect(await legible(cerrarHallazgo(b.admin, { hallazgoId: h.id, lecciones: LECCIONES, credenciales: CLAVE }, c(DESPUES, tx)))).toBe(YA_CAMBIO);
      expect(
        await legible(verificarImplementacion(b.control, { hallazgoId: h.id, actividades: [{ id: Number(a.id), conforme: true }], metodos: ["evidencias"] }, c(DESPUES, tx))),
      ).toBe(YA_CAMBIO);
    }));
});
