/**
 * La lista de hallazgos por páginas (Fase 15B, anexo §11.1, F15B-DC37): por omisión los abiertos, 50 por página con el orden y el
 * corte en la consulta, las cifras de todo lo que la persona ve, el código exacto de un terminado, el Excel de todo el filtro, el
 * turno resuelto por lote (fijado caso por caso, y el mismo que el de cada hallazgo solo) y lo que cuesta una página, que no crece con las
 * filas (Review Focus 8). Contra la BD de trabajo, dentro de una transacción que se revierte.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cargarHallazgo } from "@/db/consultas/mejoramiento/carga";
import { cargaResuelta } from "@/db/consultas/mejoramiento/carga-confirmada";
import { bloquearHallazgo } from "@/db/consultas/mejoramiento/flujo";
import { filasParaExcel, listarHallazgos, turnoEnTexto } from "@/db/consultas/mejoramiento/lectura";
import { pedirAjuste } from "@/db/consultas/mejoramiento/ajustes";
import { rechazarHallazgo, sostenerHallazgo } from "@/db/consultas/mejoramiento/recorrido";
import { registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import type { DatosDeHallazgo } from "@/db/consultas/mejoramiento/registro";
import { tareasConSuHallazgo } from "@/db/consultas/mejoramiento/tareas";
import { evaluablesDesde } from "@/db/consultas/mejoramiento/verificacion";
import { filtroDeConsulta, TAMANO_DE_PAGINA } from "@/lib/mejoramiento/filtro";
import {
  actividadPorSql,
  baseDeMejora,
  c,
  datosDeCarga,
  datosDeHallazgo,
  hallazgoEn,
  llevarHasta,
  HORA_DE_ESCENA,
  otroProcesoConLider,
  type BaseDeMejora,
} from "./utiles/mejoramiento";
import { procesoNuevo } from "./utiles/mixto";
import { contada } from "./utiles/sentencias";
import { revertida } from "./utiles/transaccion";
import { usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** La hora de la lista: miércoles 9 de diciembre de 2026, 10:00 en Bogotá. */
const LISTA = "2026-12-09T15:00:00Z";
const TEMPRANO = "2026-11-17T15:00:00Z";
const RECIENTE = "2026-12-09T13:00:00Z";
const AYER = "2026-12-07T15:00:00Z";
/** El turno de un hallazgo cargado sin su formato firmado en su propia página (que no le pasa el formato que falta). */
const CARGA_EN_LA_PAGINA = "Los responsables de las actividades";
const lee = (tx: TransactionSql, ahora = LISTA) => ({ sql: tx, ahora: new Date(ahora) });

describe("el orden de la lista (fijado antes de pasar el orden a la consulta)", () => {
  it("la prioridad alta primero, luego lo vencido y por vencimiento ascendente con los nulos al final; a igual fecha, por id", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const mk = async (titulo: string, cuando: string, cambios: Partial<DatosDeHallazgo> = {}) =>
        (await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo, ...cambios }), c(cuando, tx))).id;
      const externo = { origen: "auditoria_externa" as const, fuente: "Auditoría de la Secretaría de Salud" };
      // Registrados en orden de id; cada uno dice qué lo pone en su lugar.
      const h = {
        internoReciente: await mk("Interno por aceptar, registrado esta mañana", RECIENTE),
        externoTerminado: await mk("Externo anulado", TEMPRANO, externo),
        internoVencido: await mk("Interno por aceptar vencido", TEMPRANO),
        gemeloA: await mk("Interno por aceptar, misma hora que su gemelo", AYER),
        gemeloB: await mk("Interno por aceptar, misma hora que su gemelo (después)", AYER),
        externoAbierto: await mk("Externo por aceptar, sin vencer", RECIENTE, externo),
        conActividadVencida: await mk("En ejecución con una actividad vencida", TEMPRANO),
        terminadoConFecha: await mk("Cerrado que conserva una fecha de vencimiento", RECIENTE),
        sinFecha: await mk("En ejecución sin actividades", TEMPRANO),
        anulado: await mk("Interno anulado", TEMPRANO),
        externoVencido: await mk("Externo por aceptar vencido", TEMPRANO, externo),
      };
      await actividadPorSql(tx, h.conActividadVencida, b.lider.usuarioId, { fin: "2026-12-01", aprobada: true });
      await tx`UPDATE mejora_hallazgos SET estado = 'en_ejecucion', vence_en = NULL WHERE id IN ${tx([h.conActividadVencida, h.sinFecha])}`;
      await tx`UPDATE mejora_hallazgos SET estado = 'anulado', vence_en = NULL WHERE id IN ${tx([h.externoTerminado, h.anulado])}`;
      // Por SQL, un terminado con la fecha del paso que tenía: la lista no la cuenta.
      await tx`UPDATE mejora_hallazgos SET estado = 'cerrado', resultado_cierre = 'con_correccion' WHERE id = ${h.terminadoConFecha}`;
      const [g] = await tx`SELECT vence_en FROM mejora_hallazgos WHERE id = ${h.gemeloA}`;
      await tx`UPDATE mejora_hallazgos SET vence_en = ${g.vence_en as Date} WHERE id = ${h.gemeloB}`;

      const nombre = new Map(Object.entries(h).map(([k, v]) => [v, k]));
      // Con el código de la 15A se fijó con `{ procesoId }`, que entonces traía todos; desde esta tarea eso es `estado: "todos"`.
      const r = await listarHallazgos(b.admin, { procesoId: b.procesoId, estado: "todos" }, lee(tx));
      expect(r.filas.map((f) => nombre.get(f.id))).toEqual([
        "externoVencido",
        "externoAbierto",
        "internoVencido",
        "conActividadVencida",
        "gemeloA",
        "gemeloB",
        "internoReciente",
        "externoTerminado",
        "terminadoConFecha",
        "sinFecha",
        "anulado",
      ]);
    }));
});

/**
 * 55 hallazgos abiertos («Por aceptar») y 3 terminados en el proceso de la base, todos de Control Interno; los terminados, por SQL
 * (uno de cada terminal), dentro de la transacción que se revierte. Dos abiertos con dos actividades de un plan aprobado y un terminado
 * con una, para el Excel.
 */
async function cincuentaYCinco(tx: TransactionSql, b: BaseDeMejora) {
  const abiertos: Array<{ id: number; codigo: string }> = [];
  for (let i = 0; i < 55; i++) {
    abiertos.push(await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo: `Hallazgo abierto ${i + 1}` }), c(TEMPRANO, tx)));
  }
  const terminados: Array<{ id: number; codigo: string }> = [];
  for (const titulo of ["Terminado cerrado", "Terminado rechazado", "Terminado anulado"]) {
    terminados.push(await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo }), c(TEMPRANO, tx)));
  }
  for (const h of abiertos.slice(0, 2)) {
    const primera = await actividadPorSql(tx, h.id, b.lider.usuarioId);
    await actividadPorSql(tx, h.id, b.lider.usuarioId, { accionDe: primera });
  }
  // Antes de terminarlo: un terminado ya no admite hijas.
  await actividadPorSql(tx, terminados[0].id, b.lider.usuarioId);
  const [cerrado, rechazado, anulado] = terminados;
  await tx`UPDATE mejora_hallazgos SET estado = 'cerrado', resultado_cierre = 'con_correccion', vence_en = NULL WHERE id = ${cerrado.id}`;
  await tx`UPDATE mejora_hallazgos SET estado = 'rechazado', vence_en = NULL WHERE id = ${rechazado.id}`;
  await tx`UPDATE mejora_hallazgos SET estado = 'anulado', vence_en = NULL WHERE id = ${anulado.id}`;
  return { abiertos, cerrado, rechazado, anulado };
}

describe("la lista por páginas: por omisión los abiertos (anexo §11.1)", () => {
  it(
    "sin estado: 55 de 58, 50 en la primera página y 5 en la segunda; una página más allá del final es la última",
    { timeout: 60_000 },
    () =>
      revertida(sql, async (tx) => {
        const b = await baseDeMejora(tx);
        const { abiertos } = await cincuentaYCinco(tx, b);
        expect(TAMANO_DE_PAGINA).toBe(50);
        const p1 = await listarHallazgos(b.admin, { procesoId: b.procesoId }, lee(tx));
        expect(p1).toMatchObject({ total: 55, pagina: 1, paginas: 2 });
        expect(p1.filas).toHaveLength(50);
        const p2 = await listarHallazgos(b.admin, { procesoId: b.procesoId, pagina: 2 }, lee(tx));
        expect(p2).toMatchObject({ total: 55, pagina: 2, paginas: 2 });
        expect(p2.filas).toHaveLength(5);
        // Entre las dos, los 55 abiertos, una vez cada uno.
        expect([...p1.filas, ...p2.filas].map((f) => f.id).sort((x, y) => x - y)).toEqual(abiertos.map((h) => h.id).sort((x, y) => x - y));
        const p9 = await listarHallazgos(b.admin, { procesoId: b.procesoId, pagina: 9 }, lee(tx));
        expect(p9).toMatchObject({ total: 55, pagina: 2, paginas: 2 });
        expect(p9.filas.map((f) => f.id)).toEqual(p2.filas.map((f) => f.id));
        // La dirección sin estado es lo mismo: `filtroDeConsulta` no inventa uno.
        const deLaDireccion = filtroDeConsulta({ proceso: String(b.procesoId), pagina: "2" });
        expect(deLaDireccion).toEqual({ procesoId: b.procesoId, pagina: 2 });
        expect((await listarHallazgos(b.admin, deLaDireccion, lee(tx))).filas.map((f) => f.id)).toEqual(p2.filas.map((f) => f.id));
      }),
  );

  it("«todos» trae los 58; un estado terminado, solo los suyos; sin filas, una sola página vacía", { timeout: 60_000 }, () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { cerrado, rechazado } = await cincuentaYCinco(tx, b);
      expect(await listarHallazgos(b.admin, { procesoId: b.procesoId, estado: "todos" }, lee(tx))).toMatchObject({ total: 58, paginas: 2 });
      const cerrados = await listarHallazgos(b.admin, { procesoId: b.procesoId, estado: "cerrado" }, lee(tx));
      expect(cerrados).toMatchObject({ total: 1, pagina: 1, paginas: 1 });
      expect(cerrados.filas.map((f) => f.id)).toEqual([cerrado.id]);
      expect((await listarHallazgos(b.admin, { procesoId: b.procesoId, estado: "rechazado" }, lee(tx))).filas.map((f) => f.id)).toEqual([
        rechazado.id,
      ]);
      const vacia = await listarHallazgos(b.admin, { procesoId: b.procesoId, estado: "en_espera", pagina: 3 }, lee(tx));
      expect(vacia).toMatchObject({ filas: [], total: 0, pagina: 1, paginas: 1 });
    }));

  it("el código exacto de un terminado se encuentra sin cambiar el estado, solo por quien lo ve", { timeout: 60_000 }, () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { cerrado, anulado } = await cincuentaYCinco(tx, b);
      for (const q of [cerrado.codigo, cerrado.codigo.toLowerCase(), `  ${cerrado.codigo} `]) {
        const r = await listarHallazgos(b.lider, { q }, lee(tx));
        expect(r.filas.map((f) => f.id), q).toEqual([cerrado.id]);
        expect(r.total).toBe(1);
      }
      expect((await listarHallazgos(b.admin, { q: anulado.codigo }, lee(tx))).filas.map((f) => f.id)).toEqual([anulado.id]);
      // Un pedazo del código no es el código: con el estado por omisión, solo los abiertos.
      const parcial = await listarHallazgos(b.lider, { q: cerrado.codigo.slice(0, -1) }, lee(tx));
      expect(parcial.filas.map((f) => f.id)).not.toContain(cerrado.id);
      // Un estado elegido manda: «Abiertos» no lo trae.
      expect((await listarHallazgos(b.lider, { q: cerrado.codigo, estado: "abiertos" }, lee(tx))).filas).toEqual([]);
      // Quien no lo ve no lo encuentra, ni en el total.
      const ajeno = (await otroProcesoConLider(tx)).lider;
      expect(await listarHallazgos(ajeno, { q: cerrado.codigo }, lee(tx))).toMatchObject({ filas: [], total: 0, paginas: 1 });
      expect(await listarHallazgos(ajeno, { q: cerrado.codigo, estado: "todos" }, lee(tx))).toMatchObject({ filas: [], total: 0 });
    }));

  it("una lista vacía dice si quedaron fuera terminados que la persona ve, sin decir nada de los que no ve (ronda 1)", { timeout: 60_000 }, () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      // Todo lo que ve el líder está terminado.
      const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId, { titulo: "Neveras sin registro" }), c(TEMPRANO, tx));
      await tx`UPDATE mejora_hallazgos SET estado = 'anulado', vence_en = NULL WHERE id = ${id}`;
      expect(await listarHallazgos(b.lider, {}, lee(tx))).toMatchObject({ filas: [], total: 0, terminadosFuera: true });
      expect((await listarHallazgos(b.lider, { estado: "abiertos" }, lee(tx))).terminadosFuera).toBe(true);
      // El resto del filtro manda: un texto que el terminado no tiene, ninguno.
      expect((await listarHallazgos(b.lider, { q: "contratos" }, lee(tx))).terminadosFuera).toBe(false);
      expect((await listarHallazgos(b.lider, { q: "neveras" }, lee(tx))).terminadosFuera).toBe(true);
      // Con otro estado elegido, o con filas, no hay nada que decir.
      expect((await listarHallazgos(b.lider, { estado: "por_aceptar" }, lee(tx))).terminadosFuera).toBe(false);
      expect((await listarHallazgos(b.lider, { estado: "todos" }, lee(tx))).terminadosFuera).toBe(false);
      // A quien no lo ve, nada: el líder de otro proceso no ve ningún terminado que «quedó fuera».
      const ajeno = (await otroProcesoConLider(tx)).lider;
      expect(await listarHallazgos(ajeno, {}, lee(tx))).toMatchObject({ filas: [], terminadosFuera: false });
      expect((await listarHallazgos(ajeno, { q: "neveras" }, lee(tx))).terminadosFuera).toBe(false);
    }));

  it("las cifras cuentan todo lo que la persona ve, igual en la página 1 y en la 2", { timeout: 60_000 }, () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      await cincuentaYCinco(tx, b);
      const p1 = await listarHallazgos(b.lider, {}, lee(tx));
      const p2 = await listarHallazgos(b.lider, { pagina: 2 }, lee(tx));
      expect(p1.cifras).toEqual(p2.cifras);
      expect(p1.cifras).toMatchObject({ abiertos: 55, conAlgoVencido: 55, esperanSuDecision: 55, enEspera: 0, reabiertos: 0 });
      // Lo filtrado no las cambia: siguen siendo de todo lo visible.
      expect((await listarHallazgos(b.lider, { estado: "cerrado" }, lee(tx))).cifras).toEqual(p1.cifras);
    }));

  it("el Excel con el filtro por omisión trae las actividades de los 55, sin página", { timeout: 60_000 }, () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const { abiertos, cerrado } = await cincuentaYCinco(tx, b);
      for (const filtro of [{ procesoId: b.procesoId }, { procesoId: b.procesoId, pagina: 2 }, filtroDeConsulta({ proceso: String(b.procesoId) })]) {
        const filas = await filasParaExcel(b.admin, filtro, lee(tx));
        // Dos con dos actividades y 53 sin ninguna: 57 filas, de los 55 abiertos y de ningún terminado.
        expect(filas).toHaveLength(57);
        expect([...new Set(filas.map((f) => f.codigo))].sort()).toEqual(abiertos.map((h) => h.codigo).sort());
        expect(filas.map((f) => f.codigo)).not.toContain(cerrado.codigo);
      }
      // En el orden de la lista: el de su primera página.
      const lista = await listarHallazgos(b.admin, { procesoId: b.procesoId }, lee(tx));
      const delExcel = [...new Set((await filasParaExcel(b.admin, { procesoId: b.procesoId }, lee(tx))).map((f) => f.codigo))];
      expect(delExcel.slice(0, 50)).toEqual(lista.filas.map((f) => f.codigo));
      // Con «todos», también los tres terminados (el cerrado, con su actividad).
      expect(await filasParaExcel(b.admin, { procesoId: b.procesoId, estado: "todos" }, lee(tx))).toHaveLength(60);
    }));
});

describe("lo que cuesta una página no crece con sus filas (Review Focus 8)", () => {
  const ESTADOS = ["por_aceptar", "arbitraje", "por_validar", "en_revision", "por_verificar"] as const;

  /** `n` hallazgos de Control Interno en cada estado, llevados a él por SQL: lo que se mide es cuántas sentencias, no el turno. */
  async function enCadaEstado(tx: TransactionSql, b: BaseDeMejora, n: number) {
    for (const estado of ESTADOS) {
      for (let i = 0; i < n; i++) {
        const { id } = await registrarHallazgo(b.control, datosDeHallazgo(b.procesoId), c(TEMPRANO, tx));
        if (estado !== "por_aceptar") await tx`UPDATE mejora_hallazgos SET estado = ${estado} WHERE id = ${id}`;
      }
    }
  }

  /** Las sentencias de una llamada a `listarHallazgos`, filtrada por el proceso de la base. */
  async function sentencias(tx: TransactionSql, b: BaseDeMejora, s: SesionFlujo) {
    const { sql: contador, sentencias: lista } = contada(tx);
    const r = await listarHallazgos(s, { procesoId: b.procesoId }, { sql: contador, ahora: new Date(LISTA) });
    return { filas: r.filas.length, n: lista.length };
  }

  it(
    "con 10 y con 50 filas en «Por aceptar», «En arbitraje», «Por validar», «En revisión» y «Por verificar», las mismas sentencias",
    { timeout: 120_000 },
    () =>
      revertida(sql, async (tx) => {
        const b = await baseDeMejora(tx);
        const quienes: Array<[string, SesionFlujo, number]> = [
          // Las tareas de quien mira («Esperan su decisión», R2) son la mayor parte: las del Admin SGC, 13 de sus 24 (las del
          // cascarón; ver el informe de la Tarea 14). Lo demás: la espera de eficacia (5), las cifras, la página y el turno (6).
          ["Admin SGC", b.admin, 25],
          ["Control Interno", b.control, 20],
          ["Gerencia", b.gerencia, 20],
          ["líder", b.lider, 20],
        ];
        await enCadaEstado(tx, b, 2);
        const con10 = new Map<string, number>();
        for (const [nombre, s] of quienes) {
          const { filas, n } = await sentencias(tx, b, s);
          expect(filas, nombre).toBe(10);
          con10.set(nombre, n);
        }
        await enCadaEstado(tx, b, 8);
        for (const [nombre, s, tope] of quienes) {
          const { filas, n } = await sentencias(tx, b, s);
          expect(filas, nombre).toBe(50);
          expect(n, nombre).toBe(con10.get(nombre));
          expect(n, nombre).toBeLessThanOrEqual(tope);
        }
      }),
  );
});

describe("el turno de una página es el de cada hallazgo (la página entera frente a `turnoEnTexto`, uno por uno)", () => {
  /** Cada fila de la lista dice el turno que la página del hallazgo le daría, con lo mismo que esta sabe (la espera, el formato). */
  async function comparar(tx: TransactionSql, quien: SesionFlujo, q: string, ahora: string): Promise<Map<number, string>> {
    const { filas } = await listarHallazgos(quien, { q, estado: "todos" }, lee(tx, ahora));
    const turnos = new Map<number, string>();
    for (const fila of filas) {
      const h = await bloquearHallazgo(tx, fila.id);
      const evaluable = (await evaluablesDesde(tx, [h.id], new Date(ahora))).get(h.id)?.yaSePuede === true;
      const [{ resuelta }] = await tx`SELECT ${cargaResuelta(tx)} AS resuelta FROM mejora_hallazgos h WHERE h.id = ${h.id}`;
      expect(fila.turno, `${fila.codigo} (${fila.etiqueta})`).toBe(
        await turnoEnTexto(tx, h, { yaSePuedeEvaluar: evaluable, faltaElFormato: resuelta === false }),
      );
      turnos.set(fila.id, fila.turno);
    }
    return turnos;
  }

  it(
    "en cada estado y con respuestas distintas en el mismo estado, antes y después de dejar un solo Admin SGC activo",
    { timeout: 180_000 },
    () =>
      revertida(sql, async (tx) => {
        const b = await baseDeMejora(tx);
        const marca = `zz-turno-${Date.now()}`;
        const titulo = (t: string) => ({ titulo: `${marca} ${t}` });
        const o = c(HORA_DE_ESCENA, tx);
        const registra = async (quien: SesionFlujo, procesoId: number, t: string) =>
          (await registrarHallazgo(quien, datosDeHallazgo(procesoId, titulo(t)), o)).id;

        const sinLider = await procesoNuevo(tx);
        // Su única líder deja de estar activa después: el Admin SGC que registró uno no lo acepta, y nadie más puede.
        const otroProceso = await otroProcesoConLider(tx);
        const otroControl = await usuarioDePrueba(tx, { rol: "control_interno" });
        // Un hallazgo nace «Por aceptar» solo si su proceso tiene líder y no lo registró una de ellas (si no, nace aceptado).
        const h = {
          aceptaLaLider: await registra(b.control, b.procesoId, "por aceptar con líder"),
          corrigeElAdmin: await registra(b.control, sinLider, "por corregir, en un proceso sin líder"),
          aceptaElAdminSinLider: await registra(b.control, otroProceso.procesoId, "por aceptar, de Control Interno"),
          nadieAcepta: await registra(b.admin, otroProceso.procesoId, "por aceptar, del Admin SGC"),
          rechazoActivo: (await hallazgoEn(tx, b, "rechazo", titulo("rechazo de quien sigue activo"))).id,
          rechazoInactivo: await registra(otroControl, b.procesoId, "rechazo de quien ya no está"),
          arbitrajeDeControl: (await hallazgoEn(tx, b, "arbitraje", titulo("arbitraje de Control Interno"))).id,
          arbitrajeDelAdmin: await registra(b.admin, b.procesoId, "arbitraje del Admin SGC"),
          revisionDeLaLider: (await hallazgoEn(tx, b, "en_revision", titulo("en revisión, de la líder"))).id,
          revisionDelAdmin: (await hallazgoEn(tx, b, "en_revision", titulo("en revisión, del Admin SGC"))).id,
          verificaAlguien: (await hallazgoEn(tx, b, "por_verificar", titulo("por verificar"))).id,
          verificaNadie: (await hallazgoEn(tx, b, "por_verificar", titulo("por verificar, el Admin SGC ejecutó"))).id,
          esperaEvaluable: (await hallazgoEn(tx, b, "en_espera", titulo("en espera, ya evaluable"))).id,
          esperaTemprana: (await hallazgoEn(tx, b, "en_espera", titulo("en espera, todavía no"))).id,
          enEjecucion: (await hallazgoEn(tx, b, "en_ejecucion", titulo("en ejecución"))).id,
          porValidar: (await hallazgoEn(tx, b, "por_validar", titulo("por validar"))).id,
          enAprobacion: (await hallazgoEn(tx, b, "en_aprobacion", titulo("en aprobación"))).id,
          porDecidir: (await hallazgoEn(tx, b, "por_decidir", titulo("por decidir"))).id,
          cargaSinFormato: (await cargarHallazgo(b.admin, datosDeCarga(b.procesoId, b.lider.usuarioId, titulo("cargado sin su formato")), o)).id,
          anulado: await registra(b.control, b.procesoId, "anulado"),
        };
        await rechazarHallazgo(b.lider, { hallazgoId: h.rechazoInactivo, justificacion: "El hecho no corresponde a este proceso" }, o);
        await tx`UPDATE usuarios SET activo = false WHERE id = ${otroControl.usuarioId}`;
        await rechazarHallazgo(b.lider, { hallazgoId: h.arbitrajeDelAdmin, justificacion: "El hecho no corresponde a este proceso" }, o);
        await sostenerHallazgo(b.admin, { hallazgoId: h.arbitrajeDelAdmin, replica: "La evidencia muestra que sí corresponde" }, o);
        // Por SQL, solo para el turno: el plan de uno lo elaboró el Admin SGC de la base, y en otro él ejecutó una actividad.
        await tx`UPDATE mejora_rondas SET elaborado_por = ${b.admin.usuarioId} WHERE hallazgo_id = ${h.revisionDelAdmin}`;
        await actividadPorSql(tx, h.verificaNadie, b.admin.usuarioId, { estado: "terminada", avance: 100 });
        // La espera que todavía no se evalúa: su última actividad terminó después (la fecha mínima se corre).
        await tx`UPDATE mejora_actividades SET terminada_en = '2027-01-25T15:00:00Z' WHERE hallazgo_id = ${h.esperaTemprana}`;
        await tx`UPDATE mejora_hallazgos SET estado = 'anulado', vence_en = NULL WHERE id = ${h.anulado}`;

        const AHORA = "2027-02-01T15:00:00Z";
        // Cada fila, con su texto literal: el que daba la página del hallazgo hasta la ronda 1 de la Tarea 14 (`resolverTurno`), fijado
        // con él antes de quitarlo; desde entonces la página usa `turnosEnTexto` con una lista de uno.
        const nombres = Object.fromEntries(Object.entries(h).map(([k, v]) => [v, k]));
        const porNombre = (turnos: Map<number, string>) => Object.fromEntries([...turnos].map(([id, t]) => [nombres[id], t]));
        const ADMIN = "Administrador del SGC";
        const antes = await comparar(tx, b.admin, marca, AHORA);
        expect(porNombre(antes)).toEqual({
          aceptaLaLider: "La líder del proceso",
          corrigeElAdmin: ADMIN,
          aceptaElAdminSinLider: "La líder del proceso",
          nadieAcepta: "La líder del proceso",
          rechazoActivo: "Quien lo registró",
          rechazoInactivo: ADMIN,
          arbitrajeDeControl: ADMIN,
          arbitrajeDelAdmin: "Gerencia",
          revisionDeLaLider: ADMIN,
          revisionDelAdmin: ADMIN,
          verificaAlguien: "Quien puede verificar",
          verificaNadie: "Quien puede verificar",
          esperaEvaluable: "Quien puede verificar",
          esperaTemprana: "Nadie por ahora",
          enEjecucion: "Los responsables de las actividades",
          porValidar: "Quien puede validar",
          enAprobacion: "Gerencia",
          porDecidir: ADMIN,
          cargaSinFormato: "El Administrador del SGC: falta el formato firmado",
          anulado: "Sin pendientes",
        });
        // La página del hallazgo no le pasa el formato que falta: dice el turno de su paso, como siempre.
        expect(await turnoEnTexto(tx, await bloquearHallazgo(tx, h.cargaSinFormato))).toBe(CARGA_EN_LA_PAGINA);

        // Con un solo Admin SGC activo y nadie más que pueda verificar o arbitrar, las respuestas se separan dentro de cada estado.
        await tx`UPDATE usuarios SET activo = false
          WHERE (rol IN ('admin_sgc', 'control_interno', 'gerencia') AND activo AND id <> ${b.admin.usuarioId})
            OR id = ${otroProceso.lider.usuarioId}`;
        const despues = await comparar(tx, b.admin, marca, AHORA);
        expect(porNombre(despues)).toEqual({
          aceptaLaLider: "La líder del proceso",
          corrigeElAdmin: ADMIN,
          aceptaElAdminSinLider: ADMIN,
          nadieAcepta: "Nadie puede aceptarlo",
          rechazoActivo: ADMIN,
          rechazoInactivo: ADMIN,
          arbitrajeDeControl: ADMIN,
          arbitrajeDelAdmin: "Nadie puede arbitrarlo",
          revisionDeLaLider: ADMIN,
          revisionDelAdmin: "Quien lo elaboró",
          verificaAlguien: "Quien puede verificar",
          verificaNadie: "Nadie puede verificarlo",
          esperaEvaluable: "Quien puede verificar",
          esperaTemprana: "Nadie por ahora",
          enEjecucion: "Los responsables de las actividades",
          porValidar: "Quien puede validar",
          enAprobacion: "Gerencia",
          porDecidir: ADMIN,
          cargaSinFormato: "El Administrador del SGC: falta el formato firmado",
          anulado: "Sin pendientes",
        });
      }),
  );
});

describe("las tareas de una página, por lote: en el mismo estado, cada hallazgo con su regla (anexo §11.3)", () => {
  it(
    "arbitrar, validar, verificar y decidir un ajuste: unas filas le tocan a la persona y otras, en el mismo estado, no",
    { timeout: 180_000 },
    () =>
      revertida(sql, async (tx) => {
        const b = await baseDeMejora(tx);
        const o = c(HORA_DE_ESCENA, tx);
        const sinLider = await procesoNuevo(tx);
        // El arbitraje: lo de Control Interno lo arbitra el Admin SGC; lo que registró y sostuvo un Admin SGC, Gerencia.
        const arbitraElAdmin = (await hallazgoEn(tx, b, "arbitraje")).id;
        const { id: arbitraGerencia } = await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId), o);
        await rechazarHallazgo(b.lider, { hallazgoId: arbitraGerencia, justificacion: "El hecho no corresponde a este proceso" }, o);
        await sostenerHallazgo(b.admin, { hallazgoId: arbitraGerencia, replica: "La evidencia muestra que sí corresponde" }, o);
        // La validación: la corrección de la líder la valida el Admin SGC; la que registró él mismo (proceso sin líder), no.
        const validaElAdmin = (await hallazgoEn(tx, b, "por_validar")).id;
        const corrigioElAdmin = (await hallazgoEn(tx, b, "por_validar", { procesoId: sinLider })).id;
        // La verificación: en uno el Admin SGC ejecutó una actividad.
        const verificaElAdmin = (await hallazgoEn(tx, b, "por_verificar")).id;
        const ejecutoElAdmin = (await hallazgoEn(tx, b, "por_verificar")).id;
        await actividadPorSql(tx, ejecutoElAdmin, b.admin.usuarioId, { estado: "terminada", avance: 100 });
        // Los ajustes: los decide el rol que aprobó el plan (el Admin SGC en la revisión; Gerencia, si pasó por ella).
        const aproboElAdmin = (await hallazgoEn(tx, b, "en_ejecucion")).id;
        const aproboGerencia = (await hallazgoEn(tx, b, "en_aprobacion")).id;
        await llevarHasta(tx, b, aproboGerencia, "en_ejecucion");
        const pide = async (hallazgoId: number) => {
          const [a] = await tx`SELECT id FROM mejora_actividades WHERE hallazgo_id = ${hallazgoId} ORDER BY id LIMIT 1`;
          const r = await pedirAjuste(
            b.lider,
            { hallazgoId, tipo: "reprogramar", actividadId: Number(a.id), finNuevo: "2026-12-30", causa: "El proveedor no entrega antes" },
            o,
          );
          return r.id;
        };
        const ajusteDelAdmin = await pide(aproboElAdmin);
        const ajusteDeGerencia = await pide(aproboGerencia);

        const ids = async (s: SesionFlujo) => new Set((await tareasConSuHallazgo(s, { sql: tx, ahora: new Date(HORA_DE_ESCENA) })).map((t) => t.tarea.id));
        const delAdmin = await ids(b.admin);
        expect(delAdmin.has(`mej-arbitrar:${arbitraElAdmin}`)).toBe(true);
        expect(delAdmin.has(`mej-arbitrar:${arbitraGerencia}`)).toBe(false);
        expect(delAdmin.has(`mej-validar:${validaElAdmin}`)).toBe(true);
        expect(delAdmin.has(`mej-validar:${corrigioElAdmin}`)).toBe(false);
        expect(delAdmin.has(`mej-verificar:${verificaElAdmin}`)).toBe(true);
        expect(delAdmin.has(`mej-verificar:${ejecutoElAdmin}`)).toBe(false);
        expect(delAdmin.has(`mej-ajuste:${ajusteDelAdmin}`)).toBe(true);
        expect(delAdmin.has(`mej-ajuste:${ajusteDeGerencia}`)).toBe(false);
        const deGerencia = await ids(b.gerencia);
        expect(deGerencia.has(`mej-arbitrar:${arbitraGerencia}`)).toBe(true);
        expect(deGerencia.has(`mej-arbitrar:${arbitraElAdmin}`)).toBe(false);
        expect(deGerencia.has(`mej-ajuste:${ajusteDeGerencia}`)).toBe(true);
        expect(deGerencia.has(`mej-ajuste:${ajusteDelAdmin}`)).toBe(false);
        // Control Interno valida la corrección del Admin SGC y verifica donde él ejecutó.
        const deControl = await ids(b.control);
        expect(deControl.has(`mej-validar:${corrigioElAdmin}`)).toBe(true);
        expect(deControl.has(`mej-verificar:${ejecutoElAdmin}`)).toBe(true);
      }),
  );
});
