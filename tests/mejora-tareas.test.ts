/**
 * Las tareas de mejoramiento (spec 15 §14.1, Tarea 19): una por fila de la tabla, con su identificador, su título, su `vence` y
 * el módulo «planes»; quien tiene el turno la recibe (la misma regla que `quienTieneElTurno`) y otra persona del mismo rol, sin
 * la condición, no. También el proceso sin líder, el responsable inactivo, la eficacia desde su fecha mínima, la tolerancia de
 * «Mis tareas» y la respuesta al ente. Contra la BD de trabajo, dentro de una transacción que se revierte: la base trae hallazgos
 * de las comprobaciones en el navegador, así que cada prueba busca las tareas de sus propios hallazgos por su id.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

// Real salvo en el caso de la tolerancia, que la hace fallar una vez.
vi.mock("@/db/consultas/mejoramiento/tareas", async (original) => {
  const real = await original<typeof import("@/db/consultas/mejoramiento/tareas")>();
  return { ...real, tareasDeMejoramiento: vi.fn(real.tareasDeMejoramiento) };
});

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { pedirAjuste } from "@/db/consultas/mejoramiento/ajustes";
import { aprobarPlan, enviarPlan, firmarRevision } from "@/db/consultas/mejoramiento/aprobacion";
import { quitarArchivoDeMejora } from "@/db/consultas/mejoramiento/archivos";
import { quienTieneElTurno } from "@/db/consultas/mejoramiento/avisos";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { ponerEnPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import { leerHallazgo, listarHallazgos } from "@/db/consultas/mejoramiento/lectura";
import { resolverConOcurrencia, resolverNoRequiere } from "@/db/consultas/mejoramiento/marcas";
import { decidirAccionCorrectiva, rechazarHallazgo, registrarCorreccion, sostenerHallazgo } from "@/db/consultas/mejoramiento/recorrido";
import { anularHallazgo, registrarHallazgo, registrarRespuestaAlEnte } from "@/db/consultas/mejoramiento/registro";
import { enviarReporte } from "@/db/consultas/mejoramiento/reportes";
import { registrarRespuestaDelPlan } from "@/db/consultas/mejoramiento/respuesta-plan";
import { tareasConSuHallazgo, tareasDeMejoramiento } from "@/db/consultas/mejoramiento/tareas";
import { datosDeEvaluacion, evaluarEficacia, fechaMinimaDe, huellaDeLoVisto, verificarImplementacion } from "@/db/consultas/mejoramiento/verificacion";
import { venceLaEvaluacion } from "@/lib/mejoramiento/eficacia";
import { RUTA_REPORTES_RECIBIDOS } from "@/lib/mejoramiento/reportes";
import { RUTA_PLANES, rutaDeActividad, rutaDeFormular, rutaDeHallazgo, rutaDePlan } from "@/lib/mejoramiento/rutas";
import type { HallazgoBase } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { agruparTareas, misTareas, type Tarea } from "@/lib/tareas";
import { finDeFecha } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import {
  archivoDelPlan,
  baseDeMejora,
  c,
  datosDeCarga,
  datosDeHallazgo,
  escaneoDeLaCarga,
  evidenciaDeActividad,
  evidenciaDelHallazgo,
  HORA_DE_ESCENA,
  hallazgoEn,
  medicionMarcada,
  otroProcesoConLider,
  planDeMejoraDePrueba,
  planDePrueba,
  terminarTodas,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá: el día siguiente a `HORA_DE_ESCENA`.
const AHORA = "2026-11-18T15:00:00Z";
const TITULO = "Formatos de entrega de turno sin diligenciar";
const zona = zonaHoraria();

async function tareasDe(s: SesionFlujo, tx: TransactionSql, ahora = AHORA): Promise<Tarea[]> {
  return (await tareasDeMejoramiento(s, { sql: tx, ahora: new Date(ahora) })).tareas;
}

const laDe = async (s: SesionFlujo, tx: TransactionSql, id: string, ahora = AHORA) => (await tareasDe(s, tx, ahora)).find((t) => t.id === id);

const venceDe = async (tx: TransactionSql, id: number) => ((await tx`SELECT vence_en FROM mejora_hallazgos WHERE id = ${id}`)[0].vence_en as Date);

/** La tarea de un paso del hallazgo, tal como la recibe quien tiene el turno. */
async function deHallazgo(tx: TransactionSql, h: HallazgoBase, paso: string, titulo: string, enlace = rutaDeHallazgo(h.id)): Promise<Tarea> {
  return { id: `mej-${paso}:${h.id}`, modulo: "planes", titulo, detalle: TITULO, vence: await venceDe(tx, h.id), enlace };
}

/** La tarea la recibe `quien`, que está en el turno, y no `otro`, que no lo está (la misma regla de los avisos). */
async function soloDe(tx: TransactionSql, h: HallazgoBase, esperada: Tarea, quien: SesionFlujo, otro: SesionFlujo, ahora = AHORA) {
  expect(await laDe(quien, tx, esperada.id, ahora)).toEqual(esperada);
  expect(await laDe(otro, tx, esperada.id, ahora)).toBeUndefined();
  const turno = await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id));
  expect(turno).toContain(quien.usuarioId);
  expect(turno).not.toContain(otro.usuarioId);
}

/** Un proceso sin líder: lo que le toca al líder lo hace el Admin SGC (spec §6.1, F15-DC3). */
const sinLider = (tx: TransactionSql) => procesoNuevo(tx);

/** Un hallazgo externo de un ente de control, con su fecha límite de respuesta, llevado hasta `estado`. */
const externo = (tx: TransactionSql, b: BaseDeMejora, estado: "en_aprobacion" | "en_ejecucion") =>
  hallazgoEn(tx, b, estado, { origen: "ente_control", fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte: "2026-12-30" });

describe("las tareas de mejoramiento, una por fila de la tabla", () => {
  it("mej-clasificar: el Admin SGC clasifica cada reporte recibido; Control Interno no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await enviarReporte(
        b.consulta,
        { descripcion: "Vi la nevera de vacunas abierta durante el cambio de turno", vistoEn: "2026-11-16" },
        c(HORA_DE_ESCENA, tx),
      );
      const [r] = await tx`SELECT vence_en FROM mejora_reportes WHERE id = ${id}`;
      expect(await laDe(b.admin, tx, `mej-clasificar:${id}`)).toEqual({
        id: `mej-clasificar:${id}`,
        modulo: "planes",
        titulo: "Clasificar un reporte de mejoramiento",
        detalle: `Reporte n.º ${id}`,
        vence: r.vence_en,
        enlace: RUTA_REPORTES_RECIBIDOS,
      });
      expect(await laDe(b.control, tx, `mej-clasificar:${id}`)).toBeUndefined();
    }));

  it("mej-aceptar: los líderes del proceso; el líder de otro proceso no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_aceptar");
      await soloDe(tx, h, await deHallazgo(tx, h, "aceptar", `Aceptar o rechazar ${h.codigo}`), b.lider, otro.lider);
    }));

  it("mej-rechazo: quien lo registró; otra persona de Control Interno no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await usuarioDePrueba(tx, { rol: "control_interno" });
      const h = await hallazgoEn(tx, b, "rechazo");
      await soloDe(tx, h, await deHallazgo(tx, h, "rechazo", `Decidir sobre el rechazo de ${h.codigo}`), b.control, otro);
    }));

  it("mej-arbitrar: el Admin SGC si no lo registró ni lo sostuvo un Admin SGC; si sí, Gerencia y no ese Admin SGC", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "arbitraje");
      await soloDe(tx, h, await deHallazgo(tx, h, "arbitrar", `Arbitrar el rechazo de ${h.codigo}`), b.admin, b.gerencia);

      const o = c(HORA_DE_ESCENA, tx);
      const { id } = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId), o);
      await rechazarHallazgo(b.lider, { hallazgoId: id, justificacion: "El hecho no corresponde a este proceso" }, o);
      await sostenerHallazgo(b.admin, { hallazgoId: id, replica: "La evidencia muestra que sí corresponde al proceso" }, o);
      const delAdmin = await bloquearHallazgo(tx, id);
      await soloDe(tx, delAdmin, await deHallazgo(tx, delAdmin, "arbitrar", `Arbitrar el rechazo de ${delAdmin.codigo}`), b.gerencia, b.admin);
    }));

  it("mej-corregir: los líderes del proceso; el líder de otro proceso no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const h = await hallazgoEn(tx, b, "por_corregir");
      await soloDe(tx, h, await deHallazgo(tx, h, "corregir", `Registrar la corrección de ${h.codigo}`), b.lider, otro.lider);
    }));

  it("mej-decidir: el Admin SGC; Control Interno no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_decidir");
      await soloDe(tx, h, await deHallazgo(tx, h, "decidir", `Decidir si ${h.codigo} requiere acción correctiva`), b.admin, b.control);
    }));

  it("mej-validar: quien puede validarla, no el Admin SGC que registró la corrección; sin corrección, «el cierre sin acción»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_validar", { procesoId: await sinLider(tx) });
      await soloDe(tx, h, await deHallazgo(tx, h, "validar", `Validar la corrección de ${h.codigo}`), b.control, b.admin);

      const o = c(HORA_DE_ESCENA, tx);
      const sin = await hallazgoEn(tx, b, "por_corregir");
      await registrarCorreccion(
        b.lider,
        { hallazgoId: sin.id, requerida: false, descripcion: "El formato se diligencia en el siguiente turno, no hace falta más" },
        o,
      );
      await decidirAccionCorrectiva(b.admin, { hallazgoId: sin.id, requiere: false, justificacion: "Fue un hecho aislado del turno" }, o);
      const porValidar = await bloquearHallazgo(tx, sin.id);
      expect(porValidar.estado).toBe("por_validar");
      // Quien decidió el «no» tampoco valida el cierre sin acción.
      await soloDe(tx, porValidar, await deHallazgo(tx, porValidar, "validar", `Validar el cierre sin acción de ${sin.codigo}`), b.control, b.admin);
    }));

  it("mej-formular: los líderes del proceso, a la página de formular; el Admin SGC no, si el proceso tiene líder", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular");
      const esperada = await deHallazgo(tx, h, "formular", `Formular la causa raíz y el plan de ${h.codigo}`, rutaDeFormular(h.id));
      await soloDe(tx, h, esperada, b.lider, b.admin);
    }));

  it("el proceso sin líder: la tarea mej-formular es de los Admin SGC", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_formular", { procesoId: await sinLider(tx) });
      const esperada = await deHallazgo(tx, h, "formular", `Formular la causa raíz y el plan de ${h.codigo}`, rutaDeFormular(h.id));
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      expect(await laDe(b.admin, tx, esperada.id)).toEqual(esperada);
      expect(await laDe(otroAdmin, tx, esperada.id)).toEqual(esperada);
      expect(await laDe(b.lider, tx, esperada.id)).toBeUndefined();
    }));

  it("mej-revisar: un Admin SGC que no lo elaboró; sin otro que lo revise, quien lo elaboró recibe «Devolver el plan»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      // Sin líder, lo elabora el Admin SGC de la base.
      const h = await hallazgoEn(tx, b, "en_revision", { procesoId: await sinLider(tx) });
      await soloDe(tx, h, await deHallazgo(tx, h, "revisar", `Revisar el plan de ${h.codigo}`), otroAdmin, b.admin);

      await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND activo AND id <> ${b.admin.usuarioId}`;
      expect(await laDe(b.admin, tx, `mej-revisar:${h.id}`)).toEqual(await deHallazgo(tx, h, "revisar", `Devolver el plan de ${h.codigo}`));
    }));

  it("mej-aprobar: Gerencia; el Admin SGC no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_aprobacion");
      await soloDe(tx, h, await deHallazgo(tx, h, "aprobar", `Aprobar el plan de ${h.codigo}`), b.gerencia, b.admin);
    }));

  it("mej-actividad: su responsable, con la descripción y el código del hallazgo; devuelta, vence en su fecha para corregir", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id}`;
      const actividadId = Number(a.id);
      const esperada: Tarea = {
        id: `mej-actividad:${actividadId}`,
        modulo: "planes",
        titulo: "Actividad 1 del plan de prueba",
        detalle: h.codigo,
        vence: finDeFecha("2026-12-15", zona),
        enlace: rutaDeActividad(actividadId),
      };
      expect(await laDe(responsable, tx, esperada.id)).toEqual(esperada);
      expect(await laDe(otro, tx, esperada.id)).toBeUndefined();
      expect(await quienTieneElTurno(tx, await bloquearHallazgo(tx, h.id))).toEqual([responsable.usuarioId]);

      // Terminada no es tarea; devuelta por la verificación, vuelve con la fecha para corregir.
      await terminarTodas(tx, b, h.id, HORA_DE_ESCENA);
      expect(await laDe(responsable, tx, esperada.id)).toBeUndefined();
      await verificarImplementacion(
        b.control,
        {
          hallazgoId: h.id,
          actividades: [{ id: actividadId, conforme: false, nota: "Falta la firma del jefe de enfermería", corregirAntesDe: "2026-11-27" }],
          metodos: ["evidencias"],
        },
        c(AHORA, tx),
      );
      expect(await laDe(responsable, tx, esperada.id)).toEqual({ ...esperada, vence: finDeFecha("2026-11-27", zona) });
    }));

  it("el responsable inactivo: su actividad es tarea de los líderes del proceso, «Reasignar: …»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id}`;
      expect(await laDe(b.lider, tx, `mej-actividad:${a.id}`)).toBeUndefined();
      await tx`UPDATE usuarios SET activo = false WHERE id = ${responsable.usuarioId}`;
      expect(await laDe(b.lider, tx, `mej-actividad:${a.id}`)).toEqual({
        id: `mej-actividad:${a.id}`,
        modulo: "planes",
        titulo: "Reasignar: Actividad 1 del plan de prueba",
        detalle: h.codigo,
        vence: finDeFecha("2026-12-15", zona),
        enlace: rutaDeHallazgo(h.id),
      });
      expect(await laDe(otro.lider, tx, `mej-actividad:${a.id}`)).toBeUndefined();
      // El proceso tiene líder: no es del Admin SGC.
      expect(await laDe(b.admin, tx, `mej-actividad:${a.id}`)).toBeUndefined();
    }));

  it("mej-ajuste: quien lo decide; el Admin SGC que lo pidió no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id}`;
      const { id } = await pedirAjuste(
        b.admin,
        { hallazgoId: h.id, tipo: "reprogramar", actividadId: Number(a.id), finNuevo: "2026-12-30", causa: "El proveedor no entrega antes" },
        c(AHORA, tx),
      );
      const [aj] = await tx`SELECT vence_en FROM mejora_ajustes WHERE id = ${id}`;
      const esperada: Tarea = {
        id: `mej-ajuste:${id}`,
        modulo: "planes",
        titulo: `Decidir un ajuste de ${h.codigo}`,
        detalle: TITULO,
        vence: aj.vence_en,
        enlace: rutaDeHallazgo(h.id),
      };
      expect(await laDe(otroAdmin, tx, esperada.id)).toEqual(esperada);
      expect(await laDe(b.admin, tx, esperada.id)).toBeUndefined();
      expect(await laDe(b.gerencia, tx, esperada.id)).toBeUndefined();
    }));

  it("mej-verificar: quien puede verificar; el Admin SGC que registró la corrección no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_verificar", { procesoId: await sinLider(tx) });
      await soloDe(tx, h, await deHallazgo(tx, h, "verificar", `Verificar la implementación de ${h.codigo}`), b.control, b.admin);
    }));

  it("mej-evaluar no existe antes de la fecha mínima y sí desde ella, de quien puede verificar", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_espera", { procesoId: await sinLider(tx) });
      const fm = await fechaMinimaDe(tx, h.id, zona);
      expect(fm?.minima).toBe("2027-01-17");
      const id = `mej-evaluar:${h.id}`;
      expect(await laDe(b.control, tx, id, "2027-01-17T04:59:59Z")).toBeUndefined();
      const desde = "2027-01-17T05:00:00Z";
      const ctx = await contextoDeMejora(tx, new Date(desde));
      expect(await laDe(b.control, tx, id, desde)).toEqual({
        id,
        modulo: "planes",
        titulo: `Evaluar la eficacia de ${h.codigo}`,
        detalle: TITULO,
        vence: venceLaEvaluacion("2027-01-17", null, ctx),
        enlace: rutaDeHallazgo(h.id),
      });
      // Registró la corrección: ejecutó, no verifica.
      expect(await laDe(b.admin, tx, id, desde)).toBeUndefined();
    }));

  it("mej-cerrar: el Admin SGC; Control Interno no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_cerrar");
      await soloDe(tx, h, await deHallazgo(tx, h, "cerrar", `Cerrar ${h.codigo}`), b.admin, b.control);
    }));

  it("mej-ente: el Admin SGC, con el plan aprobado y sin respuesta, hasta el fin de la fecha del ente; Control Interno no", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const antes = await externo(tx, b, "en_aprobacion");
      expect(await laDe(b.admin, tx, `mej-ente:${antes.id}`)).toBeUndefined();
      await aprobarPlan(b.gerencia, { hallazgoId: antes.id, credenciales: { clave: "ok" } }, c(HORA_DE_ESCENA, tx));
      const esperada: Tarea = {
        id: `mej-ente:${antes.id}`,
        modulo: "planes",
        titulo: `Registrar la respuesta al ente de ${antes.codigo}`,
        detalle: TITULO,
        vence: finDeFecha("2026-12-30", zona),
        enlace: rutaDeHallazgo(antes.id),
      };
      expect(await laDe(b.admin, tx, esperada.id)).toEqual(esperada);
      expect(await laDe(b.control, tx, esperada.id)).toBeUndefined();
      const oficioId = await evidenciaDelHallazgo(tx, antes.id, b.admin.usuarioId);
      await registrarRespuestaAlEnte(b.admin, { hallazgoId: antes.id, enviadaEn: "2026-11-18", oficioId }, c(AHORA, tx));
      expect(await laDe(b.admin, tx, esperada.id)).toBeUndefined();
    }));

  it("un hallazgo cargado sin su escaneo no da tareas de actividad", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, b.lider.usuarioId), c(AHORA, tx));
      const [abierta] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${id} AND estado <> 'terminada' ORDER BY id`;
      const tareaId = `mej-actividad:${Number(abierta.id)}`;
      expect(await laDe(b.lider, tx, tareaId)).toBeUndefined();
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await laDe(b.lider, tx, tareaId)).toMatchObject({ titulo: "Capacitar a los turnos de noche", enlace: rutaDeActividad(Number(abierta.id)) });
    }));
});

describe("la carga sin su formato firmado se le pide al Admin SGC (revisión final, I2)", () => {
  it("mej-escaneo: la reciben los Admin SGC, sin fecha, hasta el escaneo; ni el líder ni el responsable ni Control Interno", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otroAdmin = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const { id, codigo } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, responsable.usuarioId), c(AHORA, tx));
      const esperada: Tarea = {
        id: `mej-escaneo:${id}`,
        modulo: "planes",
        titulo: `Adjuntar el formato firmado de ${codigo}`,
        detalle: TITULO,
        vence: null,
        enlace: rutaDeHallazgo(id),
      };
      expect(await laDe(b.admin, tx, esperada.id)).toEqual(esperada);
      expect(await laDe(otroAdmin, tx, esperada.id)).toEqual(esperada);
      for (const otro of [b.lider, responsable, b.control, b.gerencia]) expect(await laDe(otro, tx, esperada.id)).toBeUndefined();
      // Cuenta para «Esperan su decisión»: es de su hallazgo.
      const suyas = await tareasConSuHallazgo(b.admin, { sql: tx, ahora: new Date(AHORA) });
      expect(suyas.find((t) => t.tarea.id === esperada.id)?.hallazgoId).toBe(id);
      // En la lista, el turno es del Administrador del SGC, no de los responsables.
      const turno = async () => (await listarHallazgos(b.admin, {}, { sql: tx, ahora: new Date(AHORA) })).filas.find((f) => f.id === id)?.turno;
      expect(await turno()).toBe("El Administrador del SGC: falta el formato firmado");
      await escaneoDeLaCarga(tx, id, b.admin.usuarioId);
      expect(await laDe(b.admin, tx, esperada.id)).toBeUndefined();
      expect(await turno()).toBe("Los responsables de las actividades");
    }));

  it("un hallazgo cargado y anulado sin su formato no la da", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { id } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, b.lider.usuarioId), c(AHORA, tx));
      await anularHallazgo(b.admin, { hallazgoId: id, justificacion: "Se cargó por error: el hallazgo ya existía" }, c(AHORA, tx));
      expect(await laDe(b.admin, tx, `mej-escaneo:${id}`)).toBeUndefined();
    }));
});

describe("«Mis tareas» y «Esperan su decisión»", () => {
  it("misTareas las trae junto a las demás, en el módulo «planes»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_corregir");
      const { tareas } = await misTareas(b.lider, { sql: tx, ahora: new Date(AHORA) });
      expect(tareas.find((t) => t.id === `mej-corregir:${h.id}`)).toMatchObject({ modulo: "planes", titulo: `Registrar la corrección de ${h.codigo}` });
    }));

  it("si tareasDeMejoramiento lanza, misTareas lo registra y devuelve las demás", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      await hallazgoEn(tx, b, "por_decidir");
      const o = { sql: tx, ahora: new Date(AHORA) };
      const con = await misTareas(b.admin, o);
      expect(con.tareas.some((t) => t.modulo === "planes")).toBe(true);
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        vi.mocked(tareasDeMejoramiento).mockRejectedValueOnce(new Error("sin conexión"));
        const sin = await misTareas(b.admin, o);
        expect(sin.tareas.map((t) => t.id)).toEqual(con.tareas.filter((t) => t.modulo !== "planes").map((t) => t.id));
        expect(error).toHaveBeenCalledWith(expect.stringContaining("mejoramiento"), expect.any(Error));
      } finally {
        error.mockRestore();
      }
    }));

  it("esperanSuDecision cuenta los hallazgos distintos entre sus tareas de mejoramiento (R2)", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const corregir = await hallazgoEn(tx, b, "por_corregir");
      // Dos actividades del mismo hallazgo, de la misma persona: un solo hallazgo.
      const ejecucion = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: b.lider.usuarioId, actividades: 2 });
      const ajeno = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const o = { sql: tx, ahora: new Date(AHORA) };
      const suyas = await tareasConSuHallazgo(b.lider, o);
      const delProceso = new Set(suyas.flatMap((t) => (t.hallazgoId !== null && [corregir.id, ejecucion.id, ajeno.id].includes(t.hallazgoId) ? [t.hallazgoId] : [])));
      expect([...delProceso].sort((x, y) => x - y)).toEqual([corregir.id, ejecucion.id].sort((x, y) => x - y));
      const lista = await listarHallazgos(b.lider, { procesoId: b.procesoId, esperanSuDecision: true }, o);
      expect(lista.filas.map((f) => f.id).sort((x, y) => x - y)).toEqual([corregir.id, ejecucion.id].sort((x, y) => x - y));
      const todos = await listarHallazgos(b.lider, {}, o);
      expect(todos.cifras.esperanSuDecision).toBe(new Set(suyas.flatMap((t) => (t.hallazgoId === null ? [] : [t.hallazgoId]))).size);
    }));
});

/**
 * De un hallazgo «En ejecución» en su ronda 1, la ronda 2 con el plan aprobado (el 14 de diciembre): sus actividades terminan,
 * Control Interno verifica, evalúa «no eficaz», la líder formula y envía, el Admin SGC revisa y Gerencia aprueba.
 */
async function aRondaDos(tx: TransactionSql, b: BaseDeMejora, id: number): Promise<void> {
  await terminarTodas(tx, b, id, "2026-12-05T15:00:00Z");
  const conformes = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${id} AND estado = 'terminada' ORDER BY id`).map((f) => ({
    id: Number(f.id),
    conforme: true,
  }));
  await verificarImplementacion(b.control, { hallazgoId: id, actividades: conformes, metodos: ["evidencias"] }, c("2026-12-07T15:00:00Z", tx));
  const evalua = c("2026-12-10T15:00:00Z", tx);
  await evaluarEficacia(
    b.control,
    {
      hallazgoId: id,
      resultado: "no_eficaz",
      criterios: ["no_recurrencia"],
      desde: "2026-12-05",
      hasta: "2026-12-10",
      justificacion: "El hecho se repitió en el turno de noche del 9 de diciembre",
      vistoHuella: huellaDeLoVisto(await datosDeEvaluacion(b.control, id, evalua)),
      credenciales: { clave: "ok" },
    },
    evalua,
  );
  await planDePrueba(tx, b, id, { fin: "2027-03-31" });
  const o = c("2026-12-11T15:00:00Z", tx);
  await enviarPlan(b.lider, { hallazgoId: id, credenciales: { clave: "ok" } }, o);
  await firmarRevision(b.admin, { hallazgoId: id, requiereRecursos: false, notaRecursos: null, credenciales: { clave: "ok" } }, o);
  await aprobarPlan(b.gerencia, { hallazgoId: id, credenciales: { clave: "ok" } }, c("2026-12-14T15:00:00Z", tx));
  expect(await bloquearHallazgo(tx, id)).toMatchObject({ estado: "en_ejecucion", ronda: 2 });
}

describe("la respuesta al ente", () => {
  // El día en que `hallazgoEn` aprueba el plan: el primero en que se pudo enviar la respuesta.
  const ENVIADA = "2026-11-17";
  const NO_ES_CANDIDATO = "Elija el oficio entre los archivos del hallazgo subidos después de aprobar el plan";

  it("el oficio es uno de los archivos subidos después de aprobar el plan, elegido; la fecha, entre la aprobación y hoy", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await externo(tx, b, "en_aprobacion");
      // Subido antes de aprobar el plan: no es el oficio de la respuesta.
      const antes = await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      await aprobarPlan(b.gerencia, { hallazgoId: h.id, credenciales: { clave: "ok" } }, c(HORA_DE_ESCENA, tx));
      const o = c(AHORA, tx);
      const registrar = (oficioId: number, enviadaEn = ENVIADA) => registrarRespuestaAlEnte(b.admin, { hallazgoId: h.id, enviadaEn, oficioId }, o);
      await expect(registrar(antes)).rejects.toThrow("Adjunte el oficio de respuesta");

      const oficio = await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      const otro = await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      const [a] = await tx`SELECT id, responsable_id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id LIMIT 1`;
      const deUnaActividad = await evidenciaDeActividad(tx, Number(a.id), Number(a.responsable_id));
      const ajeno = await externo(tx, b, "en_ejecucion");
      const deOtroHallazgo = await evidenciaDelHallazgo(tx, ajeno.id, b.admin.usuarioId);
      for (const noEs of [antes, deUnaActividad, deOtroHallazgo]) await expect(registrar(noEs)).rejects.toThrow(NO_ES_CANDIDATO);
      await expect(registrar(oficio, "2026-11-19")).rejects.toThrow("La fecha de envío no puede ser futura");
      await expect(registrar(oficio, "2026-11-16")).rejects.toThrow(
        "La fecha de envío no puede ser anterior a la aprobación del plan, el 17 de noviembre de 2026",
      );
      await registrar(oficio);

      const [f] = await tx`SELECT to_char(respuesta_ente_en, 'YYYY-MM-DD') AS en, respuesta_ente_por FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(f).toEqual({ en: ENVIADA, respuesta_ente_por: b.admin.usuarioId });
      const [e] = await tx`SELECT detalle, usuario_id, ocurrio_en FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'respuesta_ente'`;
      expect(e).toEqual({ detalle: { enviadaEn: ENVIADA, oficioId: oficio }, usuario_id: b.admin.usuarioId, ocurrio_en: new Date(AHORA) });
      const [bit] = await tx`SELECT detalle FROM auditoria
        WHERE accion = 'mejora_respuesta_ente' AND entidad = 'mejora_hallazgo' AND entidad_id = ${h.id}`;
      expect(bit.detalle).toEqual({ codigo: h.codigo, enviadaEn: ENVIADA, oficioId: oficio });

      // La página lee la respuesta y el oficio del evento (lo congelado del detalle no se lleva `oficioId`).
      const leido = await leerHallazgo(b.admin, h.id, { sql: tx, ahora: new Date(AHORA) });
      expect(leido?.respuestaAlEnte).toEqual({ enviadaEn: ENVIADA, por: b.admin.nombre });
      expect(leido?.eventos.find((x) => x.tipo === "respuesta_ente")?.detalle).toEqual({ enviadaEn: ENVIADA, oficioId: oficio });

      await expect(registrar(otro)).rejects.toThrow("Ya se registró la respuesta al ente");
      // Solo el oficio elegido queda sin poderse quitar; el otro archivo sigue su regla.
      await expect(quitarArchivoDeMejora(b.admin, oficio, { sql: tx })).rejects.toThrow("El oficio de la respuesta al ente ya se registró: no se quita");
      await quitarArchivoDeMejora(b.admin, otro, { sql: tx });
      expect(await tx`SELECT id FROM archivos WHERE id = ${otro}`).toHaveLength(0);
    }));

  it("en la ronda 2, el oficio es de después de aprobar su plan y la fecha, de ese día en adelante", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await externo(tx, b, "en_ejecucion");
      const deLaRonda1 = await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      await aRondaDos(tx, b, h.id);
      const o = c("2026-12-16T15:00:00Z", tx);
      const registrar = (oficioId: number, enviadaEn: string) => registrarRespuestaAlEnte(b.admin, { hallazgoId: h.id, enviadaEn, oficioId }, o);
      await expect(registrar(deLaRonda1, "2026-12-15")).rejects.toThrow("Adjunte el oficio de respuesta");
      const deLaRonda2 = await evidenciaDelHallazgo(tx, h.id, b.admin.usuarioId);
      await expect(registrar(deLaRonda1, "2026-12-15")).rejects.toThrow(NO_ES_CANDIDATO);
      await expect(registrar(deLaRonda2, "2026-12-13")).rejects.toThrow(
        "La fecha de envío no puede ser anterior a la aprobación del plan, el 14 de diciembre de 2026",
      );
      await registrar(deLaRonda2, "2026-12-14");
      const [e] = await tx`SELECT detalle, ronda FROM mejora_eventos WHERE hallazgo_id = ${h.id} AND tipo = 'respuesta_ente'`;
      expect(e).toEqual({ detalle: { enviadaEn: "2026-12-14", oficioId: deLaRonda2 }, ronda: 2 });
    }));

  it("solo el Admin SGC, solo en un hallazgo externo y solo con el plan aprobado", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(AHORA, tx);
      const enAprobacion = await externo(tx, b, "en_aprobacion");
      const oficioId = await evidenciaDelHallazgo(tx, enAprobacion.id, b.admin.usuarioId);
      await expect(registrarRespuestaAlEnte(b.admin, { hallazgoId: enAprobacion.id, enviadaEn: ENVIADA, oficioId }, o)).rejects.toThrow(
        "El plan todavía no está aprobado",
      );
      await expect(registrarRespuestaAlEnte(b.control, { hallazgoId: enAprobacion.id, enviadaEn: ENVIADA, oficioId }, o)).rejects.toThrow(
        ErrorPermiso,
      );
      const interno = await hallazgoEn(tx, b, "en_ejecucion");
      const delInterno = await evidenciaDelHallazgo(tx, interno.id, b.admin.usuarioId);
      await expect(registrarRespuestaAlEnte(b.admin, { hallazgoId: interno.id, enviadaEn: ENVIADA, oficioId: delInterno }, o)).rejects.toThrow(
        "Solo un hallazgo de origen externo lleva respuesta al ente",
      );
    }));
});

describe("la respuesta al ente desde el plan (Fase 15B, anexo §3.8)", () => {
  it("mej-ente-plan: una por plan, del Admin SGC, que vence en la menor fecha del ente de los listos; sus hallazgos no dan mej-ente", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(AHORA, tx);
      const plan = await planDeMejoraDePrueba(
        tx,
        b.control,
        { nombre: "Visita de la Superintendencia Nacional de Salud", origen: "ente_control", fechaLimiteEnte: "2026-12-30" },
        AHORA,
      );
      const ente = (fechaLimiteEnte: string) => ({ origen: "ente_control" as const, fuente: "Superintendencia Nacional de Salud", fechaLimiteEnte });
      const h1 = await hallazgoEn(tx, b, "en_ejecucion", ente("2026-12-30"));
      const h2 = await hallazgoEn(tx, b, "en_ejecucion", ente("2026-12-20"));
      // Sin el plan de acción aprobado todavía no está listo: no adelanta el vencimiento de la tarea.
      const h3 = await hallazgoEn(tx, b, "en_aprobacion", ente("2026-12-10"));
      const suelto = await externo(tx, b, "en_ejecucion");
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h1.id, h2.id, h3.id] }, o);

      const esperada: Tarea = {
        id: `mej-ente-plan:${plan.id}`,
        modulo: "planes",
        titulo: `Registrar la respuesta al ente del plan ${plan.codigo}`,
        detalle: "Visita de la Superintendencia Nacional de Salud",
        vence: finDeFecha("2026-12-20", zona),
        enlace: `${rutaDePlan(plan.id)}#respuesta-al-ente`,
      };
      const delAdmin = await tareasDe(b.admin, tx);
      expect(delAdmin.filter((t) => t.id === esperada.id)).toEqual([esperada]);
      for (const h of [h1, h2, h3]) expect(delAdmin.find((t) => t.id === `mej-ente:${h.id}`)).toBeUndefined();
      // Un hallazgo externo suelto sigue dando la suya.
      expect(delAdmin.find((t) => t.id === `mej-ente:${suelto.id}`)).toMatchObject({ titulo: `Registrar la respuesta al ente de ${suelto.codigo}` });
      // La tarea es del plan, no de un hallazgo: no cuenta en «Esperan su decisión».
      const conSuHallazgo = await tareasConSuHallazgo(b.admin, { sql: tx, ahora: new Date(AHORA) });
      expect(conSuHallazgo.find((t) => t.tarea.id === esperada.id)?.hallazgoId).toBeNull();
      for (const otro of [b.control, b.gerencia, b.lider]) expect(await laDe(otro, tx, esperada.id)).toBeUndefined();

      // Respondidos los dos listos, la tarea desaparece (H3 todavía no está listo).
      const oficioId = await archivoDelPlan(tx, plan.id, b.admin.usuarioId);
      await registrarRespuestaDelPlan(b.admin, { planId: plan.id, enviadaEn: "2026-11-18", oficioId, vistos: [h1.id, h2.id] }, o);
      expect(await laDe(b.admin, tx, esperada.id)).toBeUndefined();
      // Cuando H3 está listo vuelve, con su fecha.
      await aprobarPlan(b.gerencia, { hallazgoId: h3.id, credenciales: { clave: "ok" } }, o);
      expect(await laDe(b.admin, tx, esperada.id)).toEqual({ ...esperada, vence: finDeFecha("2026-12-10", zona) });
    }));

  it("un plan cuyos listos no tienen fecha del ente no da la tarea, y su hallazgo tampoco da la suya", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const plan = await planDeMejoraDePrueba(tx, b.control, { origen: "auditoria_externa" }, AHORA);
      const h = await hallazgoEn(tx, b, "en_ejecucion", { origen: "auditoria_externa", fuente: "Auditoría externa de la EPS" });
      await ponerEnPlan(b.control, { planId: plan.id, hallazgoIds: [h.id] }, c(AHORA, tx));
      expect(await laDe(b.admin, tx, `mej-ente-plan:${plan.id}`)).toBeUndefined();
      expect(await laDe(b.admin, tx, `mej-ente:${h.id}`)).toBeUndefined();
    }));
});

describe("la marca «Requiere acción de mejora» de un indicador (Fase 15B, anexo §6.5)", () => {
  // Octubre de 2026, reportada y analizada el 3 de noviembre: ya es un pendiente; sin análisis, lo es desde su fecha límite.
  const REPORTA = "2026-11-03T15:00:00Z";
  const ANTES = "2026-11-05T15:00:00Z";

  it("mej-marca: una por pendiente, del Admin SGC, con su título, sin fecha, a la sección de las marcas; ni el líder ni Control Interno", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mm = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const espera = await medicionMarcada(tx, { ahora: REPORTA, procesoId: b.procesoId });
      const [{ nombre: proceso }] = await tx`SELECT nombre FROM procesos WHERE id = ${b.procesoId}`;
      const id = `mej-marca:${mm.medicionId}`;
      expect(await laDe(b.admin, tx, id, ANTES)).toEqual({
        id,
        modulo: "planes",
        titulo: `Decidir la acción de mejora de ${mm.ind.codigo} Indicador de prueba ${mm.ind.codigo}, octubre de 2026`,
        detalle: proceso,
        vence: null,
        enlace: `/indicadores/${encodeURIComponent(mm.ind.codigo)}#accion-de-mejora`,
      });
      // La que todavía espera su análisis no es tarea de nadie hasta su fecha límite.
      expect(await laDe(b.admin, tx, `mej-marca:${espera.medicionId}`, ANTES)).toBeUndefined();
      expect(await laDe(b.admin, tx, `mej-marca:${espera.medicionId}`, "2026-11-25T15:00:00Z")).toBeDefined();
      for (const s of [b.lider, b.control]) expect(await laDe(s, tx, id, ANTES)).toBeUndefined();
      // No es de un hallazgo: no cuenta en «Esperan su decisión».
      const conSuHallazgo = (await tareasConSuHallazgo(b.admin, { sql: tx, ahora: new Date(ANTES) })).find((t) => t.tarea.id === id);
      expect(conSuHallazgo?.hallazgoId).toBeNull();
    }));

  it("desaparece al decidir, con cualquiera de las tres salidas", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const o = c(ANTES, tx);
      const conNoRequiere = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const conHallazgo = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const conOcurrencia = await medicionMarcada(tx, { ahora: REPORTA, analizada: true, procesoId: b.procesoId });
      const abierto = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { indicadorId: conOcurrencia.ind.id, detectadoEn: "2026-11-04" }), o);
      const ids = [conNoRequiere, conHallazgo, conOcurrencia].map((m) => `mej-marca:${m.medicionId}`);
      const tiene = async () => (await tareasDe(b.admin, tx, ANTES)).filter((t) => ids.includes(t.id)).map((t) => t.id);
      expect(await tiene()).toEqual(ids);
      await resolverNoRequiere(b.admin, { medicionId: conNoRequiere.medicionId, justificacion: "El resultado se explica por el cierre de la sede" }, o);
      await registrarHallazgo(
        b.admin,
        datosDeHallazgo(b.procesoId, { origen: "indicador", fuente: null, detectadoEn: "2026-11-04", indicadorId: conHallazgo.ind.id, medicionId: conHallazgo.medicionId }),
        o,
      );
      await resolverConOcurrencia(b.lider, { medicionId: conOcurrencia.medicionId, hallazgoId: abierto.id }, o);
      expect(await tiene()).toEqual([]);
    }));
});

describe("«Mis tareas» agrupa las de mejoramiento por fuente", () => {
  const de = (paso: string, n: number, titulo = `Tarea ${n}`): Tarea => ({
    id: `mej-${paso}:${n}`,
    modulo: "planes",
    titulo,
    detalle: null,
    vence: n === 3 ? new Date("2026-11-21T04:59:59Z") : new Date("2026-12-01T17:00:00Z"),
    enlace: `/mejoramiento/${n}`,
  });
  const seis = (paso: string, titulo?: (n: number) => string) => [1, 2, 3, 4, 5, 6].map((n) => de(paso, n, titulo?.(n)));
  const AHORA_G = new Date("2026-11-18T15:00:00Z");

  it("más de cinco de un paso van a la lista filtrada por «Esperan su decisión» y su estado", () => {
    const [g] = agruparTareas(seis("corregir"), 5, AHORA_G);
    expect(g).toEqual({
      id: "mejora-corregir",
      modulo: "planes",
      titulo: "6 correcciones de hallazgos por registrar",
      detalle: "La más próxima vence el 20 de noviembre de 2026",
      vence: new Date("2026-11-21T04:59:59Z"),
      enlace: "/mejoramiento?decision=1&estado=por_corregir",
    });
    expect(agruparTareas(seis("evaluar"), 5, AHORA_G)[0]).toMatchObject({ titulo: "6 hallazgos por evaluar la eficacia", enlace: "/mejoramiento?decision=1&estado=por_evaluar" });
    expect(agruparTareas(seis("ajuste"), 5, AHORA_G)[0]).toMatchObject({ enlace: "/mejoramiento?decision=1" });
    expect(agruparTareas(seis("clasificar"), 5, AHORA_G)[0]).toMatchObject({ titulo: "6 reportes de mejoramiento por clasificar", enlace: RUTA_REPORTES_RECIBIDOS });
  });

  it("las actividades van a «Mis actividades»; con una por reasignar, a la lista", () => {
    expect(agruparTareas(seis("actividad"), 5, AHORA_G)[0]).toMatchObject({ id: "mejora-actividades", enlace: "/mejoramiento/actividades" });
    const conReasignar = seis("actividad", (n) => (n === 2 ? "Reasignar: Actividad 2" : `Actividad ${n}`));
    expect(agruparTareas(conReasignar, 5, AHORA_G)[0]).toMatchObject({ enlace: "/mejoramiento?decision=1" });
  });

  it("con cinco de cada fuente no agrupa nada", () => {
    const tareas = ["aceptar", "actividad", "clasificar", "ente"].flatMap((p) => [1, 2, 3, 4, 5].map((n) => de(p, n)));
    expect(agruparTareas(tareas, 5, AHORA_G)).toEqual(tareas);
  });

  it("las respuestas al ente de los planes van a la pestaña «Planes»; no se mezclan con las de un hallazgo", () => {
    expect(agruparTareas(seis("ente-plan"), 5, AHORA_G)[0]).toMatchObject({
      id: "mejora-ente-plan",
      titulo: "6 respuestas al ente de planes por registrar",
      enlace: RUTA_PLANES,
    });
    const mezcladas = [...[1, 2, 3].map((n) => de("ente", n)), ...[4, 5, 6].map((n) => de("ente-plan", n))];
    expect(agruparTareas(mezcladas, 5, AHORA_G)).toEqual(mezcladas);
  });

  it("las marcas de los indicadores por decidir van a la lista de indicadores que requieren acción de mejora", () => {
    expect(agruparTareas(seis("marca"), 5, AHORA_G)[0]).toMatchObject({
      id: "mejora-marcas",
      modulo: "planes",
      titulo: "6 acciones de mejora de indicadores por decidir",
      enlace: "/indicadores?reporte=requiere-accion",
    });
  });

  it("las cargas sin su formato firmado van a la lista de «Esperan su decisión»", () => {
    expect(agruparTareas(seis("escaneo"), 5, AHORA_G)[0]).toMatchObject({
      id: "mejora-escaneo",
      titulo: "6 cargas sin su formato firmado",
      enlace: "/mejoramiento?decision=1",
    });
  });
});
