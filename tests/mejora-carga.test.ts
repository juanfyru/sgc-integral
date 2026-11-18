/**
 * Registrar un hallazgo ya en curso (spec 15 §15, Tarea 20): el plan aprobado en papel entra en una transacción, con cada paso
 * hecho fuera de la plataforma marcado, sin firma del sistema y con sus fechas reales; y mientras falta el formato firmado
 * (`cargaConfirmada`), las actividades no llegan a sus responsables (ni tareas, ni avisos, ni «Mis actividades») y no se verifica.
 * Contra la BD de trabajo, dentro de una transacción que se revierte.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import {
  contarMisActividades,
  leerActividad,
  misActividades,
  reasignarActividad,
  registrarSeguimiento,
  terminarActividad,
} from "@/db/consultas/mejoramiento/actividades";
import { decidirAjuste, escalarAGerencia, pedirAjuste, quienDecideAjustes } from "@/db/consultas/mejoramiento/ajustes";
import { quitarArchivoDeMejora } from "@/db/consultas/mejoramiento/archivos";
import { cargaConfirmada, cargarHallazgo, FALTA_EL_ESCANEO, type DatosDeCarga } from "@/db/consultas/mejoramiento/carga";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { leerHallazgo, listarHallazgos } from "@/db/consultas/mejoramiento/lectura";
import { anularHallazgo, envioAntesDeAprobar, oficiosPosibles, registrarRespuestaAlEnte } from "@/db/consultas/mejoramiento/registro";
import { tareasDeMejoramiento } from "@/db/consultas/mejoramiento/tareas";
import { revisarVencimientosDeMejoramiento } from "@/db/consultas/mejoramiento/vencimientos";
import {
  cerrarHallazgo,
  datosDeEvaluacion,
  evaluarEficacia,
  fechaMinimaDe,
  huellaDeLoVisto,
  verificarImplementacion,
} from "@/db/consultas/mejoramiento/verificacion";
import { puedeVerificar, quienesVerifican } from "@/lib/alcance";
import { cierrePrevisto } from "@/lib/mejoramiento/eficacia";
import { fechaLargaDeDia } from "@/lib/mejoramiento/formato";
import { huellaDeEvaluacion, huellaDePlan, type PlanFirmado } from "@/lib/mejoramiento/huellas";
import { venceEn } from "@/lib/mejoramiento/plazos";
import { ErrorMejora } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { silenciarDistribucion } from "./utiles/distribucion";
import { silenciarIndicadores } from "./utiles/indicadores";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  escaneoDeLaCarga,
  evidenciaDelHallazgo,
  LECCIONES_DE_ESCENA,
  silenciarMejoramiento,
  terminarTodas,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { silenciarImpactos } from "./utiles/normograma";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";
import { silenciarRevisionAnual, silenciarVigencia } from "./utiles/vigencia";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá: el día de la carga. El papel es de 2025.
const AHORA = "2026-11-18T15:00:00Z";
const zona = zonaHoraria();
const dia = (instante: unknown) => fechaEnZona(instante as Date, zona);

/** Las dos actividades de `datosDeCarga`, ya terminadas en papel. */
const terminadas = (responsableId: number): DatosDeCarga["acciones"] => [
  {
    tipo: "correctiva",
    descripcion: "Actualizar el procedimiento de entrega de turno",
    causas: [1],
    actividades: [
      { descripcion: "Redactar la versión nueva del procedimiento", responsableId, inicio: "2025-11-05", fin: "2026-01-30", avance: 100, terminadaEn: "2026-01-28" },
      { descripcion: "Capacitar a los turnos de noche", responsableId, inicio: "2026-02-01", fin: "2026-06-30", avance: 100, terminadaEn: "2026-06-26" },
    ],
  },
];

async function cargar(tx: TransactionSql, b: BaseDeMejora, responsableId: number, cambios?: Partial<DatosDeCarga>) {
  return cargarHallazgo(b.admin, datosDeCarga(b.procesoId, responsableId, cambios), c(AHORA, tx));
}

const actividadesDe = (tx: TransactionSql, hallazgoId: number) =>
  tx`SELECT id, estado, avance, fin, fin_original, terminada_en, terminada_por FROM mejora_actividades WHERE hallazgo_id = ${hallazgoId} ORDER BY id`;

const avisosA = (tx: TransactionSql, usuarioId: number) =>
  tx`SELECT tipo, titulo, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${usuarioId} ORDER BY id`;

const idsDeTareas = async (s: SesionFlujo, tx: TransactionSql, ahora = AHORA) =>
  (await tareasDeMejoramiento(s, { sql: tx, ahora: new Date(ahora) })).tareas.map((t) => t.id);

/** Lo que ya hay en la base, de todos los módulos, queda sin nada que avisar: la pasada cuenta solo lo de este test. */
async function silenciarTodo(tx: TransactionSql): Promise<void> {
  await tx`UPDATE tramites SET aviso_vencido_en = coalesce(aviso_vencido_en, now()), escalado_en = coalesce(escalado_en, now())`;
  await silenciarDistribucion(tx);
  await silenciarVigencia(tx);
  await silenciarImpactos(tx);
  await silenciarRevisionAnual(tx);
  await silenciarIndicadores(tx);
  await silenciarMejoramiento(tx);
}

describe("cargarHallazgo", () => {
  it("solo el Admin SGC carga", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const datos = datosDeCarga(b.procesoId, b.lider.usuarioId);
      await expect(cargarHallazgo(b.control, datos, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(cargarHallazgo(b.lider, datos, c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
    }));

  it("entra en ejecución con sus fechas reales", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id, codigo } = await cargar(tx, b, b.lider.usuarioId);
      // El código es del año de la carga, no del papel.
      expect(codigo).toMatch(/^HZ-2026-\d{3,}$/);
      const [h] = await tx`SELECT estado, cargado, ronda, correccion_requerida, correccion_registrada_por, accion_requerida,
          to_char(correccion_implementada_en, 'YYYY-MM-DD') AS implementada
        FROM mejora_hallazgos WHERE id = ${id}`;
      expect(h).toMatchObject({ estado: "en_ejecucion", cargado: true, ronda: 1, correccion_requerida: true, accion_requerida: true, implementada: "2025-10-15" });
      // Quien carga no registró la corrección: la registraron en papel.
      expect(h.correccion_registrada_por).toBeNull();

      // Un evento por cada paso hecho en papel, en su fecha real; el de la carga, hoy y en la plataforma.
      const eventos = await tx`SELECT tipo, fuera, ocurrio_en, detalle FROM mejora_eventos WHERE hallazgo_id = ${id} ORDER BY ocurrio_en, id`;
      const fuera = eventos.filter((e) => e.fuera === true);
      expect(fuera.map((e) => [e.tipo, dia(e.ocurrio_en)])).toEqual([
        ["registrar", "2025-10-08"],
        ["corregir", "2025-10-15"],
        ["aprobar_plan", "2025-11-04"],
      ]);
      expect(eventos.filter((e) => e.fuera !== true).map((e) => e.tipo)).toEqual(["cargar"]);
      // El plan aprobado en papel queda congelado en su evento, con su huella (spec §12.2).
      const aprobacion = fuera[2].detalle as { plan: PlanFirmado; huella: string; aprobadoPor: string };
      expect(aprobacion.huella).toBe(huellaDePlan(aprobacion.plan));
      expect(aprobacion.plan.acciones[0].actividades.map((a) => a.numero)).toEqual(["A1.1", "A1.2"]);
      expect(aprobacion.aprobadoPor).toBe("Marta Ríos, Coordinadora del SGC");

      // Ninguna firma del sistema.
      expect(await tx`SELECT id FROM firmas WHERE mejora_hallazgo_id = ${id}`).toHaveLength(0);

      const [r] = await tx`SELECT estado_plan, enviado_en, aprobado_en, aprobado_rol, aprobado_fuera, aprobado_por, cierre_previsto
        FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = 1`;
      expect(r).toMatchObject({ estado_plan: "aprobado", enviado_en: null, aprobado_rol: "admin_sgc", aprobado_fuera: "Marta Ríos, Coordinadora del SGC", aprobado_por: null });
      expect(dia(r.aprobado_en)).toBe("2025-11-04");
      expect(r.cierre_previsto).not.toBeNull();

      const actividades = await actividadesDe(tx, id);
      expect(actividades.map((a) => a.fin_original)).toEqual(actividades.map((a) => a.fin));
      expect(actividades[0]).toMatchObject({ estado: "terminada", avance: 100, terminada_por: null });
      expect(dia(actividades[0].terminada_en)).toBe("2026-01-28");
      expect(actividades[1]).toMatchObject({ estado: "en_proceso", avance: 40, terminada_en: null });

      // La bitácora dice la carga sin lo que escribió quien cargó ni el nombre de quien aprobó en papel.
      const bitacora = await tx`SELECT accion, detalle FROM auditoria WHERE entidad = 'mejora_hallazgo' AND entidad_id = ${id} ORDER BY id`;
      expect(bitacora.map((f) => f.accion)).toEqual(["mejora_cargar"]);
      const enTexto = JSON.stringify(bitacora[0].detalle);
      for (const escrito of ["Marta Ríos", "Coordinadora", "Se diligenciaron", "El procedimiento no asigna", "Capacitar"]) {
        expect(enTexto).not.toContain(escrito);
      }

      const detalle = await leerHallazgo(b.admin, id, { sql: tx, ahora: new Date(AHORA) });
      expect(detalle?.cargado).toBe(true);
      expect(detalle?.cargaConfirmada).toBe(false);
      expect(detalle?.marcas).toContain("Cargado");
    }));

  it("con todas las actividades terminadas entra en por_verificar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await cargar(tx, b, b.lider.usuarioId, { acciones: terminadas(b.lider.usuarioId) });
      const [h] = await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${id}`;
      expect(h.estado).toBe("por_verificar");
      expect((await actividadesDe(tx, id)).map((a) => a.estado)).toEqual(["terminada", "terminada"]);
    }));

  it("el rol que decide los ajustes es el declarado", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const media = await cargar(tx, b, b.lider.usuarioId);
      expect((await quienDecideAjustes(tx, media.id, b.lider.usuarioId)).rol).toBe("admin_sgc");
      // Criticidad alta u origen externo: Gerencia, aunque se declare lo contrario.
      const alta = await cargar(tx, b, b.lider.usuarioId, { criticidad: "alta" });
      expect((await quienDecideAjustes(tx, alta.id, b.lider.usuarioId)).rol).toBe("gerencia");
      const externo = await cargar(tx, b, b.lider.usuarioId, { origen: "auditoria_externa" });
      expect((await quienDecideAjustes(tx, externo.id, b.lider.usuarioId)).rol).toBe("gerencia");
      const [r] = await tx`SELECT aprobado_rol FROM mejora_rondas WHERE hallazgo_id = ${alta.id}`;
      expect(r.aprobado_rol).toBe("gerencia");
    }));

  it("sin escaneo no avanza", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { id, codigo } = await cargar(tx, b, responsable.usuarioId);
      const o = { sql: tx, ahora: new Date(AHORA) };
      const [, abierta] = await actividadesDe(tx, id);
      const actividadId = Number(abierta.id);
      expect(await cargaConfirmada(tx, id)).toBe(false);
      expect((await misActividades(responsable, o)).map((a) => a.id)).not.toContain(actividadId);
      expect(await idsDeTareas(responsable, tx)).not.toContain(`mej-actividad:${actividadId}`);
      expect(await avisosA(tx, responsable.usuarioId)).toEqual([]);

      // Uno ya terminado tampoco se verifica sin el escaneo.
      const porVerificar = await cargar(tx, b, responsable.usuarioId, { acciones: terminadas(responsable.usuarioId) });
      expect(await idsDeTareas(b.control, tx)).not.toContain(`mej-verificar:${porVerificar.id}`);
      const conformes = (await actividadesDe(tx, porVerificar.id)).map((a) => ({ id: Number(a.id), conforme: true }));
      await expect(
        verificarImplementacion(b.control, { hallazgoId: porVerificar.id, actividades: conformes, metodos: ["evidencias"] }, c(AHORA, tx)),
      ).rejects.toThrow(new ErrorMejora(FALTA_EL_ESCANEO));
      const pagina = await leerHallazgo(b.control, porVerificar.id, o);
      expect(pagina?.loQueSigue).toMatchObject({ paso: null, puede: false });

      // El escaneo confirma la carga: el evento, la bitácora y el aviso a cada responsable de una actividad abierta.
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await cargaConfirmada(tx, id)).toBe(true);
      const confirmada = await tx`SELECT usuario_id, fuera FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = 'carga_confirmada'`;
      expect(confirmada).toEqual([{ usuario_id: b.admin.usuarioId, fuera: false }]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_carga_confirmada' AND entidad_id = ${id}`;
      expect(bitacora.detalle).toEqual({ codigo });
      expect(await avisosA(tx, responsable.usuarioId)).toEqual([
        { tipo: "mejora.actividad_asignada", titulo: "Tiene una actividad a su cargo", entidad: "mejora_actividad", entidad_id: actividadId },
      ]);
      expect((await misActividades(responsable, o)).map((a) => a.id)).toContain(actividadId);
      expect(await idsDeTareas(responsable, tx)).toContain(`mej-actividad:${actividadId}`);

      // Un segundo escaneo no confirma otra vez ni vuelve a avisar.
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await tx`SELECT id FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = 'carga_confirmada'`).toHaveLength(1);
      expect(await avisosA(tx, responsable.usuarioId)).toHaveLength(1);

      // El que ya estaba por verificar: con su escaneo, quien verifica tiene su tarea y su aviso.
      await escaneoDeLaCarga(tx, porVerificar.id, b.admin.usuarioId);
      expect(await idsDeTareas(b.control, tx)).toContain(`mej-verificar:${porVerificar.id}`);
      expect((await avisosA(tx, b.control.usuarioId)).filter((a) => a.entidad_id === porVerificar.id)).toEqual([
        { tipo: "mejora.turno", titulo: `Verificar la implementación de ${porVerificar.codigo}`, entidad: "mejora_hallazgo", entidad_id: porVerificar.id },
      ]);
    }));

  it("el formato firmado no se quita", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await cargar(tx, b, b.lider.usuarioId);
      const escaneo = await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      await expect(quitarArchivoDeMejora(b.admin, escaneo, { sql: tx })).rejects.toThrow(
        new ErrorMejora("El formato firmado de la carga es la evidencia de lo hecho en papel: no se quita"),
      );
      expect(await cargaConfirmada(tx, id)).toBe(true);
    }));

  it("las fechas se validan", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const r = b.lider.usuarioId;
      const conAprobacion = (fecha: string): Partial<DatosDeCarga> => ({
        aprobacion: { nombre: "Marta Ríos", cargo: "Coordinadora del SGC", fecha, rol: "admin_sgc" },
      });
      await expect(cargar(tx, b, r, conAprobacion("2026-11-19"))).rejects.toThrow(new ErrorMejora("La fecha de aprobación del plan no puede ser futura"));
      await expect(cargar(tx, b, r, conAprobacion("2025-10-07"))).rejects.toThrow(
        new ErrorMejora("La fecha de aprobación del plan no puede ser anterior a su registro en papel"),
      );
      await expect(cargar(tx, b, r, { registradoEnPapel: "2025-10-05" })).rejects.toThrow(
        new ErrorMejora("La fecha de registro en papel no puede ser anterior a la de detección"),
      );
      const sinFecha = datosDeCarga(b.procesoId, r).acciones;
      sinFecha[0].actividades[0] = { ...sinFecha[0].actividades[0], terminadaEn: null };
      await expect(cargar(tx, b, r, { acciones: sinFecha })).rejects.toThrow(new ErrorMejora("Escriba la fecha en que terminó la actividad A1.1"));
      // Con la aprobación de hoy, entra.
      await expect(cargar(tx, b, r, conAprobacion("2026-11-18"))).resolves.toMatchObject({ codigo: expect.stringMatching(/^HZ-2026-/) });
    }));

  it("sigue el recorrido normal", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await cargar(tx, b, b.lider.usuarioId);
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      // La líder registra el seguimiento de la que quedaba abierta, sube su evidencia y la termina: queda por verificar.
      await terminarTodas(tx, b, id, "2026-11-20T15:00:00Z");
      expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${id}`)[0].estado).toBe("por_verificar");
      const conformes = (await actividadesDe(tx, id)).map((a) => ({ id: Number(a.id), conforme: true }));
      await verificarImplementacion(b.control, { hallazgoId: id, actividades: conformes, metodos: ["evidencias"] }, c("2026-11-23T15:00:00Z", tx));
      const fm = await fechaMinimaDe(tx, id, zona);
      expect(fm?.r).toBe("2026-11-20");
      const evalua = c(`${fm!.minima}T15:00:00Z`, tx);
      const datos = {
        hallazgoId: id,
        resultado: "eficaz" as const,
        criterios: ["no_recurrencia"],
        desde: fm!.r,
        hasta: fm!.minima,
        justificacion: "No se repitió el hecho desde que terminó el plan",
        confirmaOcurrencias: true,
      };
      const visto = await datosDeEvaluacion(b.control, id, evalua);
      await evaluarEficacia(b.control, { ...datos, vistoHuella: huellaDeLoVisto(visto), credenciales: { clave: "ok" } }, evalua);
      await cerrarHallazgo(b.admin, { hallazgoId: id, lecciones: LECCIONES_DE_ESCENA, credenciales: { clave: "ok" } }, evalua);
      expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${id}`)[0].estado).toBe("cerrado");
      // Con sus firmas del sistema; «Verificó» encadena el plan aprobado en papel (su evento, spec §12.2).
      const firmas = await tx`SELECT firma, hash_sha256 FROM firmas WHERE mejora_hallazgo_id = ${id} ORDER BY id`;
      expect(firmas.map((f) => f.firma)).toEqual(["verifico", "cerro"]);
      const [papel] = await tx`SELECT detalle->>'huella' AS huella FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = 'aprobar_plan' AND fuera`;
      const [evento] = await tx`SELECT detalle->'visto' AS visto FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = 'evaluar_eficaz'`;
      expect(firmas[0].hash_sha256).toBe(
        huellaDeEvaluacion({
          huellaDelPlan: papel.huella as string,
          resultado: "eficaz",
          criterios: datos.criterios,
          desde: datos.desde,
          hasta: datos.hasta,
          justificacion: datos.justificacion,
          visto: evento.visto,
        }),
      );
    }));
});

describe("quien carga no ejecutó", () => {
  it("el Admin SGC que lo cargó puede verificarlo si no es responsable declarado", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      // Lo hecho en papel, también la corrección y las actividades terminadas, es de otros: quien cargó no ejecutó.
      const acciones = terminadas(b.lider.usuarioId);
      acciones[0].actividades[1] = { ...acciones[0].actividades[1], responsableId: otroAdmin.usuarioId };
      const { id } = await cargar(tx, b, b.lider.usuarioId, { acciones });
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      const verifican = await quienesVerifican(tx, id);
      expect(verifican).toContain(b.admin.usuarioId);
      expect(verifican).toContain(b.control.usuarioId);
      // Un responsable declarado sí ejecutó.
      expect(verifican).not.toContain(otroAdmin.usuarioId);
      expect(await puedeVerificar(id, b.admin, { sql: tx })).toBe(true);
      const conformes = (await actividadesDe(tx, id)).map((a) => ({ id: Number(a.id), conforme: true }));
      await verificarImplementacion(b.admin, { hallazgoId: id, actividades: conformes, metodos: ["evidencias"] }, c(AHORA, tx));
      expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${id}`)[0].estado).toBe("en_espera");
    }));
});

describe("la respuesta al ente de un externo cargado", () => {
  for (const [estado, conTerminadas] of [
    ["en_ejecucion", false],
    ["por_verificar", true],
  ] as const) {
    it(`sale de la carga (${estado}): el oficio, subido después, y la fecha, desde la aprobación declarada`, () =>
      revertida(sql, async (tx) => {
        const b = await baseDeMejora(tx);
        const { id } = await cargar(tx, b, b.lider.usuarioId, {
          origen: "ente_control",
          fuente: "Visita de la Superintendencia de Salud",
          fechaLimiteEnte: "2026-12-30",
          ...(conTerminadas ? { acciones: terminadas(b.lider.usuarioId) } : {}),
        });
        expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${id}`)[0].estado).toBe(estado);
        expect(await idsDeTareas(b.admin, tx)).toContain(`mej-ente:${id}`);
        expect(await oficiosPosibles(tx, id)).toEqual([]);
        const oficioId = await evidenciaDelHallazgo(tx, id, b.admin.usuarioId);
        expect(await oficiosPosibles(tx, id)).toEqual([oficioId]);
        const o = c(AHORA, tx);
        await expect(registrarRespuestaAlEnte(b.admin, { hallazgoId: id, enviadaEn: "2025-11-03", oficioId }, o)).rejects.toThrow(
          new ErrorMejora(envioAntesDeAprobar("2025-11-04")),
        );
        await registrarRespuestaAlEnte(b.admin, { hallazgoId: id, enviadaEn: "2025-11-04", oficioId }, o);
        expect(await idsDeTareas(b.admin, tx)).not.toContain(`mej-ente:${id}`);
      }));
  }
});

describe("la pasada de vencimientos de un hallazgo cargado", () => {
  it("sin escaneo, una actividad vencida no avisa ni se marca; con él, sí", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const acciones = datosDeCarga(b.procesoId, responsable.usuarioId).acciones;
      acciones[0].actividades[1] = { ...acciones[0].actividades[1], fin: "2026-11-10" };
      const { id } = await cargar(tx, b, responsable.usuarioId, { acciones });
      const [, vencida] = await actividadesDe(tx, id);
      const pasada = async () =>
        revisarVencimientosDeMejoramiento({ sql: tx, ahora: new Date(AHORA), config: await obtenerConfigDocumental({ sql: tx }) });
      const marcas = async () =>
        (await tx`SELECT aviso_vencido_en, escalado_en, recordatorio_en FROM mejora_actividades WHERE id = ${vencida.id}`)[0];

      expect(await pasada()).toEqual({ avisados: 0, escalados: 0 });
      expect(await marcas()).toEqual({ aviso_vencido_en: null, escalado_en: null, recordatorio_en: null });
      expect(await avisosA(tx, responsable.usuarioId)).toEqual([]);

      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect((await pasada()).avisados).toBeGreaterThan(0);
      expect((await marcas()).aviso_vencido_en).not.toBeNull();
      expect((await avisosA(tx, responsable.usuarioId)).map((a) => a.tipo)).toContain("mejora.actividad_vencida");
    }));
});

describe("antes del escaneo, nada llega a los responsables (ronda 1)", () => {
  it("el responsable declarado no ve el hallazgo ni abre su actividad; con el escaneo, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { id } = await cargar(tx, b, responsable.usuarioId);
      const [, abierta] = await actividadesDe(tx, id);
      const o = { sql: tx, ahora: new Date(AHORA) };
      const enLaLista = async () => (await listarHallazgos(responsable, {}, o)).filas.map((f) => f.id);
      expect(await enLaLista()).not.toContain(id);
      expect(await leerHallazgo(responsable, id, o)).toBeNull();
      expect(await leerActividad(responsable, Number(abierta.id), o)).toBeNull();
      expect(await contarMisActividades(responsable, o)).toBe(0);

      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await enLaLista()).toContain(id);
      expect((await leerHallazgo(responsable, id, o))?.ve).toBe("actividad");
      expect((await leerActividad(responsable, Number(abierta.id), o))?.puedeSeguir).toBe(true);
      // Las dos de su plan, también la que terminó en papel (como «Mis actividades»).
      expect(await contarMisActividades(responsable, o)).toBe(2);
    }));

  it("cada escritura de una actividad se rechaza con su mensaje, y la página no la ofrece", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const acciones = datosDeCarga(b.procesoId, responsable.usuarioId).acciones;
      // La abierta, vencida: escalarla también se rechaza por la carga, no por la fecha.
      acciones[0].actividades[1] = { ...acciones[0].actividades[1], fin: "2026-11-10", avance: 99 };
      const { id } = await cargar(tx, b, responsable.usuarioId, { acciones });
      const [, abierta] = await actividadesDe(tx, id);
      const actividadId = Number(abierta.id);
      const o = c(AHORA, tx);
      const falta = new ErrorMejora(FALTA_EL_ESCANEO);
      await expect(registrarSeguimiento(responsable, { actividadId, fecha: "2026-11-18", realizado: "Se capacitó a dos turnos", avance: 99 }, o)).rejects.toThrow(falta);
      await expect(terminarActividad(responsable, { actividadId }, o)).rejects.toThrow(falta);
      await expect(
        pedirAjuste(b.admin, { hallazgoId: id, tipo: "reprogramar", actividadId, finNuevo: "2026-12-30", causa: "El proveedor no entrega antes" }, o),
      ).rejects.toThrow(falta);
      await expect(escalarAGerencia(b.admin, { actividadId, nota: "Sigue sin capacitar al turno de noche" }, o)).rejects.toThrow(falta);
      // Un ajuste pendiente no puede nacer antes del escaneo; si lo hubiera, tampoco se decide.
      const [r] = await tx`SELECT id FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = 1`;
      const [aj] = await tx`INSERT INTO mejora_ajustes (hallazgo_id, ronda_id, tipo, actividad_id, datos, causa, pedido_por, pedido_en, estado, vence_en)
        VALUES (${id}, ${r.id}, 'reprogramar', ${actividadId}, ${tx.json({ finAntes: "2026-11-10", finNuevo: "2026-12-30" } as never)},
          'El proveedor no entrega antes', ${b.lider.usuarioId}, ${new Date(AHORA)}, 'pendiente', ${new Date(AHORA)})
        RETURNING id`;
      await expect(decidirAjuste(b.admin, { ajusteId: Number(aj.id), aprueba: true }, o)).rejects.toThrow(falta);

      // Lo que la página de la actividad ofrece al Admin SGC: ni ajustes ni «Vencida».
      const leida = await leerActividad(b.admin, actividadId, { sql: tx, ahora: new Date(AHORA) });
      expect(leida).toMatchObject({ puedePedirAjuste: false, puedeSeguir: false, vencida: false });
    }));

  it("reasignar y anular se permiten sin avisar a los responsables; el escaneo avisa a quien la tenga entonces", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const primero = await usuarioDePrueba(tx, { rol: "consulta" });
      const segundo = await usuarioDePrueba(tx, { rol: "consulta" });
      const o = c(AHORA, tx);
      const { id } = await cargar(tx, b, primero.usuarioId);
      const [, abierta] = await actividadesDe(tx, id);
      await reasignarActividad(b.admin, { actividadId: Number(abierta.id), responsableId: segundo.usuarioId, motivo: "Se cargó con el responsable equivocado" }, o);
      expect(await avisosA(tx, primero.usuarioId)).toEqual([]);
      expect(await avisosA(tx, segundo.usuarioId)).toEqual([]);
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await avisosA(tx, primero.usuarioId)).toEqual([]);
      expect((await avisosA(tx, segundo.usuarioId)).map((a) => [a.tipo, a.entidad_id])).toEqual([["mejora.actividad_asignada", Number(abierta.id)]]);

      // Una carga equivocada se anula antes del escaneo sin avisar a quienes nunca recibieron su actividad.
      const otra = await cargar(tx, b, primero.usuarioId);
      await anularHallazgo(b.admin, { hallazgoId: otra.id, justificacion: "Se cargó un hallazgo que no correspondía" }, o);
      expect((await tx`SELECT estado FROM mejora_hallazgos WHERE id = ${otra.id}`)[0].estado).toBe("anulado");
      expect(await avisosA(tx, primero.usuarioId)).toEqual([]);
    }));
});

describe("lo que pone la carga sin escaneo y lo que pone el escaneo (ronda 1)", () => {
  it("sin plazo ni «Con algo vencido» antes del escaneo; con él, sí", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const porVerificar = await cargar(tx, b, b.lider.usuarioId, { acciones: terminadas(b.lider.usuarioId) });
      expect((await tx`SELECT vence_en FROM mejora_hallazgos WHERE id = ${porVerificar.id}`)[0].vence_en).toBeNull();
      const acciones = datosDeCarga(b.procesoId, b.lider.usuarioId).acciones;
      acciones[0].actividades[1] = { ...acciones[0].actividades[1], fin: "2026-11-10" };
      const { id } = await cargar(tx, b, b.lider.usuarioId, { acciones });
      const o = { sql: tx, ahora: new Date(AHORA) };
      const marcas = async () => (await listarHallazgos(b.admin, {}, o)).filas.find((f) => f.id === id)?.marcas ?? [];
      expect(await marcas()).not.toContain("Con algo vencido");
      expect((await leerHallazgo(b.admin, id, o))?.marcas).not.toContain("Con algo vencido");
      expect((await listarHallazgos(b.admin, { soloVencidos: true }, o)).filas.map((f) => f.id)).not.toContain(id);
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await marcas()).toContain("Con algo vencido");
      expect((await leerHallazgo(b.admin, id, o))?.marcas).toContain("Con algo vencido");
    }));

  it("la pasada no ve un «Por verificar» sin escaneo; el escaneo, a su hora, le pone el plazo y desde ahí vence", () =>
    revertida(sql, async (tx) => {
      await silenciarTodo(tx);
      const b = await baseDeMejora(tx);
      // Cargado el 5 de octubre de 2026 y escaneado el 6, con las horas inyectadas.
      const { id, codigo } = await cargarHallazgo(
        b.admin,
        datosDeCarga(b.procesoId, b.lider.usuarioId, { acciones: terminadas(b.lider.usuarioId) }),
        c("2026-10-05T15:00:00Z", tx),
      );
      const pasada = async () =>
        revisarVencimientosDeMejoramiento({ sql: tx, ahora: new Date(AHORA), config: await obtenerConfigDocumental({ sql: tx }) });
      // La compuerta de la pasada, aunque el paso tuviera un plazo ya pasado (la carga no le pone ninguno).
      await tx`UPDATE mejora_hallazgos SET vence_en = '2026-10-01T05:00:00Z' WHERE id = ${id}`;
      expect(await pasada()).toEqual({ avisados: 0, escalados: 0 });
      expect((await tx`SELECT aviso_vencido_en FROM mejora_hallazgos WHERE id = ${id}`)[0].aviso_vencido_en).toBeNull();

      const escaneo = "2026-10-06T15:00:00Z";
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId, escaneo);
      const [evento] = await tx`SELECT ocurrio_en FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = 'carga_confirmada'`;
      expect((evento.ocurrio_en as Date).toISOString()).toBe(new Date(escaneo).toISOString());
      const ctx = await contextoDeMejora(tx, new Date(escaneo));
      const [h] = await tx`SELECT vence_en FROM mejora_hallazgos WHERE id = ${id}`;
      expect((h.vence_en as Date).getTime()).toBe(venceEn("verificar", new Date(escaneo), ctx).getTime());
      // Ya venció (el 18 de noviembre): avisa a quien verifica y lo marca.
      expect((await pasada()).avisados).toBeGreaterThan(0);
      expect((await tx`SELECT aviso_vencido_en FROM mejora_hallazgos WHERE id = ${id}`)[0].aviso_vencido_en).not.toBeNull();
      expect((await avisosA(tx, b.control.usuarioId)).filter((a) => a.entidad_id === id).map((a) => a.titulo)).toContain(
        `Venció el plazo para verificar la implementación de ${codigo}`,
      );
    }));

  it("el aviso del escaneo dice la actividad y su fin, y el cierre previsto sale de las fechas del plan", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { id } = await cargar(tx, b, responsable.usuarioId);
      const [r] = await tx`SELECT cierre_previsto FROM mejora_rondas WHERE hallazgo_id = ${id} AND numero = 1`;
      const esperado = cierrePrevisto(
        { clase: "no_conformidad", finPlaneado: "2026-12-15", fechaEvaluacion: null, periodicidad: null, plazoReporteDias: null },
        await contextoDeMejora(tx, new Date(AHORA)),
      );
      expect((r.cierre_previsto as Date).getTime()).toBe(esperado.getTime());
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      const [aviso] = await tx`SELECT cuerpo, enlace FROM notificaciones WHERE usuario_id = ${responsable.usuarioId} AND tipo = 'mejora.actividad_asignada'`;
      expect(aviso.cuerpo).toBe(`Capacitar a los turnos de noche. Fecha de fin: ${fechaLargaDeDia("2026-12-15")}.`);
    }));
});

describe("las fechas y el análisis de la carga (ronda 1)", () => {
  it("las fechas imposibles se rechazan con el nombre de la actividad", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const r = b.lider.usuarioId;
      const conActividad = (j: number, cambio: Partial<DatosDeCarga["acciones"][number]["actividades"][number]>) => {
        const acciones = datosDeCarga(b.procesoId, r).acciones;
        acciones[0].actividades[j] = { ...acciones[0].actividades[j], ...cambio };
        return { acciones };
      };
      await expect(cargar(tx, b, r, conActividad(0, { terminadaEn: "2025-11-04" }))).rejects.toThrow(
        new ErrorMejora("La actividad A1.1 no puede terminar antes de su inicio"),
      );
      await expect(cargar(tx, b, r, conActividad(1, { inicio: "2025-10-01" }))).rejects.toThrow(
        new ErrorMejora("La actividad A1.2 no puede iniciar antes de la detección del hallazgo"),
      );
      const correccion = (implementadaEn: string) => ({
        correccion: { requerida: true, descripcion: "Se diligenciaron los formatos pendientes con el turno", implementadaEn },
      });
      await expect(cargar(tx, b, r, correccion("2025-10-01"))).rejects.toThrow(new ErrorMejora("La fecha de la corrección no puede ser anterior a la de detección"));
      await expect(cargar(tx, b, r, correccion("2026-11-19"))).rejects.toThrow(new ErrorMejora("La fecha en que se implementó la corrección no puede ser futura"));
    }));

  it("sin análisis en una observación no queda una fila vacía; en la no conformidad, sí la hay", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const acciones: DatosDeCarga["acciones"] = [
        {
          tipo: "preventiva",
          descripcion: "Revisar los formatos de entrega de turno cada semana",
          causas: [],
          recursos: "Una hora del jefe de enfermería",
          indicadorCumplimiento: "Revisiones hechas / programadas",
          meta: "100 %",
          actividades: [{ descripcion: "Programar las revisiones semanales", responsableId: b.lider.usuarioId, inicio: "2025-11-05", fin: "2026-12-15", avance: 20 }],
        },
      ];
      const { id } = await cargar(tx, b, b.lider.usuarioId, {
        clase: "observacion",
        criticidad: null,
        analisis: { causas: [] },
        acciones,
        fechaEvaluacion: "2027-01-15",
      });
      expect(await tx`SELECT id FROM mejora_analisis WHERE hallazgo_id = ${id}`).toHaveLength(0);
      expect(await tx`SELECT id FROM mejora_eventos WHERE hallazgo_id = ${id} AND tipo = 'corregir'`).toHaveLength(0);
      const [accion] = await tx`SELECT recursos, indicador_cumplimiento, meta FROM mejora_acciones WHERE hallazgo_id = ${id}`;
      expect(accion).toEqual({ recursos: "Una hora del jefe de enfermería", indicador_cumplimiento: "Revisiones hechas / programadas", meta: "100 %" });
      const nc = await cargar(tx, b, b.lider.usuarioId);
      expect(await tx`SELECT metodo, contenido FROM mejora_analisis WHERE hallazgo_id = ${nc.id}`).toEqual([{ metodo: "cinco_porques", contenido: null }]);
    }));
});
