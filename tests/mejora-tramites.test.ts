/**
 * El cambio documental desde una actividad (Fase 15B, anexo §9; Tarea 12): pedir un trámite desde una actividad de un plan aprobado
 * (`crearSolicitud` con `actividadId`, que escribe el trámite y el enlace juntos o no escribe nada), enlazar uno que ya existe, quitar
 * un enlace, lo que se ve de cada trámite y la publicación de un trámite enlazado a un hallazgo ya cerrado (Review Focus 3). Contra la
 * BD de trabajo, dentro de una transacción que se revierte; los ids se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { registrarSeguimiento, terminarActividad } from "@/db/consultas/mejoramiento/actividades";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import { anularHallazgo, type DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import {
  actividadDelTramite,
  candidatosParaEnlazar,
  datosParaPedir,
  enlazarTramite,
  quitarEnlace,
  TERMINO_BIEN,
  tramitesDeActividades,
} from "@/db/consultas/mejoramiento/tramites-enlace";
import { revisarVencimientosDeMejoramiento } from "@/db/consultas/mejoramiento/vencimientos";
import { crearSolicitud, transicionar } from "@/db/consultas/tramites-flujo";
import { ACTIVIDAD_NO_ADMITE, TRAMITE_NO_SIRVE } from "@/lib/mejoramiento/enganches";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  evidenciaDeActividad,
  hallazgoEn,
  llevarHasta,
  otroProcesoConLider,
  planDePrueba,
  silenciarMejoramiento,
  terminarTodas,
  tramiteEnlazado,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { documentoLibre, opc, tipoLibre, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(() => sql.end());

// El hallazgo se detecta el martes 3 de noviembre de 2026; su plan se aprueba el 17 (`hallazgoEn`) y se pide el 18 a las 10:00.
const DETECTADO = "2026-11-03";
const PIDE = "2026-11-18T15:00:00Z";
const DESCRIPCION = "Actividad 1 del plan de prueba";
const JUSTIFICACION = "Se crea el formato de entrega del turno de noche que pide la actividad";

type Escena = { b: BaseDeMejora; h: { id: number; codigo: string }; actividadId: number; tipoDocumentoId: number };

/** Un hallazgo «En ejecución», detectado el 3 de noviembre, con una actividad de quien solo consulta (`b.consulta`). */
async function escena(tx: TransactionSql, cambios?: Partial<DatosDeHallazgo>, b?: BaseDeMejora): Promise<Escena> {
  const base = b ?? (await baseDeMejora(tx));
  const h = await hallazgoEn(tx, base, "en_ejecucion", { detectadoEn: DETECTADO, ...cambios }, { responsableId: base.consulta.usuarioId });
  const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${h.id} ORDER BY id LIMIT 1`;
  return { b: base, h, actividadId: Number(a.id), tipoDocumentoId: await tipoLibre(tx) };
}

/** Pide, como `quien`, crear un formato en el proceso del hallazgo; con `actividadId`, desde esa actividad. */
function pedir(tx: TransactionSql, e: Escena, quien: SesionFlujo, x: { actividadId?: number; procesoId?: number } = {}, ahora = PIDE) {
  return crearSolicitud(
    quien,
    {
      tipo: "crear",
      motivo: "no_conformidad",
      justificacion: JUSTIFICACION,
      procesoId: x.procesoId ?? e.b.procesoId,
      tipoDocumentoId: e.tipoDocumentoId,
      tituloPropuesto: "Formato de entrega del turno de noche",
      ...(x.actividadId === undefined ? {} : { actividadId: x.actividadId }),
    },
    c(ahora, tx),
  );
}

const cuantosTramites = async (tx: TransactionSql) => Number((await tx`SELECT count(*)::int AS n FROM tramites`)[0].n);
const enlacesDe = (tx: TransactionSql, actividadId: number) =>
  tx`SELECT id, hallazgo_id, actividad_id, tramite_id, origen, enlazado_por, enlazado_en, avisado_en
    FROM mejora_actividad_tramites WHERE actividad_id = ${actividadId} ORDER BY id`;
const eventosDe = (tx: TransactionSql, hallazgoId: number, tipo: string) =>
  tx`SELECT detalle, usuario_id, ronda FROM mejora_eventos WHERE hallazgo_id = ${hallazgoId} AND tipo = ${tipo} ORDER BY id`;
const bitacoraDe = (tx: TransactionSql, accion: string, entidadId: number) =>
  tx`SELECT usuario_id, entidad, detalle FROM auditoria WHERE accion = ${accion} AND entidad_id = ${entidadId} ORDER BY id`;

describe("crearSolicitud desde una actividad (anexo §9.2)", () => {
  it("el líder del proceso pide: nacen juntos el trámite y el enlace «pedido», con su evento en el hallazgo y su bitácora", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const { tramiteId } = await pedir(tx, e, e.b.lider, { actividadId: e.actividadId });
      const [enlace, ...mas] = await enlacesDe(tx, e.actividadId);
      expect(mas).toHaveLength(0);
      expect(enlace).toMatchObject({
        hallazgo_id: e.h.id,
        tramite_id: tramiteId,
        origen: "pedido",
        enlazado_por: e.b.lider.usuarioId,
        avisado_en: null,
      });
      expect(enlace.enlazado_en).toEqual(new Date(PIDE));
      const [evento, ...otros] = await eventosDe(tx, e.h.id, "tramite_enlazado");
      expect(otros).toHaveLength(0);
      expect(evento).toMatchObject({ usuario_id: e.b.lider.usuarioId, detalle: { actividadId: e.actividadId, tramiteId, origen: "pedido" } });
      // La bitácora: la solicitud dice de qué actividad nace, y el enlace queda en la de la actividad; ninguna lleva el texto libre.
      const [solicitud] = await bitacoraDe(tx, "tramite_solicitar", tramiteId);
      expect(solicitud.detalle).toMatchObject({ actividadId: e.actividadId });
      const [enlazado] = await bitacoraDe(tx, "mejora_tramite_enlazado", e.actividadId);
      expect(enlazado).toMatchObject({ entidad: "mejora_actividad", detalle: { tramiteId, origen: "pedido", codigo: e.h.codigo } });
      for (const fila of [solicitud, enlazado]) {
        expect(JSON.stringify(fila.detalle)).not.toContain(JUSTIFICACION);
        expect(JSON.stringify(fila.detalle)).not.toContain(DESCRIPCION);
      }
    }));

  it("una actividad que no admite el pedido rechaza la solicitud entera con un solo mensaje, y no escribe nada", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const b = e.b;
      // Las seis causas sobre las que se puede pedir y la que no existe.
      const terminada = Number((await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin_original, fin, estado, avance, terminada_en, terminada_por)
        SELECT hallazgo_id, accion_id, 2, 'Otra actividad terminada', responsable_id, inicio, fin_original, fin, 'terminada', 100, ${new Date(PIDE)}, responsable_id
        FROM mejora_actividades WHERE id = ${e.actividadId} RETURNING id`)[0].id);
      const cancelada = Number((await tx`INSERT INTO mejora_actividades (hallazgo_id, accion_id, orden, descripcion, responsable_id, inicio, fin_original, fin, estado, cancelada_en)
        SELECT hallazgo_id, accion_id, 3, 'Otra actividad cancelada', responsable_id, inicio, fin_original, fin, 'cancelada', ${new Date(PIDE)}
        FROM mejora_actividades WHERE id = ${e.actividadId} RETURNING id`)[0].id);
      const borrador = await hallazgoEn(tx, b, "por_formular", { detectadoEn: DETECTADO });
      await planDePrueba(tx, b, borrador.id, { responsableId: b.consulta.usuarioId });
      const [deBorrador] = await tx`SELECT a.id FROM mejora_actividades a WHERE a.hallazgo_id = ${borrador.id} AND a.fin_original IS NULL`;
      const anulado = await escena(tx, undefined, b);
      await anularHallazgo(b.admin, { hallazgoId: anulado.h.id, justificacion: "Se registró dos veces el mismo hecho" }, c(PIDE, tx));
      const { id: cargado } = await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, b.consulta.usuarioId), c(PIDE, tx));
      const [deCarga] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${cargado} AND estado <> 'terminada' ORDER BY id LIMIT 1`;
      const otro = await otroProcesoConLider(tx);
      const casos: Array<[string, SesionFlujo, number, number?]> = [
        ["terminada", b.lider, terminada],
        ["cancelada", b.lider, cancelada],
        ["de un borrador", b.lider, Number(deBorrador.id)],
        ["de un hallazgo terminado", b.lider, anulado.actividadId],
        ["de una carga sin su formato", b.admin, Number(deCarga.id)],
        ["que la persona no ve", otro.lider, e.actividadId, otro.procesoId],
        ["que no existe", b.lider, 2_000_000_000],
      ];
      for (const [causa, quien, actividadId, procesoId] of casos) {
        const antes = await cuantosTramites(tx);
        await expect(pedir(tx, e, quien, { actividadId, procesoId }), causa).rejects.toThrow(ACTIVIDAD_NO_ADMITE);
        expect(await cuantosTramites(tx), causa).toBe(antes);
        expect(await enlacesDe(tx, actividadId), causa).toHaveLength(0);
      }
    }));

  it("sin actividad, crearSolicitud hace exactamente lo de antes: ningún enlace, ningún evento del hallazgo", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const enlaces = Number((await tx`SELECT count(*)::int AS n FROM mejora_actividad_tramites`)[0].n);
      const { tramiteId, etapa } = await pedir(tx, e, e.b.lider);
      expect(etapa).toBe("aceptacion");
      expect(Number((await tx`SELECT count(*)::int AS n FROM mejora_actividad_tramites`)[0].n)).toBe(enlaces);
      expect(await eventosDe(tx, e.h.id, "tramite_enlazado")).toHaveLength(0);
      const [solicitud] = await bitacoraDe(tx, "tramite_solicitar", tramiteId);
      expect(solicitud.detalle).not.toHaveProperty("actividadId");
      expect(await actividadDelTramite(e.b.admin, tramiteId, { sql: tx })).toBeNull();
    }));
});

describe("datosParaPedir (anexo §9.2)", () => {
  it("trae el documento que el hallazgo cita, el motivo por su clase y la descripción de la actividad; nunca el texto del hallazgo", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const [p] = await tx`SELECT sigla FROM procesos WHERE id = ${b.procesoId}`;
      await tipoLibre(tx);
      const documento = await documentoLibre(tx, { proceso: p.sigla as string, tipo: "ZP" });
      const nc = await escena(tx, { documentoId: documento.id }, b);
      const datos = await datosParaPedir(b.lider, nc.actividadId, c(PIDE, tx));
      expect(datos).toEqual({ actividadId: nc.actividadId, documentoCodigo: documento.codigo, motivo: "no_conformidad", justificacion: DESCRIPCION });
      const [h] = await tx`SELECT titulo, descripcion FROM mejora_hallazgos WHERE id = ${nc.h.id}`;
      expect(JSON.stringify(datos)).not.toContain(h.titulo as string);
      expect(JSON.stringify(datos)).not.toContain(h.descripcion as string);
      // Una observación sin documento: el motivo es la mejora.
      const obs = await escena(tx, { clase: "observacion", criticidad: null }, b);
      expect(await datosParaPedir(b.lider, obs.actividadId, c(PIDE, tx))).toEqual({
        actividadId: obs.actividadId,
        documentoCodigo: null,
        motivo: "mejora",
        justificacion: DESCRIPCION,
      });
      expect(await datosParaPedir(b.admin, obs.actividadId, c(PIDE, tx))).not.toBeNull();
    }));

  it("es nulo para su responsable, que no solicita trámites, para quien no ve la actividad y para la que no admite el pedido", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      expect(await datosParaPedir(e.b.consulta, e.actividadId, c(PIDE, tx))).toBeNull();
      const otro = await otroProcesoConLider(tx);
      expect(await datosParaPedir(otro.lider, e.actividadId, c(PIDE, tx))).toBeNull();
      expect(await datosParaPedir(e.b.lider, 2_000_000_000, c(PIDE, tx))).toBeNull();
      await tx`UPDATE mejora_actividades SET estado = 'cancelada', cancelada_en = ${new Date(PIDE)} WHERE id = ${e.actividadId}`;
      expect(await datosParaPedir(e.b.lider, e.actividadId, c(PIDE, tx))).toBeNull();
    }));
});

describe("enlazar un trámite que ya existe (anexo §9.3)", () => {
  it("se enlaza uno en curso que la persona ve, solicitado desde el día en que se detectó; lo ofrece el selector", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      // El mismo día de la detección cuenta (en la zona de la instalación).
      const { tramiteId } = await pedir(tx, e, e.b.lider, {}, "2026-11-03T22:00:00Z");
      const candidatos = await candidatosParaEnlazar(e.b.lider, e.actividadId, undefined, c(PIDE, tx));
      expect(candidatos.map((t) => t.id)).toContain(tramiteId);
      const [candidato] = candidatos.filter((t) => t.id === tramiteId);
      expect(candidato).toMatchObject({ tipo: "crear", etapa: "aceptacion" });
      expect(candidato.solicitadoEn).toEqual(new Date("2026-11-03T22:00:00Z"));
      await enlazarTramite(e.b.lider, { actividadId: e.actividadId, tramiteId }, c(PIDE, tx));
      const [enlace] = await enlacesDe(tx, e.actividadId);
      expect(enlace).toMatchObject({ tramite_id: tramiteId, origen: "enlazado", enlazado_por: e.b.lider.usuarioId });
      const [evento] = await eventosDe(tx, e.h.id, "tramite_enlazado");
      expect(evento.detalle).toMatchObject({ actividadId: e.actividadId, tramiteId, origen: "enlazado" });
      const [bitacora] = await bitacoraDe(tx, "mejora_tramite_enlazado", e.actividadId);
      expect(bitacora.detalle).toMatchObject({ tramiteId, origen: "enlazado" });
      // Ya enlazado, el selector no lo ofrece otra vez, ni a esta actividad ni a otra.
      expect((await candidatosParaEnlazar(e.b.lider, e.actividadId, undefined, c(PIDE, tx))).map((t) => t.id)).not.toContain(tramiteId);
    }));

  it("uno ya enlazado, rechazado o cancelado, anterior a la detección o que la persona no ve: TRAMITE_NO_SIRVE, el mismo mensaje", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otraActividad = await escena(tx, undefined, e.b);
      const ya = await pedir(tx, e, e.b.lider, { actividadId: otraActividad.actividadId });
      const rechazado = await pedir(tx, e, e.b.lider);
      await tx`UPDATE tramites SET etapa = 'rechazado', cerrado_en = ${new Date(PIDE)} WHERE id = ${rechazado.tramiteId}`;
      const cancelado = await pedir(tx, e, e.b.lider);
      await tx`UPDATE tramites SET etapa = 'cancelado', cerrado_en = ${new Date(PIDE)} WHERE id = ${cancelado.tramiteId}`;
      const anterior = await pedir(tx, e, e.b.lider, {}, "2026-11-02T22:00:00Z");
      const otro = await otroProcesoConLider(tx);
      const ajeno = await pedir(tx, e, otro.lider, { procesoId: otro.procesoId });
      const casos: Array<[string, number]> = [
        ["ya enlazado a otra actividad", ya.tramiteId],
        ["rechazado", rechazado.tramiteId],
        ["cancelado", cancelado.tramiteId],
        ["solicitado antes de la detección", anterior.tramiteId],
        ["que la persona no ve", ajeno.tramiteId],
      ];
      const ofrecidos = (await candidatosParaEnlazar(e.b.lider, e.actividadId, undefined, c(PIDE, tx))).map((t) => t.id);
      for (const [causa, tramiteId] of casos) {
        await expect(enlazarTramite(e.b.lider, { actividadId: e.actividadId, tramiteId }, c(PIDE, tx)), causa).rejects.toThrow(TRAMITE_NO_SIRVE);
        expect(ofrecidos, causa).not.toContain(tramiteId);
      }
      expect(await enlacesDe(tx, e.actividadId)).toHaveLength(0);
      // Uno que ya terminó bien sí se enlaza: es evidencia.
      const publicado = await pedir(tx, e, e.b.lider);
      await tx`UPDATE tramites SET etapa = 'publicado', cerrado_en = ${new Date(PIDE)} WHERE id = ${publicado.tramiteId}`;
      await enlazarTramite(e.b.lider, { actividadId: e.actividadId, tramiteId: publicado.tramiteId }, c(PIDE, tx));
      expect(TERMINO_BIEN).toEqual(["publicado", "eliminado"]);
    }));

  it("la búsqueda filtra por número, código o título, sin mayúsculas ni tildes", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const { tramiteId, numero } = await pedir(tx, e, e.b.lider);
      const por = async (q: string) => (await candidatosParaEnlazar(e.b.lider, e.actividadId, q, c(PIDE, tx))).map((t) => t.id);
      expect(await por(numero.toLowerCase())).toContain(tramiteId);
      expect(await por("FORMATO DE ENTREGA del TURNO")).toContain(tramiteId);
      expect(await por("ningún trámite se llama así")).not.toContain(tramiteId);
    }));
});

describe("quitar un enlace (anexo §9.3)", () => {
  it("el enlazado lo quita quien lo puso o el Admin SGC, con su evento; el pedido, nadie; con la actividad terminada, nadie", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const o = c(PIDE, tx);
      const enlazar = async (quien: SesionFlujo) => {
        const { tramiteId } = await pedir(tx, e, e.b.lider);
        await enlazarTramite(quien, { actividadId: e.actividadId, tramiteId }, o);
        return Number((await tx`SELECT id FROM mejora_actividad_tramites WHERE tramite_id = ${tramiteId}`)[0].id);
      };
      const delLider = await enlazar(e.b.lider);
      const delAdmin = await enlazar(e.b.admin);
      // Otro líder del mismo proceso no quita el que puso el primero.
      const colega = await otroProcesoConLider(tx);
      await tx`INSERT INTO usuario_procesos (usuario_id, proceso_id) VALUES (${colega.lider.usuarioId}, ${e.b.procesoId})`;
      await expect(quitarEnlace(colega.lider, { enlaceId: delLider }, o)).rejects.toThrow();
      await quitarEnlace(e.b.lider, { enlaceId: delLider }, o);
      await quitarEnlace(e.b.admin, { enlaceId: delAdmin }, o);
      expect(await enlacesDe(tx, e.actividadId)).toHaveLength(0);
      const quitados = await eventosDe(tx, e.h.id, "tramite_desenlazado");
      expect(quitados).toHaveLength(2);
      expect(await bitacoraDe(tx, "mejora_tramite_desenlazado", e.actividadId)).toHaveLength(2);
      // El pedido desde la actividad no se quita, ni el Admin SGC.
      const { tramiteId: pedido } = await pedir(tx, e, e.b.lider, { actividadId: e.actividadId });
      const [enlacePedido] = await tx`SELECT id FROM mejora_actividad_tramites WHERE tramite_id = ${pedido}`;
      await expect(quitarEnlace(e.b.admin, { enlaceId: Number(enlacePedido.id) }, o)).rejects.toThrow();
      await expect(quitarEnlace(e.b.lider, { enlaceId: Number(enlacePedido.id) }, o)).rejects.toThrow();
      // Con la actividad terminada, nadie.
      const terminado = await enlazar(e.b.lider);
      await registrarSeguimiento(e.b.consulta, { actividadId: e.actividadId, fecha: "2026-11-18", realizado: "Se terminó", avance: 100 }, o);
      await evidenciaDeActividad(tx, e.actividadId, e.b.consulta.usuarioId);
      await terminarActividad(e.b.consulta, { actividadId: e.actividadId }, o);
      await expect(quitarEnlace(e.b.lider, { enlaceId: terminado }, o)).rejects.toThrow();
      await expect(quitarEnlace(e.b.admin, { enlaceId: terminado }, o)).rejects.toThrow();
      expect(await enlacesDe(tx, e.actividadId)).toHaveLength(2);
    }));
});

describe("lo que se ve de cada enlace (anexo §9.7)", () => {
  it("tramitesDeActividades: el trámite, solo a quien pasa puedeVerTramite; a los demás, sin documento", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const { tramiteId } = await pedir(tx, e, e.b.lider, { actividadId: e.actividadId });
      const deLider = (await tramitesDeActividades(tx, e.b.lider, [e.actividadId])).get(e.actividadId) ?? [];
      expect(deLider).toHaveLength(1);
      expect(deLider[0]).toMatchObject({ tramiteId, origen: "pedido", etapa: "aceptacion", terminoBien: false, terminoEn: null, tipo: "crear", visible: true, seQuita: false });
      expect(deLider[0].documento).toContain("Formato de entrega del turno de noche");
      // Su responsable, que solo consulta, no ve el trámite en curso: lo sabe enlazado, sin su documento.
      const [delResponsable] = (await tramitesDeActividades(tx, e.b.consulta, [e.actividadId])).get(e.actividadId) ?? [];
      expect(delResponsable).toMatchObject({ tramiteId, visible: false, documento: null, etapa: "aceptacion" });
      // «Atiende una actividad de mejoramiento», solo a quien ve la actividad.
      expect(await actividadDelTramite(e.b.lider, tramiteId, { sql: tx })).toEqual({ actividadId: e.actividadId });
      expect(await actividadDelTramite(e.b.admin, tramiteId, { sql: tx })).toEqual({ actividadId: e.actividadId });
      const otro = await otroProcesoConLider(tx);
      expect(await actividadDelTramite(otro.lider, tramiteId, { sql: tx })).toBeNull();
      // Terminado: la fecha en que terminó y si terminó bien.
      await tx`UPDATE tramites SET etapa = 'publicado', cerrado_en = ${new Date("2026-11-20T15:00:00Z")} WHERE id = ${tramiteId}`;
      const [publicado] = (await tramitesDeActividades(tx, e.b.lider, [e.actividadId])).get(e.actividadId) ?? [];
      expect(publicado).toMatchObject({ etapa: "publicado", terminoBien: true, terminoEn: new Date("2026-11-20T15:00:00Z") });
    }));
});

describe("el trámite enlazado termina cuando el hallazgo ya cerró (Review Focus 3)", () => {
  it("publicarlo por el motor del trámite no falla; la pasada no toca el enlace ni avisa a nadie", () =>
    revertida(sql, async (tx) => {
      await silenciarMejoramiento(tx);
      const e = await escena(tx);
      const t = await tramiteEn(tx, "publicacion");
      try {
        await enlazarTramite(e.b.admin, { actividadId: e.actividadId, tramiteId: t.tramiteId }, c(PIDE, tx));
        await terminarTodas(tx, e.b, e.h.id, PIDE);
        expect((await llevarHasta(tx, e.b, e.h.id, "cerrado")).estado).toBe("cerrado");
        const DESPUES = "2027-03-01T15:00:00Z";
        await transicionar(
          t.admin,
          { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } },
          opc(tx, DESPUES),
        );
        expect((await tx`SELECT etapa FROM tramites WHERE id = ${t.tramiteId}`)[0].etapa).toBe("publicado");
        const antes = (await eventosDe(tx, e.h.id, "tramite_terminado")).length;
        await revisarVencimientosDeMejoramiento({ sql: tx, ahora: new Date("2027-03-02T15:00:00Z"), config: await obtenerConfigDocumental({ sql: tx }) });
        const [enlace] = await enlacesDe(tx, e.actividadId);
        expect(enlace.avisado_en).toBeNull();
        expect(await eventosDe(tx, e.h.id, "tramite_terminado")).toHaveLength(antes);
        expect(await tx`SELECT 1 FROM notificaciones WHERE tipo = 'mejora.tramite_terminado' AND entidad_id = ${e.actividadId}`).toHaveLength(0);
        expect((await bloquearHallazgo(tx, e.h.id)).estado).toBe("cerrado");
      } finally {
        await t.limpiar();
      }
    }));
});

describe("el enlace en la base (anexo §9.1)", () => {
  it("un enlace hecho con el SQL directo también vale para leerlo", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const { tramiteId } = await tramiteEnlazado(tx, { actividadId: e.actividadId, usuarioId: e.b.admin.usuarioId, etapa: "eliminado", terminoEn: PIDE });
      const [x] = (await tramitesDeActividades(tx, e.b.admin, [e.actividadId])).get(e.actividadId) ?? [];
      expect(x).toMatchObject({ tramiteId, etapa: "eliminado", terminoBien: true, visible: true, seQuita: true });
    }));
});
