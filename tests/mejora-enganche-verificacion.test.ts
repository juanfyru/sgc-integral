/**
 * La no conformidad que nace de un hallazgo de verificación de Distribución (Fase 15B, anexo §7): el registro con el enlace, la
 * justificación de la acción correctiva y los campos fijos; a lo sumo una que cuente; aceptada, pasa directo a «Por formular»; lo que
 * pintan las filas de Distribución (`engancheDeVerificacion`) y la sección «Corrección» (`correccionEnlazada`). Contra la BD de
 * trabajo, dentro de una transacción que se revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { corregirHallazgo, obtenerHallazgo, reabrirHallazgo, type Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { acumulaElPunto, correccionEnlazada, engancheDeVerificacion, procesosDelPunto } from "@/db/consultas/mejoramiento/enganche-verificacion";
import { baseDeDetalle, leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { legible } from "@/db/consultas/mejoramiento/legible";
import { aceptarHallazgo, rechazarHallazgo, retirarHallazgo } from "@/db/consultas/mejoramiento/recorrido";
import { anularHallazgo, editarHallazgo, registrarHallazgo, type DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import {
  CARGA_SIN_ENGANCHE,
  CORRECCION_EN_DISTRIBUCION,
  INDICE_NO_CONFORMIDAD_DE_VERIFICACION,
  PROCESO_DEL_PUNTO,
  SIN_JUSTIFICAR_LA_ACCION,
  textoDeSugerencia,
  VERIFICACION_NO_EXISTE,
  YA_TIENE_NO_CONFORMIDAD,
} from "@/lib/mejoramiento/enganches";
import { pasosDelRecorrido } from "@/lib/mejoramiento/estados";
import { ErrorPermiso } from "@/lib/permisos";
import { baseDeMejora, c, datosDeCarga, datosDeHallazgo, hallazgoDeVerificacion, type BaseDeMejora } from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { contada } from "./utiles/sentencias";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá. El hallazgo de verificación se abrió el martes 10 y se corrigió el 11.
const AHORA = "2026-11-18T15:00:00Z";
const CORRIGE = "2026-11-11T15:00:00Z";
const ACEPTA = "2026-11-19T15:00:00Z";
const NOTA = "Se retiró la copia vieja y se entregó la vigente";
const JUSTIFICACION = "Es la tercera copia obsoleta del año en este punto";

type Escena = { b: BaseDeMejora; responsable: SesionFlujo; vh: { id: number; punto: { id: number; nombre: string } } };

/** Un punto con un hallazgo de verificación abierto el 10 y corregido por su responsable (Consulta) el 11. */
async function escena(tx: TransactionSql, x?: { conProcesos?: boolean }): Promise<Escena> {
  const b = await baseDeMejora(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const vh = await hallazgoDeVerificacion(tx, { responsable, procesos: x?.conProcesos === false ? [] : [b.procesoId] });
  await corregirHallazgo(vh.id, responsable, NOTA, { sql: tx, ahora: new Date(CORRIGE) });
  return { b, responsable, vh };
}

const datos = (e: Escena, cambios?: Partial<DatosDeHallazgo>): DatosDeHallazgo => ({
  ...datosDeHallazgo(e.b.procesoId),
  verificacionHallazgoId: e.vh.id,
  accionJustificacion: JUSTIFICACION,
  ...cambios,
});

const deVerificacion = (tx: TransactionSql, vh: number) =>
  tx`SELECT id, estado FROM mejora_hallazgos WHERE verificacion_hallazgo_id = ${vh} ORDER BY id`;

/** La fila de Distribución tal como la listan sus páginas (`obtenerHallazgo`, la de quien mira). */
async function fila(tx: TransactionSql, quien: SesionFlujo, id: number): Promise<{ id: number; puntoUsoId: number; reaperturas: number }> {
  const h = (await obtenerHallazgo(id, quien, { sql: tx })) as Hallazgo;
  return { id: h.id, puntoUsoId: h.punto.id, reaperturas: h.reaperturas };
}

describe("registrarHallazgo con un hallazgo de verificación", () => {
  it("como Admin SGC: nace «Por aceptar» con la acción correctiva requerida; la justificación va a la fila y al evento, no a la bitácora", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      const [f] = await tx`SELECT estado, clase, origen, verificacion_hallazgo_id, accion_requerida, accion_justificacion, accion_decidida_por,
          accion_decidida_en, correccion_requerida FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({
        estado: "por_aceptar",
        clase: "no_conformidad",
        origen: "control_documental",
        accion_requerida: true,
        accion_justificacion: JUSTIFICACION,
        correccion_requerida: null,
      });
      expect(Number(f.verificacion_hallazgo_id)).toBe(e.vh.id);
      expect(Number(f.accion_decidida_por)).toBe(e.b.admin.usuarioId);
      expect((f.accion_decidida_en as Date).toISOString()).toBe(new Date(AHORA).toISOString());
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${r.id} AND tipo = 'registrar'`;
      expect(evento.detalle).toMatchObject({ verificacionHallazgoId: e.vh.id, accionJustificacion: JUSTIFICACION });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_registrar' AND entidad = 'mejora_hallazgo' AND entidad_id = ${r.id}`;
      expect(bitacora.detalle).toMatchObject({ verificacionHallazgoId: e.vh.id, codigo: r.codigo });
      expect(JSON.stringify(bitacora.detalle)).not.toContain(JUSTIFICACION);
      // El hallazgo de verificación no cambia: los dos ciclos son independientes.
      const [vh] = await tx`SELECT estado, nota_correccion FROM hallazgos WHERE id = ${e.vh.id}`;
      expect(vh).toMatchObject({ estado: "por_validar", nota_correccion: NOTA });
    }));

  it("sin justificación, o con nueve caracteres: SIN_JUSTIFICAR_LA_ACCION, y no nace nada", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      for (const accionJustificacion of [undefined, null, "", "123456789", "   corta   "]) {
        await expect(registrarHallazgo(e.b.admin, datos(e, { accionJustificacion }), c(AHORA, tx))).rejects.toThrow(SIN_JUSTIFICAR_LA_ACCION);
      }
      expect(await deVerificacion(tx, e.vh.id)).toHaveLength(0);
      // Con diez, nace.
      await registrarHallazgo(e.b.admin, datos(e, { accionJustificacion: "1234567890" }), c(AHORA, tx));
      expect(await deVerificacion(tx, e.vh.id)).toHaveLength(1);
    }));

  it("la clase y el origen son fijos: lo que se fuerce en el envío no cuenta", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      // Una observación de un ente de control pediría la fecha del ente y dejaría la criticidad en nada: no se mira.
      const r = await registrarHallazgo(e.b.admin, datos(e, { clase: "observacion", origen: "ente_control", criticidad: "media" }), c(AHORA, tx));
      const [f] = await tx`SELECT clase, origen, criticidad, fecha_limite_ente FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({ clase: "no_conformidad", origen: "control_documental", criticidad: "media", fecha_limite_ente: null });
    }));

  it("un proceso que no es del punto se rechaza; con el punto sin procesos, vale cualquiera", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otro = await procesoNuevo(tx);
      await expect(registrarHallazgo(e.b.admin, datos(e, { procesoId: otro }), c(AHORA, tx))).rejects.toThrow(PROCESO_DEL_PUNTO);
      expect(await deVerificacion(tx, e.vh.id)).toHaveLength(0);
      const sin = await escena(tx, { conProcesos: false });
      await registrarHallazgo(sin.b.admin, datos(sin, { procesoId: otro }), c(AHORA, tx));
      expect(await deVerificacion(tx, sin.vh.id)).toHaveLength(1);
    }));

  it("Control Interno y el líder no la abren (mejora.gestionar); un hallazgo de verificación que no existe se dice igual que uno ajeno", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      await expect(registrarHallazgo(e.b.control, datos(e), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await deVerificacion(tx, e.vh.id)).toHaveLength(0);
      await expect(registrarHallazgo(e.b.admin, datos(e, { verificacionHallazgoId: 9_000_000_000 }), c(AHORA, tx))).rejects.toThrow(
        VERIFICACION_NO_EXISTE,
      );
    }));

  it("el líder la acepta: queda «Por formular», sin corrección propia y con el plazo de formular", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      await aceptarHallazgo(e.b.lider, { hallazgoId: r.id }, c(ACEPTA, tx));
      const [f] = await tx`SELECT h.estado, h.correccion_requerida, h.vence_en, r.formular_antes_de
        FROM mejora_hallazgos h JOIN mejora_rondas r ON r.hallazgo_id = h.id AND r.numero = 1 WHERE h.id = ${r.id}`;
      expect(f.estado).toBe("por_formular");
      expect(f.correccion_requerida).toBeNull();
      expect(f.formular_antes_de).not.toBeNull();
      expect((f.vence_en as Date).toISOString()).toBe((f.formular_antes_de as Date).toISOString());
    }));

  it("el recorrido que pinta su página no trae la corrección ni la decisión: del registro y la aceptación pasa a la causa raíz", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      await aceptarHallazgo(e.b.lider, { hallazgoId: r.id }, c(ACEPTA, tx));
      const d = await leerHallazgo(e.b.admin, r.id, { sql: tx, ahora: new Date(ACEPTA) });
      const pasos = pasosDelRecorrido(baseDeDetalle(d!));
      expect(pasos.map((p) => p.etiqueta)).toEqual(["Registro", "Aceptado", "Causa raíz", "Plan aprobado", "Ejecución", "Verificación", "Eficacia", "Cierre"]);
      expect(pasos.slice(0, 3).map((p) => p.estado)).toEqual(["hecho", "hecho", "actual"]);
    }));

  it("a lo sumo una que cuente: la segunda se rechaza; con la primera anulada, o rechazada y retirada, nace otra", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const primera = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      await expect(registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx))).rejects.toThrow(YA_TIENE_NO_CONFORMIDAD);
      await anularHallazgo(e.b.admin, { hallazgoId: primera.id, justificacion: "Se abrió sobre el punto equivocado" }, c(AHORA, tx));
      const segunda = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      // Rechazada por el líder sigue contando mientras se decide; retirada, ya no.
      await rechazarHallazgo(e.b.lider, { hallazgoId: segunda.id, justificacion: "La copia ya se retiró y no se repitió" }, c(ACEPTA, tx));
      await expect(registrarHallazgo(e.b.admin, datos(e), c(ACEPTA, tx))).rejects.toThrow(YA_TIENE_NO_CONFORMIDAD);
      await retirarHallazgo(e.b.admin, { hallazgoId: segunda.id }, c(ACEPTA, tx));
      await registrarHallazgo(e.b.admin, datos(e), c(ACEPTA, tx));
      expect((await deVerificacion(tx, e.vh.id)).map((f) => f.estado)).toEqual(["anulado", "rechazado", "por_aceptar"]);
    }));

  it("el 23505 del índice único parcial sale por legible como YA_TIENE_NO_CONFORMIDAD; otro 23505, con su frase de siempre", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      const otro = await registrarHallazgo(e.b.admin, datosDeHallazgo(e.b.procesoId), c(AHORA, tx));
      // La carrera de dos registros a la vez, reproducida con la escritura que el índice detiene.
      const carrera = tx.savepoint((sp) => sp`UPDATE mejora_hallazgos SET verificacion_hallazgo_id = ${e.vh.id} WHERE id = ${otro.id}`);
      await expect(legible(carrera)).rejects.toThrow(YA_TIENE_NO_CONFORMIDAD);
      const ajeno = Object.assign(new Error("duplicate key"), { code: "23505", constraint_name: "otro_indice" });
      await expect(legible(Promise.reject(ajeno))).rejects.toThrow("Otra persona guardó lo mismo a la vez: vuelva a cargar la página");
      const delIndice = Object.assign(new Error("duplicate key"), { code: "23505", constraint_name: INDICE_NO_CONFORMIDAD_DE_VERIFICACION });
      await expect(legible(Promise.reject(delIndice))).rejects.toThrow(YA_TIENE_NO_CONFORMIDAD);
    }));

  it("al editarla mientras espera su aceptación, la clase y el origen siguen fijos y el proceso, entre los del punto", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      const otro = await procesoNuevo(tx);
      await expect(editarHallazgo(e.b.admin, r.id, datos(e, { procesoId: otro }), c(AHORA, tx))).rejects.toThrow(PROCESO_DEL_PUNTO);
      await editarHallazgo(e.b.admin, r.id, datos(e, { clase: "oportunidad", origen: "pamec", titulo: "Copias obsoletas en el puesto" }), c(AHORA, tx));
      const [f] = await tx`SELECT clase, origen, titulo, criticidad, estado FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({ clase: "no_conformidad", origen: "control_documental", titulo: "Copias obsoletas en el puesto", criticidad: "media", estado: "por_aceptar" });
    }));

  it("al editarla, la primera validación ya usa lo fijo: un origen de ente de control forzado sin su fecha no se mira (ronda 1, punto 1)", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      await editarHallazgo(e.b.admin, r.id, datos(e, { origen: "ente_control", titulo: "Copias obsoletas en urgencias" }), c(AHORA, tx));
      const [f] = await tx`SELECT origen, titulo, fecha_limite_ente FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toEqual({ origen: "control_documental", titulo: "Copias obsoletas en urgencias", fecha_limite_ente: null });
    }));

  it("los procesos del punto de la edición se leen sin la regla de quién ve el punto: sus activos, de menor a mayor (ronda 1, punto 5)", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      // `procesosDelPunto` no recibe sesión: los procesos del punto no son secretos, y la regla nunca se salta en silencio.
      expect(await procesosDelPunto(tx, e.vh.id)).toEqual([e.b.procesoId]);
      const [otro, inactivo] = [await procesoNuevo(tx), await procesoNuevo(tx)];
      await tx`INSERT INTO punto_uso_procesos (punto_uso_id, proceso_id) VALUES (${e.vh.punto.id}, ${otro}), (${e.vh.punto.id}, ${inactivo})`;
      await tx`UPDATE procesos SET activo = false WHERE id = ${inactivo}`;
      expect(await procesosDelPunto(tx, e.vh.id)).toEqual([e.b.procesoId, otro].sort((x, y) => x - y));
      expect(await procesosDelPunto(tx, 9_000_000_000)).toEqual([]);
    }));

  it("la carga de un hallazgo en curso rechaza el enlace que traiga el envío: no carga nada que diga que quedó enlazado", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      await expect(
        cargarHallazgo(
          e.b.admin,
          datosDeCarga(e.b.procesoId, e.b.lider.usuarioId, { verificacionHallazgoId: e.vh.id, accionJustificacion: JUSTIFICACION }),
          c(AHORA, tx),
        ),
      ).rejects.toThrow(CARGA_SIN_ENGANCHE);
      expect(await deVerificacion(tx, e.vh.id)).toHaveLength(0);
      // Sin el enlace, se carga.
      await cargarHallazgo(e.b.admin, datosDeCarga(e.b.procesoId, e.b.lider.usuarioId), c(AHORA, tx));
    }));

  it("en un proceso sin líder nace ya en «Por formular»", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx, { conProcesos: false });
      const sinLider = await procesoNuevo(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e, { procesoId: sinLider }), c(AHORA, tx));
      const [f] = await tx`SELECT h.estado, h.vence_en, r.formular_antes_de
        FROM mejora_hallazgos h JOIN mejora_rondas r ON r.hallazgo_id = h.id AND r.numero = 1 WHERE h.id = ${r.id}`;
      expect(f.estado).toBe("por_formular");
      expect((f.vence_en as Date).toISOString()).toBe((f.formular_antes_de as Date).toISOString());
    }));
});

describe("engancheDeVerificacion", () => {
  it("puedeAbrir: solo el Admin SGC y mientras no haya una que cuente; la que cuenta se nombra con enlace solo a quien la ve", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const o = { sql: tx, ahora: new Date(AHORA) };
      const antes = await engancheDeVerificacion(e.b.admin, [await fila(tx, e.b.admin, e.vh.id)], o);
      expect(antes.get(e.vh.id)).toEqual({ noConformidad: null, puedeAbrir: true, sugerir: null });
      for (const quien of [e.b.control, e.b.gerencia, e.b.lider, e.responsable]) {
        expect((await engancheDeVerificacion(quien, [await fila(tx, quien, e.vh.id)], o)).get(e.vh.id)).toEqual({
          noConformidad: null,
          puedeAbrir: false,
          sugerir: null,
        });
      }
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      const despues = (await engancheDeVerificacion(e.b.admin, [await fila(tx, e.b.admin, e.vh.id)], o)).get(e.vh.id);
      expect(despues).toEqual({ noConformidad: { id: r.id, codigo: r.codigo, estado: "Por aceptar", visible: true }, puedeAbrir: false, sugerir: null });
      // El responsable del punto (Consulta) no ve la no conformidad; el líder de su proceso, sí.
      expect((await engancheDeVerificacion(e.responsable, [await fila(tx, e.responsable, e.vh.id)], o)).get(e.vh.id)?.noConformidad?.visible).toBe(false);
      expect((await engancheDeVerificacion(e.b.lider, [await fila(tx, e.b.lider, e.vh.id)], o)).get(e.vh.id)?.noConformidad?.visible).toBe(true);
      // Anulada, ya no cuenta: se puede abrir otra.
      await anularHallazgo(e.b.admin, { hallazgoId: r.id, justificacion: "Se abrió sobre el punto equivocado" }, c(AHORA, tx));
      expect((await engancheDeVerificacion(e.b.admin, [await fila(tx, e.b.admin, e.vh.id)], o)).get(e.vh.id)).toEqual({
        noConformidad: null,
        puedeAbrir: true,
        sugerir: null,
      });
    }));

  it("sugiere a quien puede abrirla cuando el hallazgo se reabrió, y no cuando ya hay una que cuenta", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const o = { sql: tx, ahora: new Date(AHORA) };
      await reabrirHallazgo(e.vh.id, e.b.admin, "La copia vieja sigue en el cajón", { sql: tx, ahora: new Date(CORRIGE) });
      const f = await fila(tx, e.b.admin, e.vh.id);
      expect(f.reaperturas).toBe(1);
      expect((await engancheDeVerificacion(e.b.admin, [f], o)).get(e.vh.id)?.sugerir).toEqual({ por: "reabierto", veces: 1 });
      expect((await engancheDeVerificacion(e.b.lider, [f], o)).get(e.vh.id)?.sugerir).toBeNull();
      await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      expect((await engancheDeVerificacion(e.b.admin, [f], o)).get(e.vh.id)?.sugerir).toBeNull();
    }));

  it("sugiere cuando el punto acumula tres hallazgos en doce meses; no con dos ni con uno de hace trece meses; con la configuración en 2, con dos", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const o = { sql: tx, ahora: new Date(AHORA) };
      const sugerencia = async () => (await engancheDeVerificacion(e.b.admin, [await fila(tx, e.b.admin, e.vh.id)], o)).get(e.vh.id)?.sugerir;
      const otro = (ahora: string) =>
        hallazgoDeVerificacion(tx, { responsable: e.responsable, punto: e.vh.punto, ahora, origen: "recogida" });
      // Uno de hace trece meses y otro de este año: con el de la escena, dos dentro de los doce meses.
      await otro("2025-10-15T15:00:00Z");
      await otro("2026-03-02T15:00:00Z");
      expect(await sugerencia()).toBeNull();
      await tx`INSERT INTO configuracion (clave, valor) VALUES ('mej_sugerir_hallazgos', '2') ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      expect(await sugerencia()).toEqual({ por: "acumula", hallazgos: 2, meses: 12 });
      await tx`UPDATE configuracion SET valor = '3' WHERE clave = 'mej_sugerir_hallazgos'`;
      await otro("2025-11-20T15:00:00Z");
      expect(await sugerencia()).toEqual({ por: "acumula", hallazgos: 3, meses: 12 });
      // Ya con una no conformidad que cuenta, no se sugiere.
      await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      expect(await sugerencia()).toBeNull();
    }));

  it("lo que acumula el punto (para encima de la lista filtrada) sale de su cuenta, también con todas sus filas reabiertas (ronda 1, punto 4)", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const o = { sql: tx, ahora: new Date(AHORA) };
      const otros = [
        await hallazgoDeVerificacion(tx, { responsable: e.responsable, punto: e.vh.punto, ahora: "2026-06-02T15:00:00Z" }),
        await hallazgoDeVerificacion(tx, { responsable: e.responsable, punto: e.vh.punto, ahora: "2026-09-01T15:00:00Z" }),
      ];
      // Las tres filas del punto se reabrieron: cada una dice «se reabrió», ninguna «acumula».
      for (const id of [e.vh.id, ...otros.map((x) => x.id)]) {
        const [h] = await tx`SELECT estado FROM hallazgos WHERE id = ${id}`;
        if (h.estado === "abierto") await corregirHallazgo(id, e.responsable, NOTA, { sql: tx, ahora: new Date(CORRIGE) });
        await reabrirHallazgo(id, e.b.admin, "La copia vieja sigue en el puesto", { sql: tx, ahora: new Date(CORRIGE) });
      }
      const filas = await Promise.all([e.vh.id, ...otros.map((x) => x.id)].map((id) => fila(tx, e.b.admin, id)));
      const mapa = await engancheDeVerificacion(e.b.admin, filas, o);
      expect([...mapa.values()].map((x) => x.sugerir?.por)).toEqual(["reabierto", "reabierto", "reabierto"]);
      expect(await acumulaElPunto(e.b.admin, e.vh.punto.id, o)).toEqual({ por: "acumula", hallazgos: 3, meses: 12 });
      // Solo al Admin SGC; con dos no acumula.
      expect(await acumulaElPunto(e.b.lider, e.vh.punto.id, o)).toBeNull();
      expect(await acumulaElPunto(e.b.control, e.vh.punto.id, o)).toBeNull();
      const dos = await hallazgoDeVerificacion(tx, { responsable: e.responsable });
      await hallazgoDeVerificacion(tx, { responsable: e.responsable, punto: dos.punto, ahora: "2026-06-02T15:00:00Z" });
      expect(await acumulaElPunto(e.b.admin, dos.punto.id, o)).toBeNull();
    }));

  it("una consulta por lo que se pide, no una por fila", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otros = [
        await hallazgoDeVerificacion(tx, { responsable: e.responsable }),
        await hallazgoDeVerificacion(tx, { responsable: e.responsable }),
        await hallazgoDeVerificacion(tx, { responsable: e.responsable }),
      ];
      const uno = contada(tx);
      await engancheDeVerificacion(e.b.admin, [await fila(tx, e.b.admin, e.vh.id)], { sql: uno.sql, ahora: new Date(AHORA) });
      const filas = [await fila(tx, e.b.admin, e.vh.id), ...(await Promise.all(otros.map((x) => fila(tx, e.b.admin, x.id))))];
      const varios = contada(tx);
      const mapa = await engancheDeVerificacion(e.b.admin, filas, { sql: varios.sql, ahora: new Date(AHORA) });
      expect(mapa.size).toBe(4);
      expect(varios.sentencias.length).toBe(uno.sentencias.length);
      const vacio = contada(tx);
      expect((await engancheDeVerificacion(e.b.admin, [], { sql: vacio.sql })).size).toBe(0);
      expect(vacio.sentencias).toHaveLength(0);
    }));

  it("el texto de la sugerencia", () => {
    expect(textoDeSugerencia({ por: "reabierto", veces: 1 })).toBe("Este hallazgo se reabrió una vez. Puede abrir una no conformidad para tratar la causa.");
    expect(textoDeSugerencia({ por: "reabierto", veces: 3 })).toBe("Este hallazgo se reabrió 3 veces. Puede abrir una no conformidad para tratar la causa.");
    expect(textoDeSugerencia({ por: "acumula", hallazgos: 3, meses: 12 })).toBe(
      "Este punto acumula 3 hallazgos en 12 meses. Puede abrir una no conformidad para tratar la causa.",
    );
  });
});

describe("correccionEnlazada", () => {
  it("quien ve el hallazgo de verificación recibe su estado, su nota, quién y cuándo; el líder del proceso que no ve el punto, nulo", () =>
    revertida(sql, async (tx) => {
      // El punto no tiene procesos: el líder del proceso de la no conformidad no lo ve.
      const e = await escena(tx, { conProcesos: false });
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      const [quien] = await tx`SELECT nombre FROM usuarios WHERE id = ${e.responsable.usuarioId}`;
      expect(await correccionEnlazada(e.b.admin, e.vh.id, { sql: tx })).toEqual({
        estado: "Por validar",
        nota: NOTA,
        por: quien.nombre,
        en: new Date(CORRIGE),
        enlace: "/distribucion/verificaciones",
        punto: e.vh.punto.nombre,
      });
      expect(await correccionEnlazada(e.responsable, e.vh.id, { sql: tx })).toMatchObject({ nota: NOTA });
      expect(await correccionEnlazada(e.b.lider, e.vh.id, { sql: tx })).toBeNull();
      expect(await correccionEnlazada(e.b.admin, 9_000_000_000, { sql: tx })).toBeNull();

      // En la página: a quien la ve, la corrección y el enlace; al líder, solo que está en Distribución.
      const delAdmin = await leerHallazgo(e.b.admin, r.id, { sql: tx, ahora: new Date(AHORA) });
      expect(delAdmin?.correccionEnlazada).toMatchObject({ visible: true, nota: NOTA, estado: "Por validar" });
      expect(delAdmin?.enlaces).toContainEqual(expect.objectContaining({ visible: true, clase: "verificacion", href: "/distribucion/verificaciones" }));
      const delLider = await leerHallazgo(e.b.lider, r.id, { sql: tx, ahora: new Date(AHORA) });
      expect(delLider?.correccionEnlazada).toEqual({ visible: false });
      expect(delLider?.enlaces).toContainEqual({ visible: false, clase: "verificacion", rotulo: "Hallazgo de verificación" });
      expect(JSON.stringify(delLider)).not.toContain(NOTA);
      expect(CORRECCION_EN_DISTRIBUCION).toBe("La corrección está en un hallazgo de verificación de Distribución");
      // Un hallazgo sin el enlace no tiene corrección enlazada.
      const sin = await registrarHallazgo(e.b.admin, datosDeHallazgo(e.b.procesoId), c(AHORA, tx));
      expect((await leerHallazgo(e.b.admin, sin.id, { sql: tx, ahora: new Date(AHORA) }))?.correccionEnlazada).toBeNull();
    }));
});
