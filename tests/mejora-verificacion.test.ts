/**
 * Verificar la implementación, evaluar la eficacia, cerrar y abrir la ronda siguiente (spec 15 §11 y §8.7, Tarea 16). Quien
 * ejecuta no verifica (`puedeVerificar`); la evaluación firma «Verificó» y el cierre «Cerró» (F13A-R4); «no eficaz» abre otra
 * ronda. Contra la BD de trabajo, dentro de una transacción que se revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { ErrorFirma, ErrorTramite, type OpcionesFlujo, type SesionFlujo } from "@/db/consultas/flujo/contrato";
import { leerActividad, reasignarActividad, registrarSeguimiento, terminarActividad } from "@/db/consultas/mejoramiento/actividades";
import { pedirAjuste } from "@/db/consultas/mejoramiento/ajustes";
import { quitarAnalisis } from "@/db/consultas/mejoramiento/analisis";
import { enviarPlan } from "@/db/consultas/mejoramiento/aprobacion";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo, dejarEvento } from "@/db/consultas/mejoramiento/flujo";
import { leerHallazgo, listarHallazgos } from "@/db/consultas/mejoramiento/lectura";
import { parecidosDelProceso } from "@/db/consultas/mejoramiento/parecidos";
import { ACCION_AJENA, guardarAccion, quitarAccion } from "@/db/consultas/mejoramiento/plan";
import { registrarOcurrencia } from "@/db/consultas/mejoramiento/registro";
import {
  cerrarHallazgo,
  datosDeEvaluacion,
  evaluableDesde,
  evaluablesDesde,
  evaluarEficacia,
  fechaMinimaDe,
  huellaDeLoVisto,
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
import {
  baseDeMejora,
  c,
  evidenciaDeActividad,
  hallazgoEn,
  LECCIONES_DE_ESCENA,
  planDePrueba,
  terminarTodas,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
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

/** Una huella que no es la de nada: para los actos que se rechazan antes de mirar lo que se mostró. */
const SIN_VISTO = "0".repeat(64);

const evaluacion = (hallazgoId: number, x?: Partial<Parameters<typeof evaluarEficacia>[1]>): Parameters<typeof evaluarEficacia>[1] => ({
  hallazgoId,
  resultado: "eficaz",
  criterios: ["no_recurrencia"],
  desde: "2026-12-05",
  hasta: "2027-02-05",
  justificacion: "No se repitió el hecho en los dos meses siguientes al plan",
  vistoHuella: SIN_VISTO,
  credenciales: CLAVE,
  ...x,
});

/** La huella de lo que `quien` ve para evaluar a `ahora`: la que la página (Tarea 17) manda con el formulario. */
const loQueVe = async (tx: TransactionSql, quien: SesionFlujo, hallazgoId: number, ahora: string) =>
  huellaDeLoVisto(await datosDeEvaluacion(quien, hallazgoId, c(ahora, tx)));

/** Evalúa como `quien` a `ahora`, con la huella de lo que ve en ese momento (salvo que `x` traiga otra). */
async function evaluar(
  tx: TransactionSql,
  quien: SesionFlujo,
  hallazgoId: number,
  ahora: string,
  x?: Partial<Parameters<typeof evaluarEficacia>[1]>,
  opciones?: Partial<OpcionesFlujo>,
) {
  const vistoHuella = x?.vistoHuella ?? (await loQueVe(tx, quien, hallazgoId, ahora));
  return evaluarEficacia(quien, evaluacion(hallazgoId, { ...x, vistoHuella }), { ...c(ahora, tx), ...opciones });
}

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

  it("el responsable actual, sin seguimientos ni actividades terminadas, no verifica", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const [a] = await actividadesDe(tx, h.id);
      expect(await puedeVerificar(h.id, responsable, { sql: tx })).toBe(true);
      // Solo la fila: ni reasignación, ni seguimiento, ni la terminó.
      await tx`UPDATE mejora_actividades SET responsable_id = ${responsable.usuarioId} WHERE id = ${a.id}`;
      expect(await puedeVerificar(h.id, responsable, { sql: tx })).toBe(false);
      expect(await quienesVerifican(tx, h.id)).not.toContain(responsable.usuarioId);
    }));

  it("la corrección por sus eventos: quien registró una (también devuelta) y quien fue su responsable no verifican", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const registro = await usuarioDePrueba(tx, { rol: "control_interno" });
      const fueResponsable = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const h = await porVerificar(tx, b);
      expect(await puedeVerificar(h.id, registro, { sql: tx })).toBe(true);
      expect(await puedeVerificar(h.id, fueResponsable, { sql: tx })).toBe(true);
      // Un evento `corregir` (de solo inserción) de otra persona: las columnas siguen con la corrección del líder.
      const corregir = (usuarioId: number, responsableId: number) =>
        dejarEvento(tx, {
          hallazgoId: h.id,
          ronda: 1,
          tipo: "corregir",
          detalle: { requerida: true, descripcion: "Una corrección anterior", responsableId, responsableNombre: null },
          usuarioId,
          ocurrioEn: new Date("2026-11-16T15:00:00Z"),
        });
      await corregir(registro.usuarioId, b.lider.usuarioId);
      expect(await puedeVerificar(h.id, registro, { sql: tx })).toBe(false);
      expect(await puedeVerificar(h.id, fueResponsable, { sql: tx })).toBe(true);
      await corregir(b.lider.usuarioId, fueResponsable.usuarioId);
      expect(await puedeVerificar(h.id, fueResponsable, { sql: tx })).toBe(false);
      const [f] = await tx`SELECT correccion_registrada_por, correccion_responsable_id FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect([Number(f.correccion_registrada_por), Number(f.correccion_responsable_id)]).toEqual([b.lider.usuarioId, b.lider.usuarioId]);
    }));

  it("Gerencia respalda cuando los Admin SGC y Control Interno activos ejecutaron todos; una Gerencia que ejecutó, no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const gerenteQueSiguio = await usuarioDePrueba(tx, { rol: "gerencia" });
      const h = await porVerificar(tx, b);
      const [a] = await actividadesDe(tx, h.id);
      // Quedan activos solo el Admin SGC y el Control Interno de la base, y los dos registraron un seguimiento.
      await desactivar(tx, ["admin_sgc", "control_interno"], [b.admin.usuarioId, b.control.usuarioId]);
      for (const quien of [b.admin, b.control, gerenteQueSiguio]) {
        await tx`INSERT INTO mejora_seguimientos (hallazgo_id, actividad_id, fecha, realizado, avance, registrado_por, creado_en)
          VALUES (${h.id}, ${a.id}, '2026-12-05', 'Se acompañó la revisión del turno', 100, ${quien.usuarioId}, now())`;
      }
      expect(await puedeVerificar(h.id, b.admin, { sql: tx })).toBe(false);
      expect(await puedeVerificar(h.id, b.control, { sql: tx })).toBe(false);
      expect(await puedeVerificar(h.id, b.gerencia, { sql: tx })).toBe(true);
      expect(await puedeVerificar(h.id, gerenteQueSiguio, { sql: tx })).toBe(false);
      const quienes = await quienesVerifican(tx, h.id);
      expect(quienes).toContain(b.gerencia.usuarioId);
      expect(quienes).not.toContain(gerenteQueSiguio.usuarioId);
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

  it("una actividad devuelta no se termina con lo mismo: pide un seguimiento y un archivo nuevos", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await porVerificar(tx, b);
      const [a] = await actividadesDe(tx, h.id);
      const archivosAntes = (await tx`SELECT id FROM archivos WHERE contexto = 'mejora_actividad' AND contexto_id = ${a.id} ORDER BY id`).map((x) =>
        Number(x.id),
      );
      await verificarImplementacion(
        b.control,
        {
          hallazgoId: h.id,
          actividades: [{ id: Number(a.id), conforme: false, nota: "Falta el registro firmado del turno de noche", corregirAntesDe: "2026-12-18" }],
          metodos: ["evidencias"],
        },
        c(VERIFICA, tx),
      );
      // La devolución guarda los archivos que había: lo que se suba después tiene un id mayor.
      const [evento] = await eventosDe(tx, h.id, "verificar_implementacion");
      expect((evento.detalle as { notas: { actividadId: number; archivos: number[] }[] }).notas[0]).toMatchObject({
        actividadId: Number(a.id),
        archivos: archivosAntes,
      });
      const LUEGO = c("2026-12-08T15:00:00Z", tx);
      const actividadId = Number(a.id);
      await expect(terminarActividad(b.lider, { actividadId }, LUEGO)).rejects.toThrow("Registre un seguimiento de lo que corrigió antes de terminarla");
      await registrarSeguimiento(b.lider, { actividadId, fecha: "2026-12-08", realizado: "Se recogió la firma del turno de noche", avance: 100 }, LUEGO);
      await expect(terminarActividad(b.lider, { actividadId }, LUEGO)).rejects.toThrow("Adjunte la evidencia nueva de lo que corrigió");
      await evidenciaDeActividad(tx, actividadId, b.lider.usuarioId);
      await terminarActividad(b.lider, { actividadId }, LUEGO);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_verificar");
      expect((await actividadesDe(tx, h.id))[0]).toMatchObject({ estado: "terminada", verificacion: null });
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
      await expect(evaluar(tx, b.control, h.id, LA_VISPERA, { hasta: "2027-02-04" })).rejects.toThrow(
        "La eficacia se puede evaluar desde el 5 de febrero de 2027",
      );
      // Sin indicador enlazado, «mejora del indicador» no se marca como evaluado.
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA, { criterios: ["mejora_indicador"] })).rejects.toThrow(
        "El plan no enlazó un indicador: evalúe con otro criterio",
      );
      // A quien no puede verificar (el líder no tiene el permiso), ni los datos de la evaluación.
      await expect(datosDeEvaluacion(b.lider, h.id, c(LA_MINIMA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      await evaluar(tx, b.control, h.id, LA_MINIMA);
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
      await evaluar(tx, b.control, h.id, AHORA, {
        resultado: "no_eficaz",
        hasta: "2026-12-10",
        justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre",
      });
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

  it("la ronda 2 se formula y se envía con su propia firma; lo de la ronda 1 no se toca desde ella", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const AHORA = "2026-12-10T15:00:00Z";
      await evaluar(tx, b.control, h.id, AHORA, {
        resultado: "no_eficaz",
        hasta: "2026-12-10",
        justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre",
      });
      const foto = async () => ({
        analisis: await tx`SELECT * FROM mejora_analisis WHERE hallazgo_id = ${h.id} ORDER BY id`,
        causas: await tx`SELECT * FROM mejora_causas WHERE hallazgo_id = ${h.id} ORDER BY id`,
        acciones: await tx`SELECT * FROM mejora_acciones WHERE hallazgo_id = ${h.id} ORDER BY id`,
        actividades: await tx`SELECT * FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`,
      });
      const deLaRonda1 = await foto();
      const [analisis1] = deLaRonda1.analisis;
      const [accion1] = deLaRonda1.acciones;
      const [actividad1] = deLaRonda1.actividades;
      const o = c("2026-12-11T15:00:00Z", tx);
      await expect(quitarAnalisis(b.lider, { hallazgoId: h.id, analisisId: Number(analisis1.id) }, o)).rejects.toThrow("El análisis no existe en esta ronda");
      await expect(quitarAccion(b.lider, { hallazgoId: h.id, accionId: Number(accion1.id) }, o)).rejects.toThrow(ACCION_AJENA);
      await expect(
        guardarAccion(
          b.lider,
          {
            hallazgoId: h.id,
            accionId: Number(accion1.id),
            tipo: "correctiva",
            descripcion: "Reescribir la acción de la ronda anterior",
            causaIds: [],
            actividades: [
              { id: Number(actividad1.id), descripcion: "Otra cosa", responsableId: b.lider.usuarioId, inicio: "2026-12-11", fin: "2026-12-30" },
            ],
          },
          o,
        ),
      ).rejects.toThrow(ACCION_AJENA);
      expect(await foto()).toEqual(deLaRonda1);

      // La ronda 2 empieza vacía, se formula y se envía con su propia «Elaboró».
      await planDePrueba(tx, b, h.id);
      await enviarPlan(b.lider, { hallazgoId: h.id, credenciales: CLAVE }, o);
      expect(await bloquearHallazgo(tx, h.id)).toMatchObject({ estado: "en_revision", ronda: 2 });
      const elaboro = await tx`SELECT ronda FROM firmas WHERE mejora_hallazgo_id = ${h.id} AND firma = 'elaboro' ORDER BY id`;
      expect(elaboro.map((f) => f.ronda)).toEqual([1, 2]);
      const despues = await foto();
      expect(despues.analisis.slice(0, deLaRonda1.analisis.length)).toEqual(deLaRonda1.analisis);
      expect(despues.causas.slice(0, deLaRonda1.causas.length)).toEqual(deLaRonda1.causas);
      expect(despues.acciones.slice(0, deLaRonda1.acciones.length)).toEqual(deLaRonda1.acciones);
      expect(despues.actividades.slice(0, deLaRonda1.actividades.length)).toEqual(deLaRonda1.actividades);
      expect(despues.acciones.length).toBeGreaterThan(deLaRonda1.acciones.length);
    }));

  it("eficaz por Control Interno queda «Por cerrar»; el Admin SGC cierra con «Cerró» y avisa a los líderes, a quien registró y a Gerencia", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await evaluar(tx, b.control, h.id, LA_MINIMA);
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
      await expect(evaluar(tx, b.admin, h.id, LA_MINIMA)).rejects.toThrow("Escriba las lecciones aprendidas");
      let veces = 0;
      const contando: Verificador = async (...args) => {
        veces += 1;
        return firmaDePrueba(...args);
      };
      await evaluar(tx, b.admin, h.id, LA_MINIMA, { lecciones: LECCIONES }, { verificar: contando });
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
      await evaluar(tx, b.control, h.id, LA_MINIMA);
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
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA)).rejects.toThrow(
        "Hay 1 ocurrencia posterior a la implementación: confírmelo para registrar la eficacia",
      );
      await evaluar(tx, b.control, h.id, LA_MINIMA, { confirmaOcurrencias: true });
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("por_cerrar");
    }));

  it("se firma lo que se vio: una ocurrencia registrada entre la lectura y la evaluación la rechaza sin escribir nada", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const vistoHuella = await loQueVe(tx, b.control, h.id, LA_MINIMA);
      await registrarOcurrencia(
        b.control,
        { hallazgoId: h.id, fecha: "2027-02-05", descripcion: "Otra vez un turno sin el formato de entrega diligenciado" },
        c(LA_MINIMA, tx),
      );
      expect(await loQueVe(tx, b.control, h.id, LA_MINIMA)).not.toBe(vistoHuella);
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA, { vistoHuella, confirmaOcurrencias: true })).rejects.toThrow(
        "Cambió lo que se muestra para evaluar: revíselo",
      );
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_espera");
    }));

  it("lo que se mostró cambia mientras se pide la clave: dentro de la transacción no se firma (F13A-R4)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      const h = await enEspera(tx, b, { indicadorId: ind.id });
      const sinEscribir = async () => {
        expect(await firmasDe(tx, h.id)).toHaveLength(0);
        const [r] = await rondasDe(tx, h.id);
        expect(r).toMatchObject({ evaluada_por: null, evaluada_en: null, resultado: null, evaluacion_justificacion: null });
        expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_espera");
      };
      // Una ocurrencia llega dentro del gancho de la clave: la huella de lo visto ya no es la del formulario.
      const conOcurrencia: Verificador = async (...args) => {
        await registrarOcurrencia(
          b.control,
          { hallazgoId: h.id, fecha: "2027-02-20", descripcion: "Un turno de febrero quedó sin el formato" },
          c(CON_INDICADOR, tx),
        );
        return firmaDePrueba(...args);
      };
      await expect(
        evaluar(tx, b.control, h.id, CON_INDICADOR, { confirmaOcurrencias: true, hasta: "2027-02-28" }, { verificar: conOcurrencia }),
      ).rejects.toThrow("Cambió lo que se muestra para evaluar: revíselo");
      await sinEscribir();
      // El indicador se retira dentro del gancho: lo visto es igual, pero la fecha mínima no, y la huella de la evaluación tampoco.
      const conRetiro: Verificador = async (...args) => {
        await tx`UPDATE indicadores SET estado = 'retirado', baja_por = ${b.admin.usuarioId}, baja_en = ${new Date(CON_INDICADOR)},
          baja_motivo = 'Ya no se mide' WHERE id = ${ind.id}`;
        return firmaDePrueba(...args);
      };
      await expect(
        evaluar(tx, b.control, h.id, CON_INDICADOR, { confirmaOcurrencias: true, hasta: "2027-02-28" }, { verificar: conRetiro }),
      ).rejects.toThrow(YA_CAMBIO);
      await sinEscribir();
    }));

  it("una clave equivocada no escribe nada, ni al evaluar ni al cerrar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const MAL = { clave: "mal" };
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA, { credenciales: MAL })).rejects.toBeInstanceOf(ErrorFirma);
      await expect(evaluar(tx, b.admin, h.id, LA_MINIMA, { credenciales: MAL, lecciones: LECCIONES })).rejects.toBeInstanceOf(ErrorFirma);
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      const [r] = await rondasDe(tx, h.id);
      expect(r).toMatchObject({ evaluada_por: null, evaluada_en: null, resultado: null });
      const cierre = async () => (await tx`SELECT estado, cerrado_en, cerrado_por, lecciones FROM mejora_hallazgos WHERE id = ${h.id}`)[0];
      expect(await cierre()).toMatchObject({ estado: "en_espera", cerrado_en: null, cerrado_por: null, lecciones: null });

      await evaluar(tx, b.control, h.id, LA_MINIMA);
      const CIERRA = "2027-02-08T15:00:00Z";
      await expect(cerrarHallazgo(b.admin, { hallazgoId: h.id, lecciones: LECCIONES, credenciales: MAL }, c(CIERRA, tx))).rejects.toBeInstanceOf(
        ErrorFirma,
      );
      expect((await firmasDe(tx, h.id)).map((f) => f.firma)).toEqual(["verifico"]);
      expect(await cierre()).toMatchObject({ estado: "por_cerrar", cerrado_en: null, cerrado_por: null, lecciones: null });
    }));

  it("las ocurrencias del mismo día de R cuentan; las de antes, no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const o = c("2026-12-08T15:00:00Z", tx);
      await registrarOcurrencia(b.control, { hallazgoId: h.id, fecha: "2026-12-04", descripcion: "Un turno sin el formato antes de terminar el plan" }, o);
      await registrarOcurrencia(b.control, { hallazgoId: h.id, fecha: "2026-12-05", descripcion: "El mismo día en que terminó la última actividad" }, o);
      const datos = await datosDeEvaluacion(b.control, h.id, c(LA_MINIMA, tx));
      expect(datos.ocurrencias.map((x) => x.fecha)).toEqual(["2026-12-05"]);
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA)).rejects.toThrow(
        "Hay 1 ocurrencia posterior a la implementación: confírmelo para registrar la eficacia",
      );
    }));

  it("el periodo evaluado no termina después de hoy ni empieza después de su fin", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA, { hasta: "2027-02-06" })).rejects.toThrow(
        "El periodo evaluado no puede terminar después de hoy",
      );
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA, { desde: "2027-02-05", hasta: "2027-01-31" })).rejects.toThrow(
        "El inicio del periodo evaluado no puede ser posterior a su fin",
      );
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
    }));

  it("el Admin SGC que evalúa y cierra con cambios pedidos por el análisis dice cómo se atendieron", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      await tx`UPDATE mejora_rondas SET cambios = ${tx.json({ documentos: false, riesgos: true, controles: false })}
        WHERE hallazgo_id = ${h.id} AND numero = 1`;
      await expect(evaluar(tx, b.admin, h.id, LA_MINIMA, { lecciones: LECCIONES })).rejects.toThrow(
        "Diga cómo se atendieron los cambios que el análisis pidió",
      );
      expect(await firmasDe(tx, h.id)).toHaveLength(0);
      const ATENDIDOS = "Se actualizó la matriz de riesgos del proceso con el turno de noche";
      await evaluar(tx, b.admin, h.id, LA_MINIMA, { lecciones: LECCIONES, cambiosAtendidos: ATENDIDOS });
      const [f] = await tx`SELECT estado, cambios_atendidos FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(f).toMatchObject({ estado: "cerrado", cambios_atendidos: ATENDIDOS });
    }));

  it("dos evaluaciones a la vez: la segunda lanza YA_CAMBIO y queda una sola firma «Verificó»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await enEspera(tx, b);
      // Mientras el primero espera su clave, la otra evaluación llega y se confirma.
      const conOtra: Verificador = async (...args) => {
        await evaluar(tx, otro, h.id, LA_MINIMA);
        return firmaDePrueba(...args);
      };
      await expect(evaluar(tx, b.control, h.id, LA_MINIMA, undefined, { verificar: conOtra })).rejects.toThrow(YA_CAMBIO);
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
        evaluar(tx, b.control, h.id, LA_MINIMA, { criterios: ["mejora_indicador"] }),
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
      await evaluar(tx, b.control, h.id, CON_INDICADOR, { criterios: ["mejora_indicador"], hasta: "2027-02-28" });
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
      await evaluar(tx, b.control, h.id, CON_INDICADOR, {
        criterios: ["mejora_indicador", "no_recurrencia"],
        confirmaOcurrencias: true,
        justificacion: JUSTIFICACION,
        hasta: "2027-02-28",
      });
      const [evento] = await eventosDe(tx, h.id, "evaluar_eficaz");
      const visto = (
        evento.detalle as { visto: { indicadorId: number; indicador: { filas: { momento: string }[] }; ocurrencias: { descripcion: string }[] } }
      ).visto;
      expect(visto.indicadorId).toBe(ind.id);
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

// ─────────────────────────────────────────────────────────────────────────────
// Lo que leen la lista y la página (Tarea 17): «Por evaluar la eficacia» (R4) y lo congelado según quién mira (§6.3)
// ─────────────────────────────────────────────────────────────────────────────

describe("«Por evaluar la eficacia» en la lista, la página y las cifras (R4)", () => {
  it("antes de la fecha mínima, «En espera de eficacia»; desde ella, la etiqueta, el turno, el filtro y la cifra; el lote dice lo mismo que uno", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const lista = (ahora: string, filtro: Parameters<typeof listarHallazgos>[1] = {}) =>
        listarHallazgos(b.lider, filtro, { sql: tx, ahora: new Date(ahora) });

      const antes = await lista(LA_VISPERA);
      expect(antes.filas.find((f) => f.id === h.id)?.etiqueta).toBe("En espera de eficacia");
      expect(antes.cifras.porEvaluar).toBe(0);
      expect((await lista(LA_VISPERA, { estado: "por_evaluar" })).filas).toHaveLength(0);

      const ya = await lista(LA_MINIMA);
      const fila = ya.filas.find((f) => f.id === h.id)!;
      expect(fila.etiqueta).toBe("Por evaluar la eficacia");
      expect(fila.turno).toBe("Quien puede verificar");
      expect(ya.cifras.porEvaluar).toBe(1);
      expect(ya.cifras.enEspera).toBe(1);
      expect((await lista(LA_MINIMA, { estado: "por_evaluar" })).filas.map((f) => f.id)).toEqual([h.id]);

      const pagina = await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(LA_MINIMA) });
      expect(pagina!.etiqueta).toBe("Por evaluar la eficacia");
      expect(pagina!.fechas.evaluableDesde).toBe("2027-02-05");
      expect((await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(LA_VISPERA) }))!.etiqueta).toBe("En espera de eficacia");

      const lote = await evaluablesDesde(tx, [h.id, 0x7fffffff], new Date(LA_MINIMA));
      expect(lote.get(h.id)).toEqual({ desde: "2027-02-05", yaSePuede: true });
      expect(lote.has(0x7fffffff)).toBe(false);
    }));

  it("«Lo que sigue» en la espera: quien puede verificar ya puede registrar «No eficaz»; a los demás, desde cuándo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const del = (quien: SesionFlujo, ahora: string) => leerHallazgo(quien, h.id, { sql: tx, ahora: new Date(ahora) });
      const control = (await del(b.control, LA_VISPERA))!.loQueSigue;
      expect(control).toMatchObject({ paso: "evaluar", puede: true });
      expect(control.turno).toContain("«No eficaz»");
      const lider = (await del(b.lider, LA_VISPERA))!.loQueSigue;
      expect(lider.puede).toBe(false);
      expect(lider.turno).toBe("Espera el momento de evaluar la eficacia de las acciones: desde el 5 de febrero de 2027.");
      expect((await del(b.control, LA_MINIMA))!.loQueSigue.turno).toBe("A usted le toca evaluar la eficacia.");
      expect((await del(b.lider, LA_MINIMA))!.loQueSigue.turno).toBe("Tiene el turno: quien puede verificar, para evaluar la eficacia.");
    }));
});

describe("la evaluación en lectura (spec §6.3)", () => {
  it("lo congelado nombra el indicador solo a quien lo ve; a los demás, «un indicador», sin código ni cifras", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      const h = await enEspera(tx, b, { indicadorId: ind.id });
      const JUSTIFICACION = "El indicador subió y se mantuvo en los dos periodos siguientes";
      await evaluar(tx, b.control, h.id, CON_INDICADOR, { criterios: ["mejora_indicador"], hasta: "2027-02-28", justificacion: JUSTIFICACION });
      const o = { sql: tx, ahora: new Date(CON_INDICADOR) };

      const ve = (await leerHallazgo(b.lider, h.id, o))!;
      const ev = ve.rondas[0].evaluacion!;
      expect(ev).toMatchObject({ resultado: "eficaz", desde: "2026-12-05", hasta: "2027-02-28", justificacion: JUSTIFICACION });
      expect(ev.visto!.indicador).toMatchObject({ visible: true, codigo: ind.codigo });
      expect(ve.rondas[0].verificacion).toMatchObject({ metodos: ["evidencias"] });

      // El indicador pasa a ser restringido de otro proceso: el líder ya no lo ve, ni en lo congelado ni en los enlaces.
      const otro = await procesoNuevo(tx);
      await tx`UPDATE indicadores SET nivel_acceso = 'restringido', proceso_id = ${otro} WHERE id = ${ind.id}`;
      const yaNo = (await leerHallazgo(b.lider, h.id, o))!;
      expect(yaNo.rondas[0].evaluacion!.visto!.indicador).toEqual({ visible: false });
      expect(yaNo.enlaces).toContainEqual({ visible: false, clase: "indicador", rotulo: "Indicador de eficacia" });
      expect(JSON.stringify(yaNo)).not.toContain(ind.codigo);
      // Control Interno lo sigue viendo.
      const control = (await leerHallazgo(b.control, h.id, o))!;
      expect(control.rondas[0].evaluacion!.visto!.indicador).toMatchObject({ visible: true, codigo: ind.codigo });
    }));
});

describe("Tarea 17, ronda 1: cada hallazgo con sus verificadores y lo que se lee después", () => {
  it("el lote da a cada hallazgo su propia fecha mínima (uno con indicador mensual y otro sin indicador)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, periodicidad: "mensual" });
      const sin = await enEspera(tx, b);
      const con = await enEspera(tx, b, { indicadorId: ind.id });
      const lote = await evaluablesDesde(tx, [sin.id, con.id], new Date(LA_MINIMA));
      expect(lote.get(sin.id)).toEqual({ desde: "2027-02-05", yaSePuede: true });
      expect(lote.get(con.id)).toEqual({ desde: "2027-03-01", yaSePuede: false });
      expect((await fechaMinimaDe(tx, con.id, zona))?.minima).toBe("2027-03-01");
    }));

  it("1. en la lista, cada hallazgo «Por verificar» resuelve sus verificadores: el turno y «Esperan su decisión» por fila", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      // Control Interno es responsable de la actividad de uno (ejecutó) y no del otro.
      const ejecuto = await hallazgoEn(tx, b, "por_verificar", undefined, { responsableId: b.control.usuarioId });
      const otro = await hallazgoEn(tx, b, "por_verificar");
      // Solo queda Control Interno con el rol de verificar.
      await desactivar(tx, ["admin_sgc", "control_interno", "gerencia"], [b.control.usuarioId]);
      const ahora = new Date(VERIFICA);
      const { filas } = await listarHallazgos(b.control, { procesoId: b.procesoId }, { sql: tx, ahora });
      const turno = (id: number) => filas.find((f) => f.id === id)?.turno;
      expect(turno(ejecuto.id)).toBe("Nadie puede verificarlo");
      expect(turno(otro.id)).toBe("Quien puede verificar");
      const suyos = await listarHallazgos(b.control, { procesoId: b.procesoId, esperanSuDecision: true }, { sql: tx, ahora });
      expect(suyos.filas.map((f) => f.id)).toEqual([otro.id]);
      // Del lado del verificador que ejecutó: nadie puede, y la página lo dice.
      const pagina = await leerHallazgo(b.control, ejecuto.id, { sql: tx, ahora });
      expect(pagina!.turno).toBe("Nadie puede verificarlo");
      expect(pagina!.loQueSigue).toMatchObject({ paso: "verificar", puede: false });
      expect(pagina!.loQueSigue.turno).toContain("Nadie puede verificar este hallazgo");
      expect((await leerHallazgo(b.control, otro.id, { sql: tx, ahora }))!.loQueSigue).toMatchObject({
        paso: "verificar",
        puede: true,
        turno: "A usted le toca verificar la implementación.",
      });
    }));

  it("4. después de un «no eficaz» real, la ronda anterior trae su evaluación con lo que se mostró", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const OCURRENCIA = "El turno de noche del 9 de diciembre quedó sin el formato";
      await registrarOcurrencia(b.control, { hallazgoId: h.id, fecha: "2026-12-09", descripcion: OCURRENCIA }, c("2026-12-09T15:00:00Z", tx));
      const AHORA = "2026-12-10T15:00:00Z";
      await evaluar(tx, b.control, h.id, AHORA, {
        resultado: "no_eficaz",
        hasta: "2026-12-10",
        justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre",
      });
      const leido = (await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(AHORA) }))!;
      expect(leido.ronda).toBe(2);
      expect(leido.rondasAnteriores.map((r) => r.numero)).toEqual([1]);
      const ev = leido.rondasAnteriores[0].evaluacion!;
      expect(ev).toMatchObject({ resultado: "no_eficaz", hasta: "2026-12-10" });
      expect(ev.visto).toMatchObject({ r: "2026-12-05", minima: "2027-02-05", indicador: null });
      expect(ev.visto!.ocurrencias.map((o) => o.descripcion)).toEqual([OCURRENCIA]);
    }));

  it("6. el cierre en texto (las lecciones y los cambios atendidos) es de quien ve el hallazgo completo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "cerrado", undefined, { responsableId: b.consulta.usuarioId });
      const completo = (await leerHallazgo(b.lider, h.id, { sql: tx }))!;
      expect(completo.cierre.lecciones).toBe(LECCIONES_DE_ESCENA);
      const porActividad = (await leerHallazgo(b.consulta, h.id, { sql: tx }))!;
      expect(porActividad.ve).toBe("actividad");
      expect(porActividad.etiqueta).toBe("Cerrado · eficaz");
      expect(porActividad.cierre.cerradoEn).not.toBeNull();
      expect(porActividad.cierre.lecciones).toBeNull();
      expect(porActividad.cierre.cambiosAtendidos).toBeNull();
      expect(JSON.stringify(porActividad)).not.toContain(LECCIONES_DE_ESCENA);
    }));

  it("10. «Por evaluar la eficacia» también en la página de una actividad y en los parecidos", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await enEspera(tx, b);
      const [a] = await actividadesDe(tx, h.id);
      const de = (ahora: string) => leerActividad(b.lider, Number(a.id), { sql: tx, ahora: new Date(ahora) });
      expect((await de(LA_VISPERA))!.hallazgo.etiqueta).toBe("En espera de eficacia");
      expect((await de(LA_MINIMA))!.hallazgo.etiqueta).toBe("Por evaluar la eficacia");
      const [{ titulo, descripcion }] = await tx`SELECT titulo, descripcion FROM mejora_hallazgos WHERE id = ${h.id}`;
      const parecidos = (ahora: string) =>
        parecidosDelProceso(tx, { procesoId: b.procesoId, texto: `${titulo} ${descripcion}`, ahora: new Date(ahora) });
      expect((await parecidos(LA_VISPERA)).find((p) => p.id === h.id)?.etiqueta).toBe("En espera de eficacia");
      expect((await parecidos(LA_MINIMA)).find((p) => p.id === h.id)?.etiqueta).toBe("Por evaluar la eficacia");
    }));
});
