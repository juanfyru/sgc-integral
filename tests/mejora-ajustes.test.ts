/**
 * Los ajustes al plan aprobado (spec 15 §10.6) y la escalada a Gerencia (§10.7), Tarea 15: quién pide, quién decide, lo que
 * cambia al aprobarse cada tipo, lo que no cambia nunca (el plan congelado, las fechas originales, el cierre previsto) y la
 * escalada con su respuesta. Contra la BD de trabajo, dentro de una transacción que se revierte; los ids y los códigos se
 * leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { leerActividad, misActividades, registrarSeguimiento, terminarActividad } from "@/db/consultas/mejoramiento/actividades";
import {
  AJUSTE_NO_EXISTE,
  decidirAjuste,
  escalarAGerencia,
  pedirAjuste,
  quienDecideAjustes,
  responderEscalada,
} from "@/db/consultas/mejoramiento/ajustes";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { bloquearHallazgo, NO_EXISTE } from "@/db/consultas/mejoramiento/flujo";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { anularHallazgo } from "@/db/consultas/mejoramiento/registro";
import { participacionEnHallazgo } from "@/lib/alcance";
import {
  EsquemaDecidirAjuste,
  EsquemaFormularioAjuste,
  EsquemaFormularioDecidirAjuste,
  EsquemaPedirAjuste,
} from "@/lib/esquemas/mejoramiento";
import { parsearFormulario } from "@/lib/validacion";
import { venceEn } from "@/lib/mejoramiento/plazos";
import type { Criticidad } from "@/lib/mejoramiento/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { actividadPorSql, baseDeMejora, c, evidenciaDeActividad, hallazgoEn } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 16 de diciembre de 2026, 10:00 en Bogotá: el plan de `hallazgoEn` se aprobó el 17 de noviembre y sus actividades
// terminaban el martes 15, así que ya están vencidas.
const AHORA = "2026-12-16T15:00:00Z";
const HOY = "2026-12-16";
// Miércoles 18 de noviembre: todavía nada está vencido.
const ANTES = "2026-11-18T15:00:00Z";
// Jueves 17 de diciembre, 10:00 en Bogotá.
const LUEGO = "2026-12-17T15:00:00Z";
// Las 22:00 del jueves 17 en Bogotá: en UTC ya es el 18, en la zona todavía el 17.
const NOCHE_DEL_17 = "2026-12-18T03:00:00Z";
// Las 00:30 del viernes 18 en Bogotá: el 17 ya pasó.
const MADRUGADA_DEL_18 = "2026-12-18T05:30:00Z";
const FECHA_PASADA = "La fecha nueva ya pasó: niegue el ajuste para que se pida otro";
const TREINTA = "Una acción lleva treinta actividades como máximo";

const CAUSA = "El proveedor no tiene existencias del equipo hasta fin de mes";
const NOTA = "El Comité revisó la causa y no la encuentra suficiente";
const NOTA_ESCALADA = "Lleva un mes vencida y el proveedor no responde";
const RESPUESTA = "Se autoriza comprar a otro proveedor con cargo al rubro de dotación";

/** Un hallazgo «En ejecución» cuyas `actividades` actividades son de `responsable` (un usuario Consulta que no lidera el proceso). */
async function enEjecucion(tx: TransactionSql, actividades = 1, criticidad?: Criticidad) {
  const b = await baseDeMejora(tx);
  const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
  const h = await hallazgoEn(tx, b, "en_ejecucion", criticidad ? { criticidad } : undefined, { responsableId: responsable.usuarioId, actividades });
  const ids = (await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id`).map((f) => Number(f.id));
  const [accion] = await tx`SELECT id FROM mejora_acciones WHERE hallazgo_id = ${h.id} ORDER BY id LIMIT 1`;
  return { b, responsable, h, ids, accionId: Number(accion.id) };
}

const reprogramar = (hallazgoId: number, actividadId: number, finNuevo = "2026-12-30") => ({
  hallazgoId,
  tipo: "reprogramar" as const,
  actividadId,
  finNuevo,
  causa: CAUSA,
});
const cancelar = (hallazgoId: number, actividadId: number) => ({ hallazgoId, tipo: "cancelar" as const, actividadId, causa: CAUSA });
type Nueva = NonNullable<Parameters<typeof pedirAjuste>[1]["nueva"]>;
const agregar = (hallazgoId: number, nueva: Nueva) => ({ hallazgoId, tipo: "agregar" as const, nueva, causa: CAUSA });
const nuevaEn = (accionId: number, responsableId: number, extra?: Partial<Nueva>): Nueva => ({
  accionId,
  descripcion: "Capacitar al turno de noche en el registro nuevo",
  responsableId,
  inicio: HOY,
  fin: "2026-12-30",
  ...extra,
});

const filaDe = async (tx: TransactionSql, actividadId: number) =>
  (
    await tx`SELECT id, estado, avance, reprogramaciones, responsable_id, cancelada_en, aviso_vencido_en, escalado_en, gerencia_en,
        to_char(fin, 'YYYY-MM-DD') AS fin, to_char(fin_original, 'YYYY-MM-DD') AS fin_original
      FROM mejora_actividades WHERE id = ${actividadId}`
  )[0];
const ajusteDe = async (tx: TransactionSql, id: number) => (await tx`SELECT * FROM mejora_ajustes WHERE id = ${id}`)[0];
const avisosDe = async (tx: TransactionSql, usuarioId: number, tipo: string) =>
  tx`SELECT titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${usuarioId} AND tipo = ${tipo} ORDER BY id`;
const eventosDe = async (tx: TransactionSql, hallazgoId: number, tipo: string) =>
  tx`SELECT detalle, usuario_id FROM mejora_eventos WHERE hallazgo_id = ${hallazgoId} AND tipo = ${tipo} ORDER BY id`;
const bitacoraDe = async (tx: TransactionSql, accion: string, entidadId: number) =>
  tx`SELECT entidad, entidad_id, usuario_id, detalle FROM auditoria WHERE accion = ${accion} AND entidad_id = ${entidadId} ORDER BY id`;
const gerenciaActiva = async (tx: TransactionSql) =>
  (await tx`SELECT id FROM usuarios WHERE rol = 'gerencia' AND activo ORDER BY id`).map((f) => Number(f.id));

/** Seguimiento al 100 %, un archivo y terminar, por el dominio. */
async function terminar(tx: TransactionSql, quien: SesionFlujo, actividadId: number) {
  await registrarSeguimiento(quien, { actividadId, fecha: HOY, realizado: "Se terminó la actividad del plan de prueba", avance: 100 }, c(AHORA, tx));
  await evidenciaDeActividad(tx, actividadId, quien.usuarioId);
  await terminarActividad(quien, { actividadId }, c(AHORA, tx));
}

describe("lo que manda el formulario llega a la forma del dominio (sin base)", () => {
  const formulario = (campos: Array<[string, string]>) => {
    const f = new FormData();
    for (const [k, v] of campos) f.append(k, v);
    return f;
  };
  const pedido = (campos: Array<[string, string]>) => EsquemaPedirAjuste.parse(parsearFormulario(formulario(campos), EsquemaFormularioAjuste));
  const nueva: Array<[string, string]> = [
    ["descripcion", "Capacitar al turno de noche"],
    ["responsableId", "9"],
    ["inicio", HOY],
    ["fin", "2026-12-30"],
    ["causa", CAUSA],
  ];

  it("reprogramar y cancelar: la actividad (y la fecha nueva), sin actividad nueva", () => {
    expect(pedido([["hallazgoId", "14"], ["tipo", "reprogramar"], ["actividadId", "22"], ["finNuevo", "2026-12-30"], ["causa", CAUSA]])).toEqual({
      hallazgoId: 14,
      tipo: "reprogramar",
      actividadId: 22,
      finNuevo: "2026-12-30",
      nueva: null,
      causa: CAUSA,
    });
    expect(pedido([["hallazgoId", "14"], ["tipo", "cancelar"], ["actividadId", "22"], ["causa", CAUSA]])).toEqual({
      hallazgoId: 14,
      tipo: "cancelar",
      actividadId: 22,
      finNuevo: null,
      nueva: null,
      causa: CAUSA,
    });
  });

  it("añadir: en una acción del plan, o en una nueva con una causa o con varias", () => {
    expect(pedido([["hallazgoId", "14"], ["tipo", "agregar"], ["accionId", "5"], ...nueva]).nueva).toEqual({
      accionId: 5,
      accion: null,
      descripcion: "Capacitar al turno de noche",
      responsableId: 9,
      inicio: HOY,
      fin: "2026-12-30",
    });
    const enUnaNueva = (causas: string[]) =>
      pedido([
        ["hallazgoId", "14"],
        ["tipo", "agregar"],
        ["accionId", "nueva"],
        ["accionTipo", "correctiva"],
        ["accionDescripcion", "Instalar un termómetro con registro automático"],
        ...causas.map((c): [string, string] => ["causaIds", c]),
        ...nueva,
      ]).nueva;
    expect(enUnaNueva(["3"])).toMatchObject({
      accionId: null,
      accion: { tipo: "correctiva", descripcion: "Instalar un termómetro con registro automático", causaIds: [3] },
    });
    expect(enUnaNueva(["3", "4"])?.accion?.causaIds).toEqual([3, 4]);
    // Un campo que el formulario no tiene lo rechaza el esquema estricto.
    expect(() => parsearFormulario(formulario([["hallazgoId", "14"], ["tipo", "agregar"], ["otro", "x"]]), EsquemaFormularioAjuste)).toThrow();
  });

  it("decidir: «si» o «no», la nota y el acta en dos campos", () => {
    const negar = parsearFormulario(
      formulario([["ajusteId", "9"], ["aprueba", "no"], ["nota", NOTA], ["actaNumero", "07-2026"], ["actaFecha", "2026-12-15"]]),
      EsquemaFormularioDecidirAjuste,
    );
    expect(EsquemaDecidirAjuste.parse(negar)).toEqual({ ajusteId: 9, aprueba: false, nota: NOTA, acta: { numero: "07-2026", fecha: "2026-12-15" } });
    const aprobar = parsearFormulario(formulario([["ajusteId", "9"], ["aprueba", "si"]]), EsquemaFormularioDecidirAjuste);
    expect(EsquemaDecidirAjuste.parse(aprobar)).toEqual({ ajusteId: 9, aprueba: true, nota: null, acta: null });
  });
});

describe("pedirAjuste", () => {
  it("quién pide: el responsable reprograma la suya y no la de otro, ni añade ni cancela; un líder y el Admin SGC, los tres tipos", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids, accionId } = await enEjecucion(tx, 4);
      const [a1, a2, a3, a4] = ids;
      const ajena = await actividadPorSql(tx, h.id, b.lider.usuarioId, { accionDe: a1, fin: "2026-12-15" });
      const [causa] = await tx`SELECT id FROM mejora_causas WHERE hallazgo_id = ${h.id} ORDER BY id LIMIT 1`;
      const o = c(AHORA, tx);

      const { id } = await pedirAjuste(responsable, reprogramar(h.id, a1), o);
      expect(await ajusteDe(tx, id)).toMatchObject({ tipo: "reprogramar", estado: "pendiente", actividad_id: a1, pedido_por: responsable.usuarioId });
      await expect(pedirAjuste(responsable, reprogramar(h.id, ajena), o)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(pedirAjuste(responsable, cancelar(h.id, a2), o)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(pedirAjuste(responsable, agregar(h.id, nuevaEn(accionId, responsable.usuarioId)), o)).rejects.toBeInstanceOf(ErrorPermiso);
      // Quien ve el hallazgo sin ser responsable, líder ni Admin SGC, no pide; quien no lo ve, no sabe que existe.
      await expect(pedirAjuste(b.control, reprogramar(h.id, a2), o)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(pedirAjuste(b.consulta, reprogramar(h.id, a2), o)).rejects.toThrow(NO_EXISTE);

      await pedirAjuste(b.lider, reprogramar(h.id, a2), o);
      await pedirAjuste(b.lider, cancelar(h.id, a3), o);
      await pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId)), o);
      await pedirAjuste(b.admin, reprogramar(h.id, a4), o);
      await pedirAjuste(b.admin, cancelar(h.id, ajena), o);
      await pedirAjuste(
        b.admin,
        agregar(h.id, {
          accion: { tipo: "correctiva", descripcion: "Instalar un termómetro con registro automático", causaIds: [Number(causa.id)] },
          descripcion: "Comprar e instalar el equipo",
          responsableId: b.lider.usuarioId,
          inicio: HOY,
          fin: "2027-01-15",
        }),
        o,
      );
      const filas = await tx`SELECT tipo, actividad_id, pedido_por FROM mejora_ajustes WHERE hallazgo_id = ${h.id} ORDER BY id`;
      expect(filas.map((f) => [f.tipo, f.actividad_id, f.pedido_por])).toEqual([
        ["reprogramar", a1, responsable.usuarioId],
        ["reprogramar", a2, b.lider.usuarioId],
        ["cancelar", a3, b.lider.usuarioId],
        ["agregar", null, b.lider.usuarioId],
        ["reprogramar", a4, b.admin.usuarioId],
        ["cancelar", ajena, b.admin.usuarioId],
        ["agregar", null, b.admin.usuarioId],
      ]);
      // Pedir no cambia nada del plan ni del hallazgo.
      expect((await filaDe(tx, a1)).fin).toBe("2026-12-15");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
    }));

  it("la causa, la fecha nueva y la actividad: lo que se pide se revisa antes de guardarse", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids, accionId } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      await expect(pedirAjuste(responsable, { ...reprogramar(h.id, a1), causa: "Corta" }, o)).rejects.toThrow(
        "La causa debe tener al menos 10 caracteres",
      );
      await expect(pedirAjuste(responsable, reprogramar(h.id, a1, "2026-12-15"), o)).rejects.toThrow("La fecha nueva debe ser de hoy en adelante");
      await expect(pedirAjuste(responsable, reprogramar(h.id, a1, "2101-01-01"), o)).rejects.toThrow("La fecha debe estar entre el año 2000 y el 2100");
      // Hoy vale: el día se juzga en la zona de la instalación.
      await pedirAjuste(responsable, reprogramar(h.id, a1, HOY), o);
      // Una actividad terminada ya no se ajusta.
      await terminar(tx, responsable, a2);
      await expect(pedirAjuste(b.lider, cancelar(h.id, a2), o)).rejects.toThrow("La actividad ya terminó o se canceló");
      // La actividad nueva: su responsable activo, su inicio no posterior a su fin y su fin de hoy en adelante.
      const inactivo = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE usuarios SET activo = false WHERE id = ${inactivo.usuarioId}`;
      await expect(pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, inactivo.usuarioId)), o)).rejects.toThrow(
        "El responsable debe ser un usuario activo",
      );
      await expect(pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId, { inicio: "2027-01-10" })), o)).rejects.toThrow(
        "El inicio de la actividad nueva no puede ser posterior a su fin",
      );
      await expect(
        pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId, { inicio: "2026-12-01", fin: "2026-12-10" })), o),
      ).rejects.toThrow("La fecha de fin de la actividad nueva debe ser de hoy en adelante");
      // Una acción nueva correctiva dice qué causa ataca, y solo de las de este hallazgo.
      const sinCausa = { accionId: undefined, accion: { tipo: "correctiva" as const, descripcion: "Instalar un termómetro", causaIds: [] } };
      await expect(pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId, sinCausa)), o)).rejects.toThrow(
        "La acción correctiva nueva debe decir qué causa ataca",
      );
      const otro = await enEjecucion(tx);
      const [ajena] = await tx`SELECT id FROM mejora_causas WHERE hallazgo_id = ${otro.h.id} LIMIT 1`;
      const conAjena = { accionId: undefined, accion: { tipo: "correctiva" as const, descripcion: "Instalar un termómetro", causaIds: [Number(ajena.id)] } };
      await expect(pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId, conAjena)), o)).rejects.toThrow(
        "Esa causa no es de este hallazgo",
      );
      // La acción existente es de la ronda en curso de este hallazgo.
      await expect(pedirAjuste(b.lider, agregar(h.id, nuevaEn(otro.accionId, responsable.usuarioId)), o)).rejects.toThrow(
        "La acción no existe en esta ronda",
      );
    }));

  it("un solo pendiente por actividad: el segundo lanza su propia frase; decidido el primero, se puede pedir otro", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx, 2);
      const [a] = ids;
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(responsable, reprogramar(h.id, a), o);
      await expect(pedirAjuste(responsable, reprogramar(h.id, a, "2027-01-05"), o)).rejects.toThrow("Ya hay un ajuste por decidir para esa actividad");
      await expect(pedirAjuste(b.lider, cancelar(h.id, a), o)).rejects.toThrow("Ya hay un ajuste por decidir para esa actividad");
      const pendientes = await tx`SELECT id FROM mejora_ajustes WHERE actividad_id = ${a} AND estado = 'pendiente'`;
      expect(pendientes.map((f) => Number(f.id))).toEqual([id]);
      await decidirAjuste(b.admin, { ajusteId: id, aprueba: false, nota: NOTA }, o);
      await pedirAjuste(responsable, reprogramar(h.id, a, "2027-01-05"), o);
    }));

  it("el pedido deja su evento y su bitácora sin la causa, y avisa a quienes lo deciden con su plazo", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const { id } = await pedirAjuste(responsable, reprogramar(h.id, a), c(AHORA, tx));
      const ajuste = await ajusteDe(tx, id);
      const ctx = await contextoDeMejora(tx, new Date(AHORA));
      expect(ajuste.vence_en.toISOString()).toBe(venceEn("decision", new Date(AHORA), ctx).toISOString());
      expect(ajuste).toMatchObject({ causa: CAUSA, pedido_en: new Date(AHORA), datos: { finAntes: "2026-12-15", finNuevo: "2026-12-30" } });
      const [e] = await eventosDe(tx, h.id, "ajuste_pedido");
      expect(e).toEqual({
        detalle: { ajusteId: id, tipo: "reprogramar", actividadId: a, actividad: "A1.1", finAntes: "2026-12-15", finNuevo: "2026-12-30" },
        usuario_id: responsable.usuarioId,
      });
      const [bit] = await bitacoraDe(tx, "mejora_ajuste_pedido", h.id);
      expect(bit.entidad).toBe("mejora_hallazgo");
      expect(bit.detalle).toMatchObject({ codigo: h.codigo, ajusteId: id, tipo: "reprogramar", actividad: "A1.1", finNuevo: "2026-12-30" });
      expect(JSON.stringify([e.detalle, bit.detalle])).not.toContain("existencias");
      // Lo decide un Admin SGC (el plan lo aprobó la revisión): todos los activos reciben el aviso; quien pidió, no.
      const { rol, usuarios } = await quienDecideAjustes(tx, h.id, responsable.usuarioId);
      expect(rol).toBe("admin_sgc");
      expect(usuarios).toContain(b.admin.usuarioId);
      const [aviso] = await avisosDe(tx, b.admin.usuarioId, "mejora.ajuste_pedido");
      expect(aviso).toMatchObject({ titulo: `Decidir el ajuste de ${h.codigo}`, enlace: `/mejoramiento/${h.id}` });
      expect(aviso.cuerpo).not.toContain("existencias");
      expect(await avisosDe(tx, responsable.usuarioId, "mejora.ajuste_pedido")).toHaveLength(0);
    }));
});

describe("quién decide", () => {
  it("plan aprobado por Gerencia: un Admin SGC recibe ErrorPermiso y Gerencia decide", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx, 1, "alta");
      const [r] = await tx`SELECT aprobado_rol FROM mejora_rondas WHERE hallazgo_id = ${h.id}`;
      expect(r.aprobado_rol).toBe("gerencia");
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(b.lider, reprogramar(h.id, ids[0]), o);
      expect(await quienDecideAjustes(tx, h.id, b.lider.usuarioId)).toEqual({ rol: "gerencia", usuarios: await gerenciaActiva(tx) });
      await expect(decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await decidirAjuste(b.gerencia, { ajusteId: id, aprueba: true }, o);
      expect(await ajusteDe(tx, id)).toMatchObject({ estado: "aprobado", decidido_por: b.gerencia.usuarioId, decidido_en: new Date(AHORA) });
    }));

  it("plan aprobado por el Admin SGC: decide un Admin SGC y no Gerencia; el Admin SGC que lo pidió no lo decide, y otro sí", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      const primero = await pedirAjuste(b.lider, reprogramar(h.id, a1), o);
      await expect(decidirAjuste(b.gerencia, { ajusteId: primero.id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await decidirAjuste(b.admin, { ajusteId: primero.id, aprueba: true }, o);

      const otro = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const segundo = await pedirAjuste(b.admin, reprogramar(h.id, a2), o);
      const deciden = await quienDecideAjustes(tx, h.id, b.admin.usuarioId);
      expect(deciden.rol).toBe("admin_sgc");
      expect(deciden.usuarios).toContain(otro.usuarioId);
      expect(deciden.usuarios).not.toContain(b.admin.usuarioId);
      await expect(decidirAjuste(b.admin, { ajusteId: segundo.id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await decidirAjuste(otro, { ajusteId: segundo.id, aprueba: true }, o);
      expect(await ajusteDe(tx, segundo.id)).toMatchObject({ estado: "aprobado", decidido_por: otro.usuarioId });
    }));

  it("si lo pidió el único Admin SGC activo, decide Gerencia", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx);
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'admin_sgc' AND id <> ${b.admin.usuarioId}`;
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(b.admin, reprogramar(h.id, ids[0]), o);
      expect(await quienDecideAjustes(tx, h.id, b.admin.usuarioId)).toEqual({ rol: "gerencia", usuarios: await gerenciaActiva(tx) });
      expect(await avisosDe(tx, b.gerencia.usuarioId, "mejora.ajuste_pedido")).toHaveLength(1);
      await expect(decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await decidirAjuste(b.gerencia, { ajusteId: id, aprueba: true }, o);
      expect((await ajusteDe(tx, id)).decidido_por).toBe(b.gerencia.usuarioId);
    }));

  it("un ajuste que no existe no existe; quien no decide ajustes no pasa de la matriz", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(responsable, reprogramar(h.id, ids[0]), o);
      await expect(decidirAjuste(b.admin, { ajusteId: 987654321, aprueba: true }, o)).rejects.toThrow(AJUSTE_NO_EXISTE);
      await expect(decidirAjuste(b.lider, { ajusteId: id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(decidirAjuste(b.control, { ajusteId: id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
    }));
});

describe("decidirAjuste", () => {
  it("reprogramar aprobado: el fin cambia, el original no, suma una reprogramación y borra las marcas; pendiente, sigue vencida", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const o = c(AHORA, tx);
      await tx`UPDATE mejora_actividades SET aviso_vencido_en = ${AHORA}, escalado_en = ${AHORA} WHERE id = ${a}`;
      await escalarAGerencia(b.admin, { actividadId: a, nota: NOTA_ESCALADA }, o);
      const { id } = await pedirAjuste(responsable, reprogramar(h.id, a), o);

      // Mientras se decide, la actividad sigue como está: vencida.
      expect((await misActividades(responsable, o)).find((x) => x.id === a)?.vencida).toBe(true);
      const leida = await leerActividad(responsable, a, o);
      expect(leida).toMatchObject({ vencida: true, fin: "2026-12-15", puedePedirAjuste: false });
      expect(leida?.ajustePendiente).toMatchObject({ id, tipo: "reprogramar", finNuevo: "2026-12-30" });

      await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      expect(await filaDe(tx, a)).toMatchObject({
        fin: "2026-12-30",
        fin_original: "2026-12-15",
        reprogramaciones: 1,
        aviso_vencido_en: null,
        escalado_en: null,
        gerencia_en: null,
      });
      expect((await misActividades(responsable, o)).find((x) => x.id === a)?.vencida).toBe(false);
      expect((await leerActividad(responsable, a, o))?.ajustePendiente).toBeNull();
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");

      // La transición `ajustar` lo registra con el id y el tipo del ajuste, sin la causa.
      const [e] = await eventosDe(tx, h.id, "ajustar");
      expect(e.detalle).toMatchObject({
        ajusteId: id,
        tipo: "reprogramar",
        actividadId: a,
        actividad: "A1.1",
        finAntes: "2026-12-15",
        finNuevo: "2026-12-30",
        estado: { antes: "en_ejecucion", despues: "en_ejecucion" },
      });
      const [bit] = await bitacoraDe(tx, "mejora_ajustar", h.id);
      expect(bit.detalle).toMatchObject({ ajusteId: id, tipo: "reprogramar", codigo: h.codigo });
      expect(JSON.stringify([e.detalle, bit.detalle])).not.toContain("existencias");
      // Quien pidió recibe la decisión, con el enlace a su actividad.
      const [aviso] = await avisosDe(tx, responsable.usuarioId, "mejora.ajuste_decidido");
      expect(aviso).toMatchObject({ titulo: "Se aprobó el ajuste que pidió", enlace: `/mejoramiento/actividades/${a}` });
      expect(aviso.cuerpo).not.toContain(h.codigo);
    }));

  it("agregar con el hallazgo por verificar lo devuelve a en ejecución; la actividad nueva nace con su fin original y su responsable lo sabe", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "por_verificar");
      const nuevo = await usuarioDePrueba(tx, { rol: "consulta" });
      const [accion] = await tx`SELECT id FROM mejora_acciones WHERE hallazgo_id = ${h.id}`;
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(b.lider, agregar(h.id, nuevaEn(Number(accion.id), nuevo.usuarioId)), o);
      expect(await participacionEnHallazgo(h.id, nuevo, { sql: tx })).toBeNull();

      await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      const despues = await bloquearHallazgo(tx, h.id);
      expect(despues.estado).toBe("en_ejecucion");
      const [a] = await tx`SELECT id, orden, estado, descripcion, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fin, 'YYYY-MM-DD') AS fin,
          to_char(fin_original, 'YYYY-MM-DD') AS fin_original
        FROM mejora_actividades WHERE hallazgo_id = ${h.id} AND responsable_id = ${nuevo.usuarioId}`;
      expect(a).toMatchObject({ orden: 2, estado: "abierta", inicio: HOY, fin: "2026-12-30", fin_original: "2026-12-30" });
      expect((await ajusteDe(tx, id)).actividad_id).toBe(a.id);
      expect(await participacionEnHallazgo(h.id, nuevo, { sql: tx })).toBe("actividad");
      const [e] = await eventosDe(tx, h.id, "ajustar");
      expect(e.detalle).toMatchObject({ ajusteId: id, tipo: "agregar", actividadId: a.id, actividad: "A1.2", estado: { antes: "por_verificar", despues: "en_ejecucion" } });
      // Un solo aviso a su responsable: el de la actividad a su cargo, no también el del turno.
      const avisos = await avisosDe(tx, nuevo.usuarioId, "mejora.actividad_asignada");
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ enlace: `/mejoramiento/actividades/${a.id}`, entidad: "mejora_actividad", entidad_id: a.id });
      expect(await avisosDe(tx, nuevo.usuarioId, "mejora.turno")).toHaveLength(0);
    }));

  it("agregar en una acción nueva: la acción entra al final de la ronda con las causas que ataca", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h } = await enEjecucion(tx);
      const [causa] = await tx`SELECT id FROM mejora_causas WHERE hallazgo_id = ${h.id} ORDER BY id LIMIT 1`;
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(
        b.lider,
        agregar(h.id, {
          accion: { tipo: "correctiva", descripcion: "Instalar un termómetro con registro automático", causaIds: [Number(causa.id)] },
          descripcion: "Comprar e instalar el equipo",
          responsableId: responsable.usuarioId,
          inicio: HOY,
          fin: "2027-01-15",
        }),
        o,
      );
      await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      const [ac] = await tx`SELECT id, orden, tipo, descripcion FROM mejora_acciones WHERE hallazgo_id = ${h.id} ORDER BY orden DESC LIMIT 1`;
      expect(ac).toMatchObject({ orden: 2, tipo: "correctiva", descripcion: "Instalar un termómetro con registro automático" });
      const vinculos = await tx`SELECT causa_id FROM mejora_accion_causas WHERE accion_id = ${ac.id}`;
      expect(vinculos.map((v) => Number(v.causa_id))).toEqual([Number(causa.id)]);
      const [a] = await tx`SELECT orden, to_char(fin_original, 'YYYY-MM-DD') AS fin_original FROM mejora_actividades WHERE accion_id = ${ac.id}`;
      expect(a).toEqual({ orden: 1, fin_original: "2027-01-15" });
      const [e] = await eventosDe(tx, h.id, "ajustar");
      expect(e.detalle).toMatchObject({ tipo: "agregar", actividad: "A2.1", accion: "A2", accionNueva: true });
    }));

  it("cancelar la última sin terminar lleva a por verificar; la única actividad no cancelada no se cancela", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      await terminar(tx, responsable, a1);
      const { id } = await pedirAjuste(b.lider, cancelar(h.id, a2), o);
      await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      expect(await filaDe(tx, a2)).toMatchObject({ estado: "cancelada", cancelada_en: new Date(AHORA) });
      const [fila] = await tx`SELECT estado, vence_en FROM mejora_hallazgos WHERE id = ${h.id}`;
      expect(fila.estado).toBe("por_verificar");
      expect(fila.vence_en.toISOString()).toBe(venceEn("verificar", new Date(AHORA), await contextoDeMejora(tx, new Date(AHORA))).toISOString());

      const otro = await enEjecucion(tx);
      await expect(pedirAjuste(otro.b.lider, cancelar(otro.h.id, otro.ids[0]), o)).rejects.toThrow("No se puede cancelar la única actividad del hallazgo");
    }));

  it("dos cancelaciones pendientes de las dos únicas actividades: la segunda no se aprueba", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      const primera = await pedirAjuste(b.lider, cancelar(h.id, a1), o);
      const segunda = await pedirAjuste(b.lider, cancelar(h.id, a2), o);
      await decidirAjuste(b.admin, { ajusteId: primera.id, aprueba: true }, o);
      await expect(decidirAjuste(b.admin, { ajusteId: segunda.id, aprueba: true }, o)).rejects.toThrow(
        "No se puede cancelar la única actividad del hallazgo",
      );
      expect((await filaDe(tx, a2)).estado).toBe("abierta");
      expect((await ajusteDe(tx, segunda.id)).estado).toBe("pendiente");
      // Negarla sí se puede.
      await decidirAjuste(b.admin, { ajusteId: segunda.id, aprueba: false, nota: NOTA }, o);
    }));

  it("negar: el ajuste queda negado con su nota y su acta, y nada más cambia", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const o = c(AHORA, tx);
      const antes = await filaDe(tx, a);
      const { id } = await pedirAjuste(responsable, reprogramar(h.id, a), o);
      await expect(decidirAjuste(b.admin, { ajusteId: id, aprueba: false }, o)).rejects.toThrow("La nota debe tener al menos 10 caracteres");
      await expect(decidirAjuste(b.admin, { ajusteId: id, aprueba: false, nota: "Corta" }, o)).rejects.toThrow(
        "La nota debe tener al menos 10 caracteres",
      );
      await expect(
        decidirAjuste(b.admin, { ajusteId: id, aprueba: false, nota: NOTA, acta: { numero: "07-2026", fecha: "2026-12-17" } }, o),
      ).rejects.toThrow("La fecha del acta no puede ser futura");
      await decidirAjuste(b.admin, { ajusteId: id, aprueba: false, nota: NOTA, acta: { numero: "07-2026", fecha: "2026-12-15" } }, o);
      const ajuste = await tx`SELECT estado, nota, decidido_por, acta_numero, to_char(acta_fecha, 'YYYY-MM-DD') AS acta_fecha
        FROM mejora_ajustes WHERE id = ${id}`;
      expect(ajuste[0]).toEqual({ estado: "negado", nota: NOTA, decidido_por: b.admin.usuarioId, acta_numero: "07-2026", acta_fecha: "2026-12-15" });
      expect(await filaDe(tx, a)).toEqual(antes);
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      expect(await eventosDe(tx, h.id, "ajustar")).toHaveLength(0);
      const [e] = await eventosDe(tx, h.id, "ajuste_negado");
      expect(e.detalle).toEqual({
        ajusteId: id,
        tipo: "reprogramar",
        actividadId: a,
        actividad: "A1.1",
        finAntes: "2026-12-15",
        finNuevo: "2026-12-30",
        acta: { numero: "07-2026", fecha: "2026-12-15" },
      });
      const [bit] = await bitacoraDe(tx, "mejora_ajuste_negado", h.id);
      expect(bit.detalle).toMatchObject({ codigo: h.codigo, ajusteId: id, tipo: "reprogramar" });
      expect(JSON.stringify([e.detalle, bit.detalle])).not.toContain("Comité revisó");
      const [aviso] = await avisosDe(tx, responsable.usuarioId, "mejora.ajuste_decidido");
      expect(aviso.titulo).toBe("Se negó el ajuste que pidió");
    }));

  it("lo congelado no cambia: tras los tres ajustes, el cierre previsto, las fechas originales y el plan aprobado son los mismos", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids, accionId } = await enEjecucion(tx, 3);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      const congelado = async () =>
        (
          await tx`SELECT detalle::text AS texto FROM mejora_eventos
            WHERE hallazgo_id = ${h.id} AND tipo IN ('revisar_plan', 'aprobar_plan') AND detalle->'plan' IS NOT NULL ORDER BY id`
        ).map((f) => f.texto as string);
      const ronda = async () => (await tx`SELECT cierre_previsto, aprobado_en, aprobado_rol FROM mejora_rondas WHERE hallazgo_id = ${h.id}`)[0];
      const originales = async () =>
        tx`SELECT id, to_char(fin_original, 'YYYY-MM-DD') AS fin_original FROM mejora_actividades WHERE id = ANY(${ids}) ORDER BY id`;
      const [planAntes, rondaAntes, finesAntes] = [await congelado(), await ronda(), await originales()];
      expect(planAntes).toHaveLength(1);

      for (const pedido of [reprogramar(h.id, a1), cancelar(h.id, a2), agregar(h.id, nuevaEn(accionId, responsable.usuarioId))]) {
        const { id } = await pedirAjuste(b.lider, pedido, o);
        await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      }
      expect(await congelado()).toEqual(planAntes);
      expect(await ronda()).toEqual(rondaAntes);
      expect(await originales()).toEqual(finesAntes);
      expect(await eventosDe(tx, h.id, "ajustar")).toHaveLength(3);
    }));

  it("dos decisiones a la vez: la segunda lanza «Ese ajuste ya se decidió» y no deja un evento de más", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const otro = await usuarioDePrueba(tx, { rol: "admin_sgc" });
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(b.lider, reprogramar(h.id, a), o);
      await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      await expect(decidirAjuste(otro, { ajusteId: id, aprueba: true }, o)).rejects.toThrow("Ese ajuste ya se decidió");
      await expect(decidirAjuste(otro, { ajusteId: id, aprueba: false, nota: NOTA }, o)).rejects.toThrow("Ese ajuste ya se decidió");
      expect(await eventosDe(tx, h.id, "ajustar")).toHaveLength(1);
      expect(await eventosDe(tx, h.id, "ajuste_negado")).toHaveLength(0);
      expect((await filaDe(tx, a)).reprogramaciones).toBe(1);
      expect(await ajusteDe(tx, id)).toMatchObject({ estado: "aprobado", decidido_por: b.admin.usuarioId });
    }));

  it("la página lee los ajustes de la ronda: qué se pidió, por qué, quién y si quien mira lo decide", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      const pendiente = await pedirAjuste(responsable, reprogramar(h.id, a1), o);
      const negado = await pedirAjuste(b.lider, cancelar(h.id, a2), o);
      await decidirAjuste(b.admin, { ajusteId: negado.id, aprueba: false, nota: NOTA }, o);
      const delAdmin = await leerHallazgo(b.admin, h.id, { sql: tx, ahora: new Date(AHORA) });
      const [p, n] = delAdmin?.rondas[0].ajustes ?? [];
      expect(p).toMatchObject({
        id: pendiente.id,
        tipo: "reprogramar",
        estado: "pendiente",
        actividadId: a1,
        causa: CAUSA,
        pedidoPor: responsable.nombre,
        decididoPor: null,
        cambio: { tipo: "reprogramar", finAntes: "2026-12-15", finNuevo: "2026-12-30" },
        puedeDecidir: true,
      });
      expect(n).toMatchObject({ id: negado.id, tipo: "cancelar", estado: "negado", nota: NOTA, decididoPor: b.admin.nombre, puedeDecidir: false });
      expect((await leerHallazgo(b.gerencia, h.id, { sql: tx, ahora: new Date(AHORA) }))?.rondas[0].ajustes[0].puedeDecidir).toBe(false);
    }));

  it("el contenido de los ajustes, solo a quien ve el hallazgo completo; el responsable lee los de su actividad en la página de ella", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx, 2);
      const [suya, ajena] = ids;
      const otro = await usuarioDePrueba(tx, { rol: "consulta" });
      await tx`UPDATE mejora_actividades SET responsable_id = ${otro.usuarioId} WHERE id = ${ajena}`;
      const o = c(AHORA, tx);
      const propio = await pedirAjuste(responsable, reprogramar(h.id, suya), o);
      const deOtro = await pedirAjuste(b.lider, cancelar(h.id, ajena), o);
      const comoActividad = await leerHallazgo(responsable, h.id, { sql: tx, ahora: new Date(AHORA) });
      expect(comoActividad?.ve).toBe("actividad");
      expect(comoActividad?.rondas[0].ajustes).toEqual([]);
      expect((await leerHallazgo(b.lider, h.id, { sql: tx, ahora: new Date(AHORA) }))?.rondas[0].ajustes.map((x) => x.id)).toEqual([
        propio.id,
        deOtro.id,
      ]);
      const leida = await leerActividad(responsable, suya, o);
      expect(leida?.ajustes.map((x) => x.id)).toEqual([propio.id]);
      expect(leida?.ajustes[0]).toMatchObject({ causa: CAUSA, pedidoPor: responsable.nombre, estado: "pendiente", puedeDecidir: false });
      expect((await leerActividad(otro, ajena, o))?.ajustes.map((x) => x.id)).toEqual([deOtro.id]);
    }));

  it("aprobar vuelve a mirar las fechas: una fecha que ya pasó en la zona no se aprueba y nada se escribe; negar, sí", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids, accionId } = await enEjecucion(tx, 2);
      const [a1, a2] = ids;
      const o = c(AHORA, tx);
      const reprogramacion = await pedirAjuste(responsable, reprogramar(h.id, a1, "2026-12-17"), o);
      const nueva = await pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId, { fin: "2026-12-17" })), o);
      const otra = await pedirAjuste(responsable, reprogramar(h.id, a2, "2026-12-17"), o);
      const pasado = c(MADRUGADA_DEL_18, tx);
      await expect(decidirAjuste(b.admin, { ajusteId: reprogramacion.id, aprueba: true }, pasado)).rejects.toThrow(FECHA_PASADA);
      await expect(decidirAjuste(b.admin, { ajusteId: nueva.id, aprueba: true }, pasado)).rejects.toThrow(FECHA_PASADA);
      expect((await ajusteDe(tx, reprogramacion.id)).estado).toBe("pendiente");
      expect((await ajusteDe(tx, nueva.id)).estado).toBe("pendiente");
      expect((await filaDe(tx, a1)).fin).toBe("2026-12-15");
      expect((await tx`SELECT count(*)::int AS n FROM mejora_actividades WHERE hallazgo_id = ${h.id}`)[0].n).toBe(2);
      expect(await eventosDe(tx, h.id, "ajustar")).toHaveLength(0);
      await decidirAjuste(b.admin, { ajusteId: otra.id, aprueba: false, nota: NOTA }, pasado);
      // A las 22:00 del 17 en la zona (ya el 18 en UTC) la fecha todavía no pasó: se aprueban.
      const aTiempo = c(NOCHE_DEL_17, tx);
      await decidirAjuste(b.admin, { ajusteId: reprogramacion.id, aprueba: true }, aTiempo);
      await decidirAjuste(b.admin, { ajusteId: nueva.id, aprueba: true }, aTiempo);
      expect((await filaDe(tx, a1)).fin).toBe("2026-12-17");
      expect(await eventosDe(tx, h.id, "ajustar")).toHaveLength(2);
    }));

  it("una acción lleva treinta actividades como máximo, también al añadir una por un ajuste (al pedirlo y al aprobarlo)", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids, accionId } = await enEjecucion(tx);
      for (let i = 0; i < 28; i++) await actividadPorSql(tx, h.id, responsable.usuarioId, { accionDe: ids[0] });
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId)), o);
      await actividadPorSql(tx, h.id, responsable.usuarioId, { accionDe: ids[0] });
      await expect(pedirAjuste(b.lider, agregar(h.id, nuevaEn(accionId, responsable.usuarioId)), o)).rejects.toThrow(TREINTA);
      await expect(decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o)).rejects.toThrow(TREINTA);
      expect((await ajusteDe(tx, id)).estado).toBe("pendiente");
    }));

  it("anular el hallazgo deja negados sus ajustes pendientes, a nombre de quien anula; los decididos no cambian", () =>
    revertida(sql, async (tx) => {
      const { b, responsable, h, ids } = await enEjecucion(tx, 3);
      const o = c(AHORA, tx);
      const p1 = await pedirAjuste(responsable, reprogramar(h.id, ids[0]), o);
      const p2 = await pedirAjuste(b.lider, cancelar(h.id, ids[1]), o);
      const decidido = await pedirAjuste(responsable, reprogramar(h.id, ids[2]), o);
      await decidirAjuste(b.admin, { ajusteId: decidido.id, aprueba: false, nota: NOTA }, o);
      await anularHallazgo(b.admin, { hallazgoId: h.id, justificacion: "Era un duplicado de otro hallazgo del proceso" }, c(LUEGO, tx));
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("anulado");
      for (const id of [p1.id, p2.id]) {
        expect(await ajusteDe(tx, id)).toMatchObject({
          estado: "negado",
          decidido_por: b.admin.usuarioId,
          decidido_en: new Date(LUEGO),
          nota: "Se anuló el hallazgo",
        });
      }
      expect(await ajusteDe(tx, decidido.id)).toMatchObject({ estado: "negado", nota: NOTA, decidido_en: new Date(AHORA) });
    }));
});

describe("quién decide si falta una segunda persona", () => {
  it("plan aprobado por Gerencia y lo pidió el único usuario de Gerencia activo (responsable de la actividad): decide el Admin SGC", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion", { criticidad: "alta" }, { responsableId: b.gerencia.usuarioId });
      const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id}`;
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'gerencia' AND id <> ${b.gerencia.usuarioId}`;
      const o = c(AHORA, tx);
      const { id } = await pedirAjuste(b.gerencia, reprogramar(h.id, Number(a.id)), o);
      const deciden = await quienDecideAjustes(tx, h.id, b.gerencia.usuarioId);
      expect(deciden.rol).toBe("admin_sgc");
      expect(deciden.usuarios).toContain(b.admin.usuarioId);
      await expect(decidirAjuste(b.gerencia, { ajusteId: id, aprueba: true }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await decidirAjuste(b.admin, { ajusteId: id, aprueba: true }, o);
      expect((await ajusteDe(tx, id)).decidido_por).toBe(b.admin.usuarioId);
    }));
});

describe("escalar a Gerencia", () => {
  it("solo una actividad vencida, solo el Admin SGC; deja la marca, el evento y un aviso a cada usuario de Gerencia, sin cambiar estados", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      const o = c(AHORA, tx);
      await expect(escalarAGerencia(b.admin, { actividadId: a, nota: NOTA_ESCALADA }, c(ANTES, tx))).rejects.toThrow(
        "Solo se escala una actividad vencida",
      );
      await expect(escalarAGerencia(b.lider, { actividadId: a, nota: NOTA_ESCALADA }, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(escalarAGerencia(b.admin, { actividadId: a, nota: "Corta" }, o)).rejects.toThrow("La nota debe tener al menos 10 caracteres");
      const antes = await filaDe(tx, a);
      const [hAntes] = await tx`SELECT estado, vence_en FROM mejora_hallazgos WHERE id = ${h.id}`;

      await escalarAGerencia(b.admin, { actividadId: a, nota: NOTA_ESCALADA }, o);
      const fila = await filaDe(tx, a);
      expect(fila.gerencia_en).toEqual(new Date(AHORA));
      expect({ ...fila, gerencia_en: null }).toEqual(antes);
      expect((await tx`SELECT estado, vence_en FROM mejora_hallazgos WHERE id = ${h.id}`)[0]).toEqual(hAntes);
      const [e] = await eventosDe(tx, h.id, "escalada");
      expect(e).toEqual({ detalle: { actividadId: a, actividad: "A1.1", nota: NOTA_ESCALADA }, usuario_id: b.admin.usuarioId });
      const [bit] = await bitacoraDe(tx, "mejora_escalada", a);
      expect(bit.entidad).toBe("mejora_actividad");
      expect(bit.detalle).toMatchObject({ codigo: h.codigo, actividad: "A1.1" });
      expect(JSON.stringify(bit.detalle)).not.toContain("proveedor");
      for (const g of await gerenciaActiva(tx)) {
        const avisos = await avisosDe(tx, g, "mejora.escalada");
        expect(avisos).toHaveLength(1);
        expect(avisos[0]).toMatchObject({ enlace: `/mejoramiento/actividades/${a}`, entidad: "mejora_actividad", entidad_id: a });
      }
      // Ya escalada, no se escala otra vez.
      await expect(escalarAGerencia(b.admin, { actividadId: a, nota: NOTA_ESCALADA }, o)).rejects.toThrow("La actividad ya está escalada a Gerencia");
      expect((await leerActividad(b.admin, a, o))?.gerenciaEn).toEqual(new Date(AHORA));
    }));

  it("Gerencia responde la escalada con su nota y el acta: queda en el evento, una sola vez", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx, 2);
      const [a, sinEscalar] = ids;
      const o = c(AHORA, tx);
      await escalarAGerencia(b.admin, { actividadId: a, nota: NOTA_ESCALADA }, o);
      const respuesta = { actividadId: a, nota: RESPUESTA, acta: { numero: "12-2026", fecha: HOY } };
      await expect(responderEscalada(b.admin, respuesta, o)).rejects.toBeInstanceOf(ErrorPermiso);
      await expect(responderEscalada(b.gerencia, { ...respuesta, actividadId: sinEscalar }, o)).rejects.toThrow(
        "Esa actividad no está escalada a Gerencia",
      );
      await responderEscalada(b.gerencia, respuesta, o);
      const [e] = await eventosDe(tx, h.id, "escalada_respondida");
      expect(e).toEqual({
        detalle: { actividadId: a, actividad: "A1.1", nota: RESPUESTA, acta: { numero: "12-2026", fecha: HOY } },
        usuario_id: b.gerencia.usuarioId,
      });
      const [bit] = await bitacoraDe(tx, "mejora_escalada_respondida", a);
      expect(bit.detalle).toMatchObject({ codigo: h.codigo, actividad: "A1.1", acta: { numero: "12-2026", fecha: HOY } });
      expect(JSON.stringify(bit.detalle)).not.toContain("proveedor");
      await expect(responderEscalada(b.gerencia, respuesta, o)).rejects.toThrow("Esa escalada ya tiene respuesta");
      expect((await bloquearHallazgo(tx, h.id)).estado).toBe("en_ejecucion");
      // Quien escaló recibe la respuesta, con el enlace a la actividad y sin el contenido del hallazgo ni la nota.
      const avisos = await avisosDe(tx, b.admin.usuarioId, "mejora.escalada_respondida");
      expect(avisos).toHaveLength(1);
      expect(avisos[0]).toMatchObject({ enlace: `/mejoramiento/actividades/${a}`, entidad: "mejora_actividad", entidad_id: a });
      expect(JSON.stringify(avisos[0])).not.toMatch(/Formatos de entrega|rubro de dotación/);
    }));

  it("sin ningún usuario de Gerencia activo no se escala, y nada se escribe", () =>
    revertida(sql, async (tx) => {
      const { b, h, ids } = await enEjecucion(tx);
      const [a] = ids;
      await tx`UPDATE usuarios SET activo = false WHERE rol = 'gerencia'`;
      await expect(escalarAGerencia(b.admin, { actividadId: a, nota: NOTA_ESCALADA }, c(AHORA, tx))).rejects.toThrow(
        "No hay ningún usuario de Gerencia activo a quien escalar",
      );
      expect((await filaDe(tx, a)).gerencia_en).toBeNull();
      expect(await eventosDe(tx, h.id, "escalada")).toHaveLength(0);
    }));
});
