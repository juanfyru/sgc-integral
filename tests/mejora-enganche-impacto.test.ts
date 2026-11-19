/**
 * El hallazgo que nace de un impacto de norma (Fase 15B, anexo §8): el de un documento o un proceso (`impactos_normativos`, en la
 * página del cambio de norma) y la revisión de un indicador (`impactos_indicadores`, en la página del indicador). Quién lo abre, lo que
 * queda fijo (el origen, la norma como requisito y el proceso del impacto), a lo sumo uno que cuente, la sugerencia en sus cuatro
 * condiciones, lo que pintan las dos páginas (`engancheDeImpactos`) y el enlace desde el hallazgo. Contra la BD de trabajo, dentro de
 * una transacción que se revierte; los ids y los códigos se leen, nunca se suponen.
 */
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { resolverImpactoNoAfecta } from "@/db/consultas/indicadores/impactos";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { engancheDeImpactos, type ClaseDeImpacto } from "@/db/consultas/mejoramiento/enganche-impacto";
import { examinarPlan } from "@/db/consultas/mejoramiento/plan";
import { contextoDeMejora } from "@/db/consultas/mejoramiento/config";
import { leerHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { legible } from "@/db/consultas/mejoramiento/legible";
import { prellenadoDeRegistro } from "@/db/consultas/mejoramiento/prellenado";
import {
  anularHallazgo,
  cambiarProceso,
  editarHallazgo,
  enlacesDelHallazgo,
  registrarHallazgo,
  type DatosDeHallazgo,
} from "@/db/consultas/mejoramiento/registro";
import { resolverImpacto } from "@/db/consultas/normograma/impactos";
import {
  CARGA_SIN_ENGANCHE,
  IMPACTO_NO_EXISTE,
  IMPACTO_YA_TIENE_HALLAZGO,
  INDICE_HALLAZGO_DE_IMPACTO,
  INDICE_HALLAZGO_DE_REVISION,
} from "@/lib/mejoramiento/enganches";
import { rutaDeIndicador } from "@/lib/indicadores/rutas";
import { ErrorPermiso } from "@/lib/permisos";
import { indicadorDePrueba } from "./utiles/indicadores";
import {
  baseDeMejora,
  c,
  datosDeCarga,
  datosDeHallazgo,
  hallazgoDeVerificacion,
  impactoDePrueba,
  otroProcesoConLider,
  revisionDePrueba,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { contada } from "./utiles/sentencias";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(() => sql.end());

// Miércoles 18 de noviembre de 2026, 10:00 en Bogotá. La norma se derogó el lunes 2.
const AHORA = "2026-11-18T15:00:00Z";
const ACEPTA = "2026-11-19T15:00:00Z";
const VENCIDO = new Date("2026-11-17T04:59:59Z");
const EN_PLAZO = new Date("2026-11-25T04:59:59Z");

type Impacto = Awaited<ReturnType<typeof impactoDePrueba>>;
type Escena = { b: BaseDeMejora; imp: Impacto };

/** Un proceso con su líder y un impacto de un documento vigente del proceso (o del proceso, sin documento). */
async function escena(tx: TransactionSql, x?: { conDocumento?: boolean }): Promise<Escena> {
  const b = await baseDeMejora(tx);
  const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId, conDocumento: x?.conDocumento ?? true });
  return { b, imp };
}

/** Lo que manda el formulario desde `?impacto=`: lo propuesto (el documento y la fuente) más lo demás de una no conformidad. */
const datos = (e: Escena, cambios?: Partial<DatosDeHallazgo>): DatosDeHallazgo => ({
  ...datosDeHallazgo(e.b.procesoId, { origen: "control_documental", fuente: `Cambio de ${e.imp.norma.nombre}`, requisitoNormaId: e.imp.norma.id }),
  ...(e.imp.documento ? { documentoId: e.imp.documento.id } : {}),
  impactoId: e.imp.id,
  ...cambios,
});

const delImpacto = (tx: TransactionSql, id: number) => tx`SELECT id, estado FROM mejora_hallazgos WHERE impacto_id = ${id} ORDER BY id`;
const deLaRevision = (tx: TransactionSql, id: number) =>
  tx`SELECT id, estado FROM mejora_hallazgos WHERE impacto_indicador_id = ${id} ORDER BY id`;

const mapa = (tx: TransactionSql, s: SesionFlujo, clase: ClaseDeImpacto, ids: number[]) =>
  engancheDeImpactos(s, clase, ids, { sql: tx, ahora: new Date(AHORA) });

/** Deja el impacto vencido y escalado (la sugerencia), o con lo que se le pida. */
const plazoDe = (tx: TransactionSql, tabla: "impactos_normativos" | "impactos_indicadores", id: number, venceEn: Date, escaladoEn: Date | null) =>
  tx`UPDATE ${tx(tabla)} SET vence_en = ${venceEn}, aviso_vencido_en = ${escaladoEn}, escalado_en = ${escaladoEn} WHERE id = ${id}`;

describe("engancheDeImpactos: un impacto sobre un documento", () => {
  it("lo abren el Admin SGC y el líder del proceso del impacto; Control Interno, el líder de otro proceso, Gerencia y Consulta, no", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otro = await otroProcesoConLider(tx);
      const casos: Array<[SesionFlujo, boolean]> = [
        [e.b.admin, true],
        [e.b.lider, true],
        [e.b.control, false],
        [otro.lider, false],
        [e.b.gerencia, false],
        [e.b.consulta, false],
      ];
      for (const [s, abre] of casos) {
        expect((await mapa(tx, s, "documento", [e.imp.id])).get(e.imp.id)).toEqual({ hallazgo: null, puedeAbrir: abre, sugerir: false });
      }
      // El de un proceso sin documentos enlazados, igual.
      const deProceso = await impactoDePrueba(tx, e.b.admin, { procesoId: e.b.procesoId });
      expect((await mapa(tx, e.b.lider, "documento", [deProceso.id])).get(deProceso.id)).toMatchObject({ puedeAbrir: true });
      // Un id que no existe no está en el mapa; una lista vacía no consulta nada.
      expect((await mapa(tx, e.b.admin, "documento", [9_000_000_000])).has(9_000_000_000)).toBe(false);
      const contador = contada(tx);
      expect((await engancheDeImpactos(e.b.admin, "documento", [], { sql: contador.sql, ahora: new Date(AHORA) })).size).toBe(0);
      expect(contador.sentencias).toEqual([]);
    }));

  it("la sugerencia: pendiente, vencido, escalado y sin hallazgo que cuente; si falta una sola de las cuatro, no", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      await plazoDe(tx, "impactos_normativos", e.imp.id, VENCIDO, new Date("2026-11-17T15:00:00Z"));
      const sugerencia = async (s: SesionFlujo) => (await mapa(tx, s, "documento", [e.imp.id])).get(e.imp.id)?.sugerir;
      expect(await sugerencia(e.b.admin)).toBe(true);
      expect(await sugerencia(e.b.lider)).toBe(true);
      // Solo a quien puede abrirlo.
      expect(await sugerencia(e.b.control)).toBe(false);

      // 1. Sin escalar.
      await plazoDe(tx, "impactos_normativos", e.imp.id, VENCIDO, null);
      expect(await sugerencia(e.b.admin)).toBe(false);
      // 2. En plazo (aunque esté escalado).
      await plazoDe(tx, "impactos_normativos", e.imp.id, EN_PLAZO, new Date("2026-11-17T15:00:00Z"));
      expect(await sugerencia(e.b.admin)).toBe(false);
      await plazoDe(tx, "impactos_normativos", e.imp.id, VENCIDO, new Date("2026-11-17T15:00:00Z"));
      expect(await sugerencia(e.b.admin)).toBe(true);
      // 3. Con un hallazgo que cuenta.
      const r = await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      expect((await mapa(tx, e.b.admin, "documento", [e.imp.id])).get(e.imp.id)).toMatchObject({ puedeAbrir: false, sugerir: false });
      await anularHallazgo(e.b.admin, { hallazgoId: r.id, justificacion: "Se abrió sobre el impacto equivocado" }, c(AHORA, tx));
      expect(await sugerencia(e.b.admin)).toBe(true);
      // 4. Resuelto: se puede abrir el hallazgo, pero ya no se sugiere.
      await resolverImpacto(e.b.lider, { impactoId: e.imp.id, resolucion: "no_afecta", nota: "El documento no cita el artículo derogado" }, c(AHORA, tx));
      expect((await mapa(tx, e.b.admin, "documento", [e.imp.id])).get(e.imp.id)).toEqual({ hallazgo: null, puedeAbrir: true, sugerir: false });
    }));

  it("el hallazgo que cuenta, con su código y en qué va, solo a quien lo ve; a quien no, nada de él", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otro = await otroProcesoConLider(tx);
      // El Admin SGC lo abre en un proceso con líder: queda «Por aceptar», y lo mueve después a otro proceso.
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      expect((await mapa(tx, e.b.admin, "documento", [e.imp.id])).get(e.imp.id)).toEqual({
        hallazgo: { id: r.id, codigo: r.codigo, estado: "Por aceptar", visible: true },
        puedeAbrir: false,
        sugerir: false,
      });
      expect((await mapa(tx, e.b.lider, "documento", [e.imp.id])).get(e.imp.id)?.hallazgo).toMatchObject({ id: r.id, visible: true });
      await cambiarProceso(e.b.admin, { hallazgoId: r.id, procesoId: otro.procesoId, justificacion: "Lo atiende el otro proceso" }, c(AHORA, tx));
      // El líder del proceso del impacto ya no lo ve: ni su código ni su estado, y no puede abrir otro.
      const delLider = (await mapa(tx, e.b.lider, "documento", [e.imp.id])).get(e.imp.id)!;
      expect(delLider).toMatchObject({ puedeAbrir: false, sugerir: false, hallazgo: { visible: false } });
      expect(JSON.stringify(delLider)).not.toContain(r.codigo);
      expect(JSON.stringify(delLider)).not.toContain(String(r.id));
      // Y el registro le responde como si el impacto no existiera.
      await expect(registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
    }));
});

describe("registrarHallazgo con un impacto sobre un documento", () => {
  it("el líder del proceso: nace aceptado, en «Por corregir», con el origen, la norma, el proceso y el documento del impacto", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      const [f] = await tx`SELECT estado, clase, origen, fuente, requisito_norma_id, proceso_id, documento_id, impacto_id, impacto_indicador_id
        FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({ estado: "por_corregir", clase: "no_conformidad", origen: "control_documental", impacto_indicador_id: null });
      expect(f.fuente).toBe(`Cambio de ${e.imp.norma.nombre}`);
      expect(Number(f.requisito_norma_id)).toBe(e.imp.norma.id);
      expect(Number(f.proceso_id)).toBe(e.b.procesoId);
      expect(Number(f.documento_id)).toBe(e.imp.documento!.id);
      expect(Number(f.impacto_id)).toBe(e.imp.id);
      const [evento] = await tx`SELECT detalle FROM mejora_eventos WHERE hallazgo_id = ${r.id} AND tipo = 'registrar'`;
      expect(evento.detalle).toMatchObject({ impactoId: e.imp.id });
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'mejora_registrar' AND entidad = 'mejora_hallazgo' AND entidad_id = ${r.id}`;
      expect(bitacora.detalle).toMatchObject({ impactoId: e.imp.id, codigo: r.codigo });
    }));

  it("el origen, la norma y el proceso son fijos: lo que se fuerce en el envío no cuenta, ni para lo que el esquema exige", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otro = await otroProcesoConLider(tx);
      // Un ente de control pediría la fecha del ente; sin la norma ni la cláusula, faltaría el requisito: nada de eso se mira.
      const r = await registrarHallazgo(
        e.b.admin,
        datos(e, { origen: "ente_control", procesoId: otro.procesoId, requisitoNormaId: null, requisitoClausula: null }),
        c(AHORA, tx),
      );
      const [f] = await tx`SELECT origen, requisito_norma_id, proceso_id, fecha_limite_ente, estado FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({ origen: "control_documental", fecha_limite_ente: null, estado: "por_aceptar" });
      expect(Number(f.requisito_norma_id)).toBe(e.imp.norma.id);
      expect(Number(f.proceso_id)).toBe(e.b.procesoId);
      // Una observación del Admin SGC en un proceso con líder: «Por aceptar», el camino de siempre.
      const otraEscena = await escena(tx);
      const obs = await registrarHallazgo(otraEscena.b.admin, datos(otraEscena, { clase: "observacion", criticidad: null }), c(AHORA, tx));
      expect((await delImpacto(tx, otraEscena.imp.id)).map((x) => x.estado)).toEqual(["por_aceptar"]);
      expect(obs.codigo).toMatch(/^HZ-2026-\d{3,}$/);
    }));

  it("con lo que propone el prellenado: la fuente y el documento llegan, y se registra", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const p = await prellenadoDeRegistro(e.b.lider, { impacto: String(e.imp.id) }, { sql: tx });
      const d = { ...datosDeHallazgo(e.b.procesoId), ...p.valores, impactoId: Number(p.ocultos.impactoId) } as DatosDeHallazgo;
      const r = await registrarHallazgo(e.b.lider, d, c(AHORA, tx));
      const [f] = await tx`SELECT fuente, documento_id, impacto_id FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f.fuente).toBe(`Cambio de ${e.imp.norma.nombre}`);
      expect(Number(f.documento_id)).toBe(e.imp.documento!.id);
      expect(Number(f.impacto_id)).toBe(e.imp.id);
    }));

  it("a lo sumo uno que cuente: el segundo se rechaza; con el primero anulado, nace otro", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const primero = await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      await expect(registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx))).rejects.toThrow(IMPACTO_YA_TIENE_HALLAZGO);
      await expect(registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx))).rejects.toThrow(IMPACTO_YA_TIENE_HALLAZGO);
      await anularHallazgo(e.b.admin, { hallazgoId: primero.id, justificacion: "Se abrió sobre el impacto equivocado" }, c(AHORA, tx));
      await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      expect((await delImpacto(tx, e.imp.id)).map((f) => f.estado)).toEqual(["anulado", "por_corregir"]);
    }));

  it("el 23505 de los dos índices únicos parciales sale por legible como IMPACTO_YA_TIENE_HALLAZGO", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      const otro = await registrarHallazgo(e.b.lider, datosDeHallazgo(e.b.procesoId), c(AHORA, tx));
      // La carrera de dos registros a la vez, reproducida con la escritura que el índice detiene.
      const carrera = tx.savepoint((sp) => sp`UPDATE mejora_hallazgos SET impacto_id = ${e.imp.id} WHERE id = ${otro.id}`);
      await expect(legible(carrera)).rejects.toThrow(IMPACTO_YA_TIENE_HALLAZGO);
      for (const indice of [INDICE_HALLAZGO_DE_IMPACTO, INDICE_HALLAZGO_DE_REVISION]) {
        const delIndice = Object.assign(new Error("duplicate key"), { code: "23505", constraint_name: indice });
        await expect(legible(Promise.reject(delIndice))).rejects.toThrow(IMPACTO_YA_TIENE_HALLAZGO);
      }
    }));

  it("se abre con el impacto pendiente y con el impacto resuelto, y abrirlo no cambia el impacto", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const antes = await tx`SELECT estado, resolucion, vence_en, aviso_vencido_en, escalado_en FROM impactos_normativos WHERE id = ${e.imp.id}`;
      await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      expect(await tx`SELECT estado, resolucion, vence_en, aviso_vencido_en, escalado_en FROM impactos_normativos WHERE id = ${e.imp.id}`).toEqual(antes);
      const resuelta = await escena(tx, { conDocumento: false });
      await resolverImpacto(resuelta.b.lider, { impactoId: resuelta.imp.id, resolucion: "no_afecta", nota: "Nada del proceso cita la norma" }, c(AHORA, tx));
      await registrarHallazgo(resuelta.b.lider, datos(resuelta), c(AHORA, tx));
      expect(await delImpacto(tx, resuelta.imp.id)).toHaveLength(1);
      const [i] = await tx`SELECT estado, resolucion FROM impactos_normativos WHERE id = ${resuelta.imp.id}`;
      expect(i).toEqual({ estado: "resuelto", resolucion: "no_afecta" });
    }));

  it("un impacto de un proceso que la persona no lidera, Control Interno o un id que no existe: la misma respuesta; Gerencia no registra", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otro = await otroProcesoConLider(tx);
      await expect(registrarHallazgo(otro.lider, datos(e, { procesoId: otro.procesoId }), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await expect(registrarHallazgo(e.b.control, datos(e), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await expect(registrarHallazgo(e.b.admin, datos(e, { impactoId: 9_000_000_000 }), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await expect(registrarHallazgo(e.b.gerencia, datos(e), c(AHORA, tx))).rejects.toBeInstanceOf(ErrorPermiso);
      expect(await delImpacto(tx, e.imp.id)).toHaveLength(0);
      // Control Interno lo registra a mano, sin el enlace.
      const r = await registrarHallazgo(e.b.control, datos(e, { impactoId: null }), c(AHORA, tx));
      const [f] = await tx`SELECT impacto_id FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f.impacto_id).toBeNull();
    }));

  it("si llegan los dos impactos, cuenta solo el primero (el de un documento o un proceso)", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: e.b.procesoId });
      const rev = await revisionDePrueba(tx, e.b.admin, ind.id);
      const r = await registrarHallazgo(e.b.lider, datos(e, { impactoIndicadorId: rev.id }), c(AHORA, tx));
      const [f] = await tx`SELECT impacto_id, impacto_indicador_id FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(Number(f.impacto_id)).toBe(e.imp.id);
      expect(f.impacto_indicador_id).toBeNull();
    }));

  it("con un hallazgo de verificación en el mismo envío, manda él: no se escribe el enlace del impacto", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const vh = await hallazgoDeVerificacion(tx, { responsable, procesos: [e.b.procesoId] });
      const r = await registrarHallazgo(
        e.b.admin,
        datos(e, { verificacionHallazgoId: vh.id, accionJustificacion: "Es la tercera copia obsoleta del año en este punto" }),
        c(AHORA, tx),
      );
      const [f] = await tx`SELECT verificacion_hallazgo_id, impacto_id, impacto_indicador_id FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(Number(f.verificacion_hallazgo_id)).toBe(vh.id);
      expect(f.impacto_id).toBeNull();
      expect(f.impacto_indicador_id).toBeNull();
      // El impacto sigue sin hallazgo: se puede abrir el suyo.
      expect((await mapa(tx, e.b.admin, "documento", [e.imp.id])).get(e.imp.id)).toMatchObject({ hallazgo: null, puedeAbrir: true });
    }));

  it("al editarlo mientras espera su aceptación, el origen, la norma y el proceso siguen fijos", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const otro = await otroProcesoConLider(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      await editarHallazgo(
        e.b.admin,
        r.id,
        datos(e, { origen: "ente_control", procesoId: otro.procesoId, requisitoNormaId: null, requisitoClausula: null, titulo: "Formato sin la norma nueva" }),
        c(AHORA, tx),
      );
      const [f] = await tx`SELECT origen, requisito_norma_id, proceso_id, titulo, impacto_id FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({ origen: "control_documental", titulo: "Formato sin la norma nueva" });
      expect(Number(f.requisito_norma_id)).toBe(e.imp.norma.id);
      expect(Number(f.proceso_id)).toBe(e.b.procesoId);
      expect(Number(f.impacto_id)).toBe(e.imp.id);
      // La acción de la edición los pone desde la fila antes de leer el envío.
      expect((await enlacesDelHallazgo(r.id, { sql: tx })).fijosDelImpacto).toEqual({
        origen: "control_documental",
        requisitoNormaId: e.imp.norma.id,
        procesoId: e.b.procesoId,
      });
    }));

  it("si una reclasificación le quitó la norma, la edición la conserva nula aunque el envío traiga una (ronda 1)", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.admin, datos(e), c(AHORA, tx));
      await tx`UPDATE mejora_hallazgos SET requisito_norma_id = NULL WHERE id = ${r.id}`;
      await editarHallazgo(e.b.admin, r.id, datos(e, { requisitoNormaId: e.imp.norma.id, titulo: "Formato sin el requisito nuevo" }), c(AHORA, tx));
      const [f] = await tx`SELECT requisito_norma_id, titulo FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toEqual({ requisito_norma_id: null, titulo: "Formato sin el requisito nuevo" });
      expect((await enlacesDelHallazgo(r.id, { sql: tx })).fijosDelImpacto?.requisitoNormaId).toBeNull();
    }));

  it("la carga de un hallazgo en curso rechaza el enlace al impacto o a la revisión: no carga nada que diga que quedó enlazado", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: e.b.procesoId });
      const rev = await revisionDePrueba(tx, e.b.admin, ind.id);
      for (const enlace of [{ impactoId: e.imp.id }, { impactoIndicadorId: rev.id }]) {
        await expect(cargarHallazgo(e.b.admin, { ...datosDeCarga(e.b.procesoId, e.b.lider.usuarioId), ...enlace }, c(AHORA, tx))).rejects.toThrow(
          CARGA_SIN_ENGANCHE,
        );
      }
      expect(await delImpacto(tx, e.imp.id)).toHaveLength(0);
      expect(await deLaRevision(tx, rev.id)).toHaveLength(0);
    }));
});

describe("registrarHallazgo con la revisión de un indicador", () => {
  it("el líder del proceso del indicador: nace con su proceso, la norma, el indicador propuesto y el enlace; la revisión no cambia", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const rev = await revisionDePrueba(tx, b.admin, ind.id);
      const otro = await otroProcesoConLider(tx);
      const antes = await tx`SELECT estado, resolucion, vence_en, escalado_en FROM impactos_indicadores WHERE id = ${rev.id}`;
      const r = await registrarHallazgo(
        b.lider,
        { ...datosDeHallazgo(otro.procesoId, { origen: "auditoria_interna", requisitoNormaId: null }), indicadorId: ind.id, impactoIndicadorId: rev.id },
        c(AHORA, tx),
      );
      const [f] = await tx`SELECT estado, origen, requisito_norma_id, proceso_id, indicador_id, impacto_id, impacto_indicador_id
        FROM mejora_hallazgos WHERE id = ${r.id}`;
      expect(f).toMatchObject({ estado: "por_corregir", origen: "control_documental", impacto_id: null });
      expect(Number(f.requisito_norma_id)).toBe(rev.norma.id);
      expect(Number(f.proceso_id)).toBe(b.procesoId);
      expect(Number(f.indicador_id)).toBe(ind.id);
      expect(Number(f.impacto_indicador_id)).toBe(rev.id);
      expect(await tx`SELECT estado, resolucion, vence_en, escalado_en FROM impactos_indicadores WHERE id = ${rev.id}`).toEqual(antes);
      await expect(
        registrarHallazgo(b.lider, { ...datosDeHallazgo(b.procesoId), impactoIndicadorId: rev.id }, c(AHORA, tx)),
      ).rejects.toThrow(IMPACTO_YA_TIENE_HALLAZGO);
      await anularHallazgo(b.admin, { hallazgoId: r.id, justificacion: "Se abrió sobre la revisión equivocada" }, c(AHORA, tx));
      await registrarHallazgo(b.admin, { ...datosDeHallazgo(b.procesoId), impactoIndicadorId: rev.id }, c(AHORA, tx));
      expect((await deLaRevision(tx, rev.id)).map((x) => x.estado)).toEqual(["anulado", "por_aceptar"]);
    }));

  it("una revisión resuelta, un indicador de un proceso que no lidera o Control Interno: la misma respuesta que un id que no existe", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const rev = await revisionDePrueba(tx, b.admin, ind.id);
      const otro = await otroProcesoConLider(tx);
      const con = (id: number | null) => ({ ...datosDeHallazgo(b.procesoId), impactoIndicadorId: id });
      await expect(registrarHallazgo(otro.lider, { ...con(rev.id), procesoId: otro.procesoId }, c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await expect(registrarHallazgo(b.control, con(rev.id), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await expect(registrarHallazgo(b.admin, con(9_000_000_000), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await resolverImpactoNoAfecta(b.admin, { impactoId: rev.id, nota: "La ficha no cita el artículo derogado" }, { sql: tx, ahora: new Date(AHORA) });
      await expect(registrarHallazgo(b.lider, con(rev.id), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      await expect(registrarHallazgo(b.admin, con(rev.id), c(AHORA, tx))).rejects.toThrow(IMPACTO_NO_EXISTE);
      expect(await deLaRevision(tx, rev.id)).toHaveLength(0);
    }));
});

describe("engancheDeImpactos: la revisión de un indicador", () => {
  it("lo abren el Admin SGC y el líder del proceso del indicador; la sugerencia en sus cuatro condiciones; resuelta, nadie", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const rev = await revisionDePrueba(tx, b.admin, ind.id);
      const otro = await otroProcesoConLider(tx);
      const casos: Array<[SesionFlujo, boolean]> = [
        [b.admin, true],
        [b.lider, true],
        [b.control, false],
        [otro.lider, false],
        [b.gerencia, false],
        [b.consulta, false],
      ];
      for (const [s, abre] of casos) {
        expect((await mapa(tx, s, "indicador", [rev.id])).get(rev.id)).toEqual({ hallazgo: null, puedeAbrir: abre, sugerir: false });
      }
      const sugerencia = async () => (await mapa(tx, b.lider, "indicador", [rev.id])).get(rev.id)?.sugerir;
      await plazoDe(tx, "impactos_indicadores", rev.id, VENCIDO, new Date("2026-11-17T15:00:00Z"));
      expect(await sugerencia()).toBe(true);
      await plazoDe(tx, "impactos_indicadores", rev.id, VENCIDO, null);
      expect(await sugerencia()).toBe(false);
      await plazoDe(tx, "impactos_indicadores", rev.id, EN_PLAZO, new Date("2026-11-17T15:00:00Z"));
      expect(await sugerencia()).toBe(false);
      await plazoDe(tx, "impactos_indicadores", rev.id, VENCIDO, new Date("2026-11-17T15:00:00Z"));
      const r = await registrarHallazgo(b.lider, { ...datosDeHallazgo(b.procesoId), impactoIndicadorId: rev.id }, c(AHORA, tx));
      expect(await sugerencia()).toBe(false);
      // A Consulta, que ve el indicador (es general) pero no el hallazgo: nada de él.
      const deConsulta = (await mapa(tx, b.consulta, "indicador", [rev.id])).get(rev.id)!;
      expect(deConsulta).toMatchObject({ puedeAbrir: false, sugerir: false, hallazgo: { visible: false } });
      expect(JSON.stringify(deConsulta)).not.toContain(r.codigo);
      // A Gerencia, que ve todos los hallazgos, sí.
      expect((await mapa(tx, b.gerencia, "indicador", [rev.id])).get(rev.id)?.hallazgo).toEqual({
        id: r.id,
        codigo: r.codigo,
        estado: "Por corregir",
        visible: true,
      });
      await anularHallazgo(b.admin, { hallazgoId: r.id, justificacion: "Se abrió sobre la revisión equivocada" }, c(AHORA, tx));
      expect(await sugerencia()).toBe(true);
      // Resuelta: ya no se abre (la página solo muestra las pendientes).
      await resolverImpactoNoAfecta(b.admin, { impactoId: rev.id, nota: "La ficha no cita el artículo derogado" }, { sql: tx, ahora: new Date(AHORA) });
      expect((await mapa(tx, b.admin, "indicador", [rev.id])).get(rev.id)).toEqual({ hallazgo: null, puedeAbrir: false, sugerir: false });
    }));
});

describe("el enlace del hallazgo con su impacto", () => {
  it("a quien ve el impacto, con su enlace; a quien ve el hallazgo y no el impacto, solo que hay uno", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const r = await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      const enlace = async (s: SesionFlujo) =>
        (await leerHallazgo(s, r.id, { sql: tx, ahora: new Date(AHORA) }))!.enlaces.find((x) => x.clase === "impacto");
      expect(await enlace(e.b.lider)).toEqual({
        visible: true,
        clase: "impacto",
        rotulo: "Impacto de norma",
        codigo: null,
        nombre: `Cambio de ${e.imp.norma.nombre}`,
        href: `/normograma/impactos/${e.imp.cambioId}?proceso=${e.b.procesoId}`,
      });
      // Control Interno ve todos los hallazgos, pero los impactos son del líder y del Admin SGC.
      expect(await enlace(e.b.control)).toEqual({ visible: false, clase: "impacto", rotulo: "Impacto de norma" });

      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId, nivelAcceso: "restringido" });
      const rev = await revisionDePrueba(tx, b.admin, ind.id);
      const deRevision = await registrarHallazgo(b.lider, { ...datosDeHallazgo(b.procesoId), impactoIndicadorId: rev.id }, c(AHORA, tx));
      const delIndicador = async (s: SesionFlujo) =>
        (await leerHallazgo(s, deRevision.id, { sql: tx, ahora: new Date(AHORA) }))!.enlaces.find((x) => x.clase === "impacto");
      expect(await delIndicador(b.lider)).toEqual({
        visible: true,
        clase: "impacto",
        rotulo: "Impacto de norma",
        codigo: null,
        nombre: `Cambio de ${rev.norma.nombre}`,
        href: rutaDeIndicador(ind.codigo),
      });
    }));
});

describe("lo que se firma", () => {
  it("examinarPlan pone la clave del impacto solo cuando el hallazgo la tiene", () =>
    revertida(sql, async (tx) => {
      const e = await escena(tx);
      const con = await registrarHallazgo(e.b.lider, datos(e), c(AHORA, tx));
      const sin = await registrarHallazgo(e.b.lider, datosDeHallazgo(e.b.procesoId), c(AHORA, tx));
      const ctx = await contextoDeMejora(tx, new Date(ACEPTA));
      const deCon = await examinarPlan(tx, con.id, ctx);
      const deSin = await examinarPlan(tx, sin.id, ctx);
      expect(deCon.plan.identificacion.impactoId).toBe(e.imp.id);
      expect(Object.hasOwn(deCon.plan.identificacion, "impactoIndicadorId")).toBe(false);
      expect(Object.hasOwn(deSin.plan.identificacion, "impactoId")).toBe(false);
      expect(Object.hasOwn(deSin.plan.identificacion, "impactoIndicadorId")).toBe(false);
    }));
});
