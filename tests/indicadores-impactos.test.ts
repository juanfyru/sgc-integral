/**
 * Los impactos por cambio de norma sobre los indicadores (anexo 14B, §9): cuando una norma pasa a modificada, derogada o
 * retirada nace una revisión por cada indicador activo cuya ficha vigente la cita, con su aviso a los Administradores del
 * SGC; se resuelve en la página del indicador («No afecta»), con una versión nueva de la ficha o con el retiro; es tarea
 * de quien administra indicadores, vence, avisa y escala. Los impactos de documentos y de procesos de la 13C no cambian.
 * Contra la BD de desarrollo, dentro de una transacción que se revierte: ninguna ficha aprobada queda confirmada.
 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ tx: null as unknown, sesion: null as unknown }));

vi.mock("@/db/cliente", async (importar) => {
  const real = await importar<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.tx ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({
  exigirSesion: async () => contexto.sesion,
  exigirPermiso: async () => contexto.sesion,
  exigirEntradaPanel: async () => contexto.sesion,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  redirect: (destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  },
  usePathname: () => "/indicadores",
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/app/acciones-indicadores", () => ({
  crearIndicadorAccion: vi.fn(),
  guardarBorradorAccion: vi.fn(),
  abrirCambioAccion: vi.fn(),
  enviarAAprobacionAccion: vi.fn(),
  aprobarFichasAccion: vi.fn(),
  devolverFichaAccion: vi.fn(),
  descartarBorradorAccion: vi.fn(),
  designarAccion: vi.fn(),
  cambiarOperacionAccion: vi.fn(),
  duplicarAccion: vi.fn(),
  retirarAccion: vi.fn(),
  descartarIndicadorAccion: vi.fn(),
  borrarIndicadorAccion: vi.fn(),
  reportarAccion: vi.fn(),
  marcarNoAplicaAccion: vi.fn(),
  quitarNoAplicaAccion: vi.fn(),
  quitarSoporteAccion: vi.fn(),
  analizarAccion: vi.fn(),
  observarAccion: vi.fn(),
  responderAccion: vi.fn(),
  programarMetaAccion: vi.fn(),
  registrarHistoricosAccion: vi.fn(),
  cerrarMesAccion: vi.fn(),
  reabrirMedicionAccion: vi.fn(),
  cerrarDeNuevoAccion: vi.fn(),
  volverACalcularAccion: vi.fn(),
  registrarConstanciaAccion: vi.fn(),
  corregirConstanciaAccion: vi.fn(),
  quitarSoporteDeConstanciaAccion: vi.fn(),
  resolverImpactoNoAfectaAccion: vi.fn(),
}));
vi.mock("@/app/acciones-normograma", () => ({ resolverImpactoAccion: vi.fn() }));

import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaImpactosDelCambio from "@/app/(app)/normograma/impactos/[cambioId]/page";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { aprobarFichas, enviarAAprobacion, versionVigente } from "@/db/consultas/indicadores/aprobacion";
import { abrirCambio, crearIndicador, guardarBorrador } from "@/db/consultas/indicadores/fichas";
import {
  impactosDeIndicadoresVencidos,
  impactosPendientesDe,
  indicadoresDelCambio,
  INTERBLOQUEO_NORMA_O_FICHA,
  legibleSiInterbloqueo,
  resolverImpactoNoAfecta,
  tareasDeImpactosDeIndicadores,
} from "@/db/consultas/indicadores/impactos";
import { condicionDeDeshacer, deshacerImportacion } from "@/db/consultas/indicadores/importacion";
import { borrarIndicador, retirar } from "@/db/consultas/indicadores/operacion";
import { alPublicarVersion } from "@/db/consultas/indicadores/publicacion";
import { tareasDeIndicadores } from "@/db/consultas/indicadores/tareas";
import { revisarVencimientosDeIndicadores } from "@/db/consultas/indicadores/vencimientos";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { asociarProceso, enlazarDocumento } from "@/db/consultas/normograma/asociaciones";
import { tareasDeImpactos } from "@/db/consultas/normograma/impactos";
import { cambiarEstadoEn, cambiarEstadoNorma, plazoDeImpactos, retirarNorma } from "@/db/consultas/normograma/normas";
import { registrarRelacion } from "@/db/consultas/normograma/relaciones";
import type { DatosFicha } from "@/lib/esquemas/indicadores";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { ErrorPermiso } from "@/lib/permisos";
import { agruparTareas, type Tarea } from "@/lib/tareas";
import { fechaLimite } from "@/lib/tramites/plazos";
import { textoFecha } from "@/lib/vigencia/plazo";
import { zonaHoraria } from "@/lib/zona-horaria";
import { indicadorDePrueba, silenciarIndicadores, versionAutomatica } from "./utiles/indicadores";
import { normaDePrueba } from "./utiles/normograma";
import { documentoLibre, sesionAdmin, sesionDe, usuarioDePrueba } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";
import { firmaDePrueba } from "./utiles/vigencia";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

/** La aprobación de la versión 1, el cambio de la norma y lo que viene después, en ese orden. */
const T0 = new Date("2026-11-10T15:00:00Z");
const T1 = new Date("2026-11-11T15:00:00Z");
const T2 = new Date("2026-11-12T15:00:00Z");
const T3 = new Date("2026-11-13T15:00:00Z");
const FECHA_DEL_CAMBIO = "2026-11-11";
const DIA = 86_400_000;
const CLAVE = { clave: "ok" };

let consecutivo = 0;
const unico = () => `${Date.now() % 100_000_000}${(consecutivo += 1)}`;

const firmar = (tx: TransactionSql, ahora: Date) => ({ sql: tx, ahora, verificar: firmaDePrueba });

type Base = { admin: SesionFlujo; sgc: number; tipoId: number; estrategico: number; porcentaje: number; cargoId: number };

async function base(tx: TransactionSql): Promise<Base> {
  const [p] = await tx`SELECT id FROM procesos WHERE sigla = 'SGC'`;
  const [t] = await tx`SELECT id FROM tipos_indicador WHERE nombre = 'Eficacia'`;
  const [es] = await tx`SELECT id FROM clasificaciones_indicador WHERE nombre = 'Estratégico'`;
  const [u] = await tx`SELECT id FROM unidades_indicador WHERE nombre = 'Porcentaje'`;
  const [area] = await tx`SELECT id FROM areas ORDER BY id LIMIT 1`;
  const [c] = await tx`INSERT INTO cargos (nombre, area_id) VALUES (${`ZZ Cargo ${unico()}`}, ${area.id}) RETURNING id`;
  return {
    admin: await sesionAdmin(tx),
    sgc: Number(p.id),
    tipoId: Number(t.id),
    estrategico: Number(es.id),
    porcentaje: Number(u.id),
    cargoId: Number(c.id),
  };
}

const RANGOS_90 = JSON.stringify({ bien: [{ signo: ">=", valor: "90" }], atencion: [{ signo: ">=", valor: "63" }], critico: [{ signo: "<", valor: "63" }] });
const RANGOS_85 = JSON.stringify({ bien: [{ signo: ">=", valor: "85" }], atencion: [{ signo: ">=", valor: "59.5" }], critico: [{ signo: "<", valor: "59.5" }] });

/** Una ficha estratégica (la aprueba Gerencia) de forma «porcentaje», trimestral desde 2026-T1, ya probada. */
const datos = (b: Base, parcial: Partial<DatosFicha> = {}): DatosFicha => ({
  procesoId: b.sgc,
  nombre: "Cumplimiento del plan de capacitación",
  proposito: "Saber si se ejecutan las capacitaciones programadas",
  tipoId: b.tipoId,
  clasificacionId: b.estrategico,
  forma: "porcentaje",
  variables: [
    { letra: "A", nombre: "Capacitaciones ejecutadas", consolidacion: "suma", admiteNegativos: false },
    { letra: "B", nombre: "Capacitaciones programadas", consolidacion: "suma", admiteNegativos: false },
  ],
  unidadId: b.porcentaje,
  decimales: 1,
  periodicidad: "trimestral",
  tendencia: "ascendente",
  meta: "90",
  semaforoModo: "rangos",
  rangos: RANGOS_90,
  cargosMedir: [b.cargoId],
  cargosAnalizar: [b.cargoId],
  normaIds: [],
  plazoReporteDias: 10,
  inicioMedicion: "2026-T1",
  soporteObligatorio: false,
  nivelAcceso: "general",
  mide: [],
  analiza: [],
  prueba: { valores: { A: "9", B: "10" } },
  ...parcial,
});

/** Crea, envía y aprueba (con Gerencia) la ficha a la hora dada: queda la versión 1 aprobada y el indicador activo. */
async function aprobada(tx: TransactionSql, b: Base, d: DatosFicha, ahora = T0) {
  const creado = await crearIndicador(b.admin, d, { sql: tx, ahora });
  await enviarAAprobacion(b.admin, { versionId: creado.versionId, credenciales: CLAVE }, firmar(tx, ahora));
  const gerente = await usuarioDePrueba(tx, { rol: "gerencia" });
  await aprobarFichas(gerente, { versionIds: [creado.versionId], credenciales: CLAVE }, firmar(tx, ahora));
  return { ...creado, gerente };
}

/** Un cambio sobre la ficha aprobada, abierto y guardado por `quien` a la hora dada; devuelve la versión nueva. */
async function cambio(tx: TransactionSql, quien: SesionFlujo, indicadorId: number, d: DatosFicha, ahora: Date) {
  const { versionId } = await abrirCambio(quien, indicadorId, { sql: tx, ahora });
  await guardarBorrador(quien, versionId, d, { sql: tx, ahora });
  return versionId;
}

/** Un cambio mayor (la meta pasa a 85): va a aprobación. */
const mayor = (d: DatosFicha): DatosFicha => ({ ...d, meta: "85", rangos: RANGOS_85, motivoCambio: "La meta de 90 no es alcanzable este año" });

const derogar = (tx: TransactionSql, quien: SesionFlujo, normaId: number, ahora = T1) =>
  cambiarEstadoNorma(quien, { normaId, estado: "derogada", fecha: FECHA_DEL_CAMBIO, nota: null }, { sql: tx, ahora });

const impactosDelIndicador = (tx: TransactionSql, indicadorId: number) =>
  tx`SELECT id, norma_cambio_id, norma_id, estado, vence_en, resolucion, version_id, nota, resuelto_por, resuelto_en, creado_en
    FROM impactos_indicadores WHERE indicador_id = ${indicadorId} ORDER BY id`;

const avisosDe = (tx: TransactionSql, usuarioId: number, tipo: string) =>
  tx`SELECT titulo, cuerpo, enlace, entidad, entidad_id FROM notificaciones WHERE usuario_id = ${usuarioId} AND tipo = ${tipo} ORDER BY id`;

async function rechaza(promesa: Promise<unknown>, mensaje: string) {
  const err = await promesa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  expect((err as Error).message).toBe(mensaje);
}

const sinEtiquetas = (html: string) => html.replace(/<[^>]+>/g, " ").replaceAll("&quot;", '"').replaceAll("&amp;", "&").replace(/\s+/g, " ");

/** Pinta `pagina` con la conexión de la prueba y la sesión dada; un `notFound` vuelve como «NO_ENCONTRADA». */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<React.ReactElement>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    return renderToStaticMarkup(await pagina());
  } catch (err) {
    if ((err as Error).message === "NO_ENCONTRADA") return "NO_ENCONTRADA";
    throw err;
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const paginaIndicador = (codigo: string) => () => PaginaIndicador({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve({}) });
const paginaImpactos = (cambioId: number, proceso: number) => () =>
  PaginaImpactosDelCambio({ params: Promise.resolve({ cambioId: String(cambioId) }), searchParams: Promise.resolve({ proceso: String(proceso) }) });

describe("nacimiento de los impactos de indicadores", () => {
  it("derogar una norma abre un impacto por cada indicador activo cuya ficha vigente la cita", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const otroAdmin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, b.admin);
      const cita = await aprobada(tx, b, datos(b, { normaIds: [n.id] }));
      // Un borrador que la cita, un retirado que la citaba y uno cuya ficha vigente ya no la cita: ninguno abre impacto.
      const borrador = await indicadorDePrueba(tx, { estado: "borrador", normaIds: [n.id] });
      const retirado = await indicadorDePrueba(tx, { normaIds: [n.id] });
      await retirar(b.admin, { indicadorId: retirado.id, motivo: "Se dejó de medir" }, { sql: tx, ahora: T0 });
      const yaNoLaCita = await aprobada(tx, b, datos(b, { normaIds: [n.id] }));
      const v2 = await cambio(tx, b.admin, yaNoLaCita.indicadorId, datos(b, { normaIds: [] }), T0);
      await enviarAAprobacion(b.admin, { versionId: v2, motivo: "Ya no aplica la norma", credenciales: CLAVE }, firmar(tx, T0));

      const plazo = await plazoDeImpactos(tx);
      const r = await cambiarEstadoEn(
        tx,
        b.admin,
        { normaId: n.id, estado: "derogada", fecha: FECHA_DEL_CAMBIO, nota: null, relacionId: null },
        { ahora: T1, plazoDias: plazo },
      );
      expect(r).toEqual({ cambioId: expect.any(Number), impactos: 0, impactosDeIndicadores: 1 });

      // El plazo es el de los impactos de la 13C (`fechaLimite` desde el cambio, en la zona de la instalación).
      expect(await impactosDelIndicador(tx, cita.indicadorId)).toEqual([
        {
          id: expect.any(Number),
          norma_cambio_id: r.cambioId,
          norma_id: n.id,
          estado: "pendiente",
          vence_en: fechaLimite(T1, plazo, zonaHoraria()),
          resolucion: null,
          version_id: null,
          nota: null,
          resuelto_por: null,
          resuelto_en: null,
          creado_en: T1,
        },
      ]);
      for (const otro of [borrador.id, retirado.id, yaNoLaCita.indicadorId]) expect(await impactosDelIndicador(tx, otro)).toEqual([]);

      // El aviso es para los Administradores del SGC activos, salvo para quien hizo el cambio.
      expect(await avisosDe(tx, otroAdmin.usuarioId, "indicadores.impacto")).toEqual([
        {
          titulo: `1 indicador cita ${n.nombre}, que pasó a derogada: revise su ficha`,
          cuerpo: "Cada revisión se resuelve en la página del indicador: no afecta, una versión nueva de la ficha o el retiro.",
          enlace: "/indicadores?impacto=1",
          entidad: "norma",
          entidad_id: n.id,
        },
      ]);
      expect(await avisosDe(tx, b.admin.usuarioId, "indicadores.impacto")).toEqual([]);
      // La bitácora del cambio de estado cuenta los de indicadores aparte de los de documentos y procesos.
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'norma_estado' AND entidad_id = ${n.id}`;
      expect(bitacora.detalle).toMatchObject({ impactos: 0, impactosDeIndicadores: 1 });

      // Con dos o más, el aviso habla en plural; volver a vigente no abre impactos.
      const m = await normaDePrueba(tx, b.admin);
      await indicadorDePrueba(tx, { normaIds: [m.id] });
      await indicadorDePrueba(tx, { normaIds: [m.id] });
      await retirarNorma(b.admin, { normaId: m.id, motivo: "Registrada por error" }, { sql: tx, ahora: T1 });
      expect((await avisosDe(tx, otroAdmin.usuarioId, "indicadores.impacto")).map((a) => a.titulo)).toContain(
        `2 indicadores citan ${m.nombre}, que pasó a retirada: revise cada ficha`,
      );
      expect(await cambiarEstadoNorma(b.admin, { normaId: n.id, estado: "vigente", fecha: "2026-11-12", nota: "Por error" }, { sql: tx, ahora: T2 })).toEqual({
        cambioId: expect.any(Number),
        impactos: 0,
      });
      expect(await impactosDelIndicador(tx, cita.indicadorId)).toHaveLength(1);
    }));

  it("los impactos de documentos y de procesos de la 13C nacen igual que antes", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const liderGth = await sesionDe(tx, "lider.gth");
      const liderCex = await sesionDe(tx, "lider.cex");
      const [gth] = await tx`SELECT id FROM procesos WHERE sigla = 'GTH'`;
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const n = await normaDePrueba(tx, admin);
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
      await asociarProceso(admin, { normaId: n.id, procesoId: Number(cex.id), requisito: null }, { sql: tx });

      /** Lo que la 13C deja al derogar, con el número del cambio cambiado por «C»: se compara entre dos corridas. */
      async function lo13C(sp: TransactionSql) {
        const r = await derogar(sp, admin, n.id);
        const c = String(r.cambioId);
        // Solo el número del cambio en el id y en el enlace: el nombre de la norma de prueba también tiene cifras.
        const sinCambio = (t: string | null) => (t === null ? null : t.replace(`impacto:${c}:`, "impacto:C:").replace(`/impactos/${c}?`, "/impactos/C?"));
        const filas = await sp`SELECT documento_id, proceso_id, estado, vence_en, creado_en FROM impactos_normativos WHERE cambio_id = ${r.cambioId} ORDER BY id`;
        const tareas = [...(await tareasDeImpactos(liderGth, { sql: sp })), ...(await tareasDeImpactos(liderCex, { sql: sp }))]
          .filter((t) => t.id.startsWith(`impacto:${c}:`))
          .map((t) => ({ ...t, id: sinCambio(t.id), enlace: sinCambio(t.enlace) }));
        const avisos = (
          await sp`SELECT usuario_id, titulo, cuerpo, enlace FROM notificaciones WHERE tipo = 'normograma.cambio' AND entidad_id = ${n.id} ORDER BY usuario_id, id`
        ).map((a) => ({ ...a, enlace: sinCambio(a.enlace as string | null) }));
        const indicadores = await sp`SELECT 1 FROM impactos_indicadores WHERE norma_cambio_id = ${r.cambioId}`;
        return { resultado: { ...r, cambioId: "C" }, filas, tareas, avisos, indicadores: indicadores.length };
      }

      class Fin extends Error {
        constructor(readonly valor: Awaited<ReturnType<typeof lo13C>>) {
          super("fin");
        }
      }
      /** Corre `lo13C` en un punto de guardado que se revierte: las dos corridas parten de la misma base. */
      async function corrida() {
        try {
          await tx.savepoint(async (sp) => {
            throw new Fin(await lo13C(sp));
          });
        } catch (err) {
          if (err instanceof Fin) return err.valor;
          throw err;
        }
        throw new Error("sin resultado");
      }

      const sin = await corrida();
      expect(sin.indicadores).toBe(0);
      expect(sin.filas).toHaveLength(2);
      expect(sin.tareas).toHaveLength(2);
      expect(sin.avisos.length).toBeGreaterThan(0);

      // Con un indicador de GTH que cita la norma: lo de la 13C es idéntico y, aparte, nace la revisión del indicador.
      await indicadorDePrueba(tx, { procesoId: Number(gth.id), normaIds: [n.id] });
      const con = await corrida();
      expect(con.indicadores).toBe(1);
      expect({ ...con, indicadores: 0 }).toEqual({ ...sin, indicadores: 0 });
      expect(con.resultado).toEqual({ cambioId: "C", impactos: 2 });

      // Registrar una relación que deroga devuelve lo mismo que antes.
      const nueva = await normaDePrueba(tx, admin, { anio: 2021 });
      const rel = await registrarRelacion(admin, { normaId: nueva.id, afectadaId: n.id, tipo: "deroga", detalle: null }, { sql: tx, ahora: T1 });
      expect(rel).toEqual({ relacionId: expect.any(Number), cambioId: expect.any(Number), impactos: 2 });
    }));
});

describe("cómo se resuelven", () => {
  it("«No afecta» exige nota y lo resuelve; la ficha se vuelve a guardar citando la norma derogada", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      const d = datos(b, { normaIds: [n.id] });
      const ind = await aprobada(tx, b, d);
      const restringido = await indicadorDePrueba(tx, { nivelAcceso: "restringido", normaIds: [n.id], aprobadaEn: T0 });
      await derogar(tx, b.admin, n.id);

      const pendientes = await impactosPendientesDe(b.admin, ind.indicadorId, { sql: tx, ahora: T2 });
      const [fila] = await impactosDelIndicador(tx, ind.indicadorId);
      expect(pendientes).toEqual([
        { id: fila.id, norma: n.nombre, estadoNuevo: "derogada", fecha: FECHA_DEL_CAMBIO, venceEn: fila.vence_en, vencido: false },
      ]);
      expect((await impactosPendientesDe(b.admin, ind.indicadorId, { sql: tx, ahora: new Date(fila.vence_en.getTime() + DIA) }))[0].vencido).toBe(true);
      const impactoId = pendientes[0].id;

      await rechaza(resolverImpactoNoAfecta(b.admin, { impactoId, nota: "  no " }, { sql: tx, ahora: T2 }), "La nota debe tener al menos 5 caracteres");
      await rechaza(resolverImpactoNoAfecta(b.admin, { impactoId, nota: "x".repeat(501) }, { sql: tx, ahora: T2 }), "La nota no puede pasar de 500 caracteres");
      await expect(resolverImpactoNoAfecta(ind.gerente, { impactoId, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 })).rejects.toThrow(ErrorPermiso);
      await rechaza(resolverImpactoNoAfecta(b.admin, { impactoId: 987_654_321, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 }), "El impacto no existe");
      // Quien no ve el indicador recibe «no existe», no «sin permiso»: la condición de persona va antes que el permiso.
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const [deRestringido] = await impactosDelIndicador(tx, restringido.id);
      await rechaza(resolverImpactoNoAfecta(consulta, { impactoId: deRestringido.id, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 }), "El impacto no existe");
      await expect(resolverImpactoNoAfecta(consulta, { impactoId, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 })).rejects.toThrow(ErrorPermiso);

      await resolverImpactoNoAfecta(b.admin, { impactoId, nota: "  La meta y la fórmula siguen igual  " }, { sql: tx, ahora: T2 });
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toMatchObject([
        { estado: "resuelto", resolucion: "no_afecta", nota: "La meta y la fórmula siguen igual", version_id: null, resuelto_por: b.admin.usuarioId, resuelto_en: T2 },
      ]);
      await rechaza(resolverImpactoNoAfecta(b.admin, { impactoId, nota: "Otra vez lo mismo" }, { sql: tx, ahora: T2 }), "Ese impacto ya está resuelto");
      expect(await impactosPendientesDe(b.admin, ind.indicadorId, { sql: tx, ahora: T2 })).toEqual([]);
      const bitacora = await tx`SELECT usuario_id, entidad, detalle FROM auditoria WHERE accion = 'impacto_indicador_resuelto' AND entidad_id = ${ind.indicadorId}`;
      expect(bitacora).toHaveLength(1);
      expect(bitacora[0]).toMatchObject({ entidad: "indicador", detalle: { codigo: ind.codigo, norma: n.nombre, resolucion: "no_afecta", nota: "La meta y la fórmula siguen igual" } });
      expect(Number(bitacora[0].usuario_id)).toBe(b.admin.usuarioId);

      // Review Focus 6: la ficha se vuelve a guardar y a publicar citando la norma que ya citaba, aunque esté derogada.
      const v2 = await cambio(tx, b.admin, ind.indicadorId, { ...d, nombre: "Capacitaciones del plan cumplidas" }, T2);
      expect(await enviarAAprobacion(b.admin, { versionId: v2, motivo: "Aclarar el nombre", credenciales: CLAVE }, firmar(tx, T2))).toEqual({
        codigo: ind.codigo,
        menor: true,
      });
      expect(await versionVigente(tx, ind.indicadorId)).toEqual({ id: v2, numero: 2 });
      expect((await tx`SELECT norma_id FROM indicador_normas WHERE version_id = ${v2}`).map((f) => Number(f.norma_id))).toEqual([n.id]);
    }));

  it("una cita nueva de una norma derogada se sigue rechazando", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      const ind = await aprobada(tx, b, datos(b));
      await derogar(tx, b.admin, n.id);
      const { versionId } = await abrirCambio(b.admin, ind.indicadorId, { sql: tx, ahora: T2 });
      await rechaza(guardarBorrador(b.admin, versionId, datos(b, { normaIds: [n.id] }), { sql: tx, ahora: T2 }), "Solo se pueden citar normas vigentes o modificadas");
      await rechaza(crearIndicador(b.admin, datos(b, { normaIds: [n.id] }), { sql: tx, ahora: T2 }), "Solo se pueden citar normas vigentes o modificadas");
    }));

  it("una versión enviada después del impacto lo resuelve al aprobarse, a nombre de quien la elaboró", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const elaborador = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, b.admin);
      const d = datos(b, { normaIds: [n.id] });
      const ind = await aprobada(tx, b, d);
      await derogar(tx, b.admin, n.id);

      const v2 = await cambio(tx, elaborador, ind.indicadorId, mayor(d), T2);
      expect(await enviarAAprobacion(elaborador, { versionId: v2, credenciales: CLAVE }, firmar(tx, T2))).toEqual({ codigo: ind.codigo, menor: false });
      // Enviada no basta: sigue pendiente hasta que se apruebe.
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toMatchObject([{ estado: "pendiente" }]);

      await aprobarFichas(ind.gerente, { versionIds: [v2], credenciales: CLAVE }, firmar(tx, T3));
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toMatchObject([
        { estado: "resuelto", resolucion: "nueva_version", version_id: v2, nota: null, resuelto_por: elaborador.usuarioId, resuelto_en: T3 },
      ]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_aprobado' AND entidad_id = ${ind.indicadorId} AND (detalle->>'versionId')::bigint = ${v2}`;
      expect(bitacora.detalle).toMatchObject({ impactosResueltos: 1 });
    }));

  it("un cambio menor publicado después del impacto lo resuelve al publicarse", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      const d = datos(b, { normaIds: [n.id] });
      const ind = await aprobada(tx, b, d);
      await derogar(tx, b.admin, n.id);

      const v2 = await cambio(tx, b.admin, ind.indicadorId, { ...d, nombre: "Capacitaciones del plan cumplidas" }, T2);
      await enviarAAprobacion(b.admin, { versionId: v2, motivo: "Aclarar el nombre", credenciales: CLAVE }, firmar(tx, T2));
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toMatchObject([
        { estado: "resuelto", resolucion: "nueva_version", version_id: v2, resuelto_por: b.admin.usuarioId, resuelto_en: T2 },
      ]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_cambio_menor' AND entidad_id = ${ind.indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ versionId: v2, impactosResueltos: 1 });

      // También en una ficha que pasa a calcularla el sistema: la publicación de un automático no se salta la revisión.
      const m = await normaDePrueba(tx, b.admin);
      const manual = await indicadorDePrueba(tx, { normaIds: [m.id], aprobadaEn: T0 });
      await derogar(tx, b.admin, m.id);
      const automatica = await versionAutomatica(tx, {
        indicadorId: manual.id,
        usuarioId: b.admin.usuarioId,
        rigeDesde: "2026-11",
        aprobadaEn: T2,
        periodicidad: "mensual",
        calculo: { clave: "dentro_plazo", alcance: "entidad" },
      });
      const publicado = await alPublicarVersion(tx, { indicadorId: manual.id, versionId: automatica, elaboradaPor: b.admin.usuarioId, elaboradaEn: T2, actorId: b.admin.usuarioId, ahora: T2 });
      expect(publicado.impactosResueltos).toBe(1);
      expect(await impactosDelIndicador(tx, manual.id)).toMatchObject([{ estado: "resuelto", resolucion: "nueva_version", version_id: automatica }]);
    }));

  it("una versión que ya estaba por aprobar cuando cambió la norma no lo resuelve", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      const d = datos(b, { normaIds: [n.id] });
      const ind = await aprobada(tx, b, d);
      const v2 = await cambio(tx, b.admin, ind.indicadorId, mayor(d), T1);
      await enviarAAprobacion(b.admin, { versionId: v2, credenciales: CLAVE }, firmar(tx, T1));
      await derogar(tx, b.admin, n.id, T2);

      // La cita no es nueva (la versión 1 ya la tenía): se aprueba, pero no resuelve la revisión que nació después.
      await aprobarFichas(ind.gerente, { versionIds: [v2], credenciales: CLAVE }, firmar(tx, T3));
      expect(await versionVigente(tx, ind.indicadorId)).toEqual({ id: v2, numero: 2 });
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toMatchObject([{ estado: "pendiente", resolucion: null, version_id: null }]);
    }));

  it("aprobar una versión que cita por primera vez una norma que dejó de estar vigente se rechaza", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      // Un cambio mayor que añade la norma, enviado mientras estaba vigente.
      const ind = await aprobada(tx, b, datos(b));
      const v2 = await cambio(tx, b.admin, ind.indicadorId, mayor(datos(b, { normaIds: [n.id] })), T1);
      await enviarAAprobacion(b.admin, { versionId: v2, credenciales: CLAVE }, firmar(tx, T1));
      await derogar(tx, b.admin, n.id, T2);
      await rechaza(
        aprobarFichas(ind.gerente, { versionIds: [v2], credenciales: CLAVE }, firmar(tx, T3)),
        `La norma ${n.nombre} ya no está vigente: devuelva la ficha ${ind.codigo}`,
      );
      expect(await versionVigente(tx, ind.indicadorId)).toEqual({ id: ind.versionId, numero: 1 });

      // Una ficha nueva: todas sus citas son nuevas. Una norma modificada sigue valiendo.
      const m = await normaDePrueba(tx, b.admin);
      const modificada = await normaDePrueba(tx, b.admin);
      const nuevo = await crearIndicador(b.admin, datos(b, { normaIds: [m.id, modificada.id] }), { sql: tx, ahora: T1 });
      await enviarAAprobacion(b.admin, { versionId: nuevo.versionId, credenciales: CLAVE }, firmar(tx, T1));
      await cambiarEstadoNorma(b.admin, { normaId: modificada.id, estado: "modificada", fecha: FECHA_DEL_CAMBIO, nota: null }, { sql: tx, ahora: T2 });
      await retirarNorma(b.admin, { normaId: m.id, motivo: "Registrada por error" }, { sql: tx, ahora: T2 });
      await rechaza(
        aprobarFichas(ind.gerente, { versionIds: [nuevo.versionId], credenciales: CLAVE }, firmar(tx, T3)),
        `La norma ${m.nombre} ya no está vigente: devuelva la ficha ${nuevo.codigo}`,
      );
    }));

  it("retirar el indicador resuelve sus impactos", () =>
    revertida(sql, async (tx) => {
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      const m = await normaDePrueba(tx, b.admin);
      const ind = await aprobada(tx, b, datos(b, { normaIds: [n.id, m.id] }));
      await derogar(tx, b.admin, n.id);
      await derogar(tx, b.admin, m.id);
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toHaveLength(2);

      await retirar(b.admin, { indicadorId: ind.indicadorId, motivo: "Se dejó de medir en el hospital" }, { sql: tx, ahora: T2 });
      expect(await impactosDelIndicador(tx, ind.indicadorId)).toMatchObject([
        { estado: "resuelto", resolucion: "retiro", version_id: null, resuelto_por: b.admin.usuarioId, resuelto_en: T2 },
        { estado: "resuelto", resolucion: "retiro", version_id: null, resuelto_por: b.admin.usuarioId, resuelto_en: T2 },
      ]);
      const [bitacora] = await tx`SELECT detalle FROM auditoria WHERE accion = 'indicador_retirado' AND entidad_id = ${ind.indicadorId}`;
      expect(bitacora.detalle).toMatchObject({ impactosResueltos: 2 });
    }));
});

describe("la tarea, los vencimientos y la visibilidad", () => {
  it("la tarea es de quien administra indicadores; vence, avisa y escala sin nombrar el indicador", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const b = await base(tx);
      const jefe = await usuarioDePrueba(tx, { rol: "consulta" });
      const conJefe = await usuarioDePrueba(tx, { rol: "admin_sgc", jefeId: jefe.usuarioId });
      const n = await normaDePrueba(tx, b.admin);
      const ind = await indicadorDePrueba(tx, { normaIds: [n.id], aprobadaEn: T0 });
      const [{ nombre }] = await tx`SELECT nombre FROM indicador_versiones WHERE id = ${ind.versionId}`;
      await derogar(tx, b.admin, n.id);
      const [fila] = await impactosDelIndicador(tx, ind.id);
      const vence = fila.vence_en as Date;

      const id = `impacto-indicador:${fila.id}`;
      expect((await tareasDeImpactosDeIndicadores(tx, conJefe)).find((t) => t.id === id)).toEqual({
        id,
        modulo: "indicadores",
        titulo: `Revisar ${ind.codigo} por el cambio de ${n.nombre}`,
        detalle: nombre,
        vence,
        enlace: `/indicadores/${encodeURIComponent(ind.codigo)}?vista=ficha`,
      });
      for (const rol of ["gerencia", "control_interno", "lider_proceso", "consulta"] as const) {
        expect(await tareasDeImpactosDeIndicadores(tx, await usuarioDePrueba(tx, { rol }))).toEqual([]);
      }
      // En «Mis tareas» y en la insignia: la vencida cuenta aparte de las mediciones y las constancias.
      const despues = new Date(vence.getTime() + DIA);
      const conImpacto = await tareasDeIndicadores(conJefe, { sql: tx, ahora: despues });
      expect(conImpacto.tareas.map((t) => t.id)).toContain(id);

      // Vence el día de su fecha límite: ese día no avisa; al siguiente, una vez, a los Admin SGC, sin código ni nombre.
      const pasada = (ahora: Date) => impactosDeIndicadoresVencidos({ sql: tx, ahora, escalamientoDias: 3 });
      expect(await pasada(vence)).toEqual({ avisados: 0, escalados: 0 });
      expect(await pasada(despues)).toEqual({ avisados: 1, escalados: 0 });
      expect(await pasada(despues)).toEqual({ avisados: 0, escalados: 0 });
      const [aviso] = await avisosDe(tx, conJefe.usuarioId, "indicadores.impacto_vencido");
      expect(aviso).toMatchObject({ titulo: `Venció la revisión de 1 indicador por el cambio de ${n.nombre}`, enlace: "/indicadores?impacto=1" });
      expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain(ind.codigo);
      expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain(nombre);
      expect(await avisosDe(tx, jefe.usuarioId, "indicadores.impacto_escalado")).toEqual([]);

      // Vencida hace 3 días no escala con 3; hace 4, sí: a los jefes de los Admin SGC, sin enlace ni indicador.
      expect(await pasada(new Date(vence.getTime() + 3 * DIA))).toEqual({ avisados: 0, escalados: 0 });
      const escala = new Date(vence.getTime() + 4 * DIA);
      expect(await pasada(escala)).toEqual({ avisados: 0, escalados: 1 });
      expect(await pasada(escala)).toEqual({ avisados: 0, escalados: 0 });
      const delJefe = await avisosDe(tx, jefe.usuarioId, "indicadores.impacto_escalado");
      expect(delJefe).toHaveLength(1);
      expect(delJefe[0]).toMatchObject({ titulo: "Revisiones de indicadores por cambio de norma vencidas", enlace: null });
      expect(delJefe[0].cuerpo).toContain(conJefe.nombre);
      expect(delJefe[0].cuerpo).toContain(n.nombre);
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo}`).not.toContain(ind.codigo);
      expect(`${delJefe[0].titulo} ${delJefe[0].cuerpo}`).not.toContain(nombre);
      const [marcas] = await tx`SELECT aviso_vencido_en, escalado_en FROM impactos_indicadores WHERE id = ${fila.id}`;
      expect(marcas).toEqual({ aviso_vencido_en: despues, escalado_en: escala });

      // La insignia: resolverla quita exactamente una vencida.
      await resolverImpactoNoAfecta(b.admin, { impactoId: fila.id, nota: "La ficha no cambia" }, { sql: tx, ahora: escala });
      const sinImpacto = await tareasDeIndicadores(conJefe, { sql: tx, ahora: despues });
      expect(sinImpacto.tareas.map((t) => t.id)).not.toContain(id);
      expect(conImpacto.vencidas - sinImpacto.vencidas).toBe(1);
    }));

  it("la pasada de los indicadores revisa también las revisiones vencidas, y una resuelta no se avisa", () =>
    revertida(sql, async (tx) => {
      await silenciarIndicadores(tx);
      const b = await base(tx);
      const n = await normaDePrueba(tx, b.admin);
      const m = await normaDePrueba(tx, b.admin);
      const ind = await indicadorDePrueba(tx, { normaIds: [n.id, m.id], aprobadaEn: T0 });
      await derogar(tx, b.admin, n.id);
      await derogar(tx, b.admin, m.id);
      const [abierto, resuelto] = await impactosDelIndicador(tx, ind.id);
      await resolverImpactoNoAfecta(b.admin, { impactoId: resuelto.id, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 });
      const despues = new Date((abierto.vence_en as Date).getTime() + DIA);
      const config = await obtenerConfigDocumental({ sql: tx });
      await revisarVencimientosDeIndicadores({ sql: tx, ahora: despues, config });
      const marcas = await tx`SELECT id, aviso_vencido_en FROM impactos_indicadores WHERE id IN (${abierto.id}, ${resuelto.id}) ORDER BY id`;
      expect(marcas).toEqual([
        { id: abierto.id, aviso_vencido_en: despues },
        { id: resuelto.id, aviso_vencido_en: null },
      ]);
    }));

  it("el aviso de la página lo ve quien ve el indicador; un restringido no sale en la sección de la 13C para quien no lo ve", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const consulta = await usuarioDePrueba(tx, { rol: "consulta" });
      const liderGth = await sesionDe(tx, "lider.gth");
      const [gth] = await tx`SELECT id, nombre FROM procesos WHERE sigla = 'GTH'`;
      const [cex] = await tx`SELECT id FROM procesos WHERE sigla = 'CEX'`;
      const n = await normaDePrueba(tx, admin);
      const doc = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
      await enlazarDocumento(admin, { normaId: n.id, documentoId: doc.id }, { sql: tx });
      await asociarProceso(admin, { normaId: n.id, procesoId: Number(cex.id), requisito: null }, { sql: tx });
      const general = await indicadorDePrueba(tx, { procesoId: Number(gth.id), normaIds: [n.id], aprobadaEn: T0 });
      const restringido = await indicadorDePrueba(tx, { procesoId: Number(gth.id), nivelAcceso: "restringido", normaIds: [n.id], aprobadaEn: T0 });
      const { cambioId } = await derogar(tx, admin, n.id);
      const [fila] = await impactosDelIndicador(tx, general.id);
      const frase = `${n.nombre} pasó a derogada el 11 nov 2026. Hay que revisar esta ficha antes del ${textoFecha(fila.vence_en as Date, zonaHoraria())}.`;
      const ADMINISTRA = "También se resuelve al aprobar una versión nueva de la ficha o al retirar el indicador.";

      // Quien administra: el aviso, «No afecta» con su nota y la frase de las otras salidas.
      const delAdmin = await pintar(tx, admin, paginaIndicador(general.codigo));
      expect(sinEtiquetas(delAdmin)).toContain("Revisión por cambio normativo");
      expect(sinEtiquetas(delAdmin)).toContain(frase);
      expect(sinEtiquetas(delAdmin)).toContain(ADMINISTRA);
      expect(sinEtiquetas(delAdmin)).toContain("No afecta");
      expect(delAdmin).toContain(`<input type="hidden" name="impactoId" value="${fila.id}"/>`);
      expect(delAdmin).toMatch(/<textarea[^>]*name="nota"/);
      expect(delAdmin).toMatch(/<label for="impacto-indicador-\d+-nota"[^>]*>Por qué no afecta<\/label>/);
      // También en las otras vistas de la página.
      const ficha = await pintar(tx, admin, () =>
        PaginaIndicador({ params: Promise.resolve({ codigo: general.codigo }), searchParams: Promise.resolve({ vista: "ficha" }) }),
      );
      expect(sinEtiquetas(ficha)).toContain(frase);

      // Quien solo ve el indicador: el aviso, sin salidas.
      const deConsulta = await pintar(tx, consulta, paginaIndicador(general.codigo));
      expect(sinEtiquetas(deConsulta)).toContain(frase);
      expect(sinEtiquetas(deConsulta)).not.toContain(ADMINISTRA);
      expect(deConsulta).not.toContain('name="impactoId"');
      // El restringido no existe para Consulta, ni sus revisiones.
      expect(await pintar(tx, consulta, paginaIndicador(restringido.codigo))).toBe("NO_ENCONTRADA");
      expect(await impactosPendientesDe(consulta, restringido.id, { sql: tx })).toEqual([]);
      expect(await impactosPendientesDe(admin, restringido.id, { sql: tx })).toHaveLength(1);

      // La página de impactos de la 13C gana la sección «Indicadores», en lectura, con lo que la persona ve.
      const delLider = await pintar(tx, liderGth, paginaImpactos(cambioId!, Number(gth.id)));
      expect(delLider).toContain('aria-label="Indicadores que citan la norma"');
      expect(delLider).toContain(`href="/indicadores/${encodeURIComponent(general.codigo)}"`);
      expect(delLider).toContain(`href="/indicadores/${encodeURIComponent(restringido.codigo)}"`);
      expect(sinEtiquetas(delLider)).toContain(`${general.codigo} Indicador de prueba ${general.codigo} Pendiente`);
      // En lectura: la revisión se resuelve en la página del indicador.
      expect(delLider).not.toContain('name="impactoId" value="' + fila.id);
      expect((await indicadoresDelCambio(liderGth, cambioId!, Number(gth.id), { sql: tx })).map((i) => i.codigo).sort()).toEqual(
        [general.codigo, restringido.codigo].sort(),
      );
      expect(await indicadoresDelCambio(consulta, cambioId!, Number(gth.id), { sql: tx })).toEqual([
        { codigo: general.codigo, nombre: `Indicador de prueba ${general.codigo}`, estado: "pendiente", resolucion: null },
      ]);
      const liderCex = await sesionDe(tx, "lider.cex");
      expect((await indicadoresDelCambio(liderCex, cambioId!, Number(gth.id), { sql: tx })).map((i) => i.codigo)).toEqual([general.codigo]);

      // Resuelta, dice cómo; en el proceso sin indicadores que la citan, la sección no aparece.
      await resolverImpactoNoAfecta(admin, { impactoId: fila.id, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 });
      expect(sinEtiquetas(await pintar(tx, liderGth, paginaImpactos(cambioId!, Number(gth.id))))).toContain(
        `${general.codigo} Indicador de prueba ${general.codigo} No afecta`,
      );
      expect(sinEtiquetas(await pintar(tx, admin, paginaIndicador(general.codigo)))).not.toContain(frase);
      const delProceso = await pintar(tx, admin, paginaImpactos(cambioId!, Number(cex.id)));
      expect(sinEtiquetas(delProceso)).toContain("Revisar el impacto de");
      expect(delProceso).not.toContain("Indicadores que citan la norma");
    }));
});

describe("deshacer y borrar", () => {
  it("un lote importado con una revisión por cambio de norma no se puede deshacer", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      const [lote] = await tx`INSERT INTO importaciones_indicadores (cargado_por, cargado_en) VALUES (${admin.usuarioId}, ${T0}) RETURNING id`;
      const loteId = Number(lote.id);
      const ind = await indicadorDePrueba(tx, { importacionId: loteId, normaIds: [n.id], aprobadaEn: T0 });
      await tx`INSERT INTO importacion_eventos (importacion_id, tipo, usuario_id, metodo, detalle, creado_en)
        VALUES (${loteId}, 'importado', ${admin.usuarioId}, 'clave',
          ${tx.json({ fichas: [{ indicadorId: ind.id, versionId: ind.versionId, estado: "aprobado" }] } as never)}, ${T0})`;
      expect(await condicionDeDeshacer(tx, loteId)).toEqual({ puede: true, impiden: [] });

      await derogar(tx, admin, n.id);
      const motivo = { codigo: ind.codigo, motivo: "tiene revisiones por cambio de norma" };
      expect(await condicionDeDeshacer(tx, loteId)).toEqual({ puede: false, impiden: [motivo] });
      let pedida = false;
      await rechaza(
        deshacerImportacion(admin, loteId, { motivo: "Se importó con la plantilla equivocada", credenciales: CLAVE }, {
          sql: tx,
          ahora: T2,
          verificar: async () => ((pedida = true), { ok: true as const, metodo: "clave" as const }),
        }),
        `No se puede deshacer: ${ind.codigo} tiene revisiones por cambio de norma`,
      );
      expect(pedida).toBe(false);
      // Resuelta, la revisión sigue siendo historia del indicador: lo sigue impidiendo.
      const [fila] = await impactosDelIndicador(tx, ind.id);
      await resolverImpactoNoAfecta(admin, { impactoId: fila.id, nota: "La ficha no cambia" }, { sql: tx, ahora: T2 });
      expect(await condicionDeDeshacer(tx, loteId)).toEqual({ puede: false, impiden: [motivo] });
    }));

  it("un borrador con revisiones por cambio de norma o reportes al ente no se borra", () =>
    revertida(sql, async (tx) => {
      const admin = await sesionAdmin(tx);
      const n = await normaDePrueba(tx, admin);
      const [cambioNorma] = await tx`INSERT INTO norma_cambios (norma_id, estado_anterior, estado_nuevo, fecha, usuario_id, creado_en)
        VALUES (${n.id}, 'vigente', 'derogada', ${FECHA_DEL_CAMBIO}, ${admin.usuarioId}, ${T1}) RETURNING id`;
      const conImpacto = await indicadorDePrueba(tx, { estado: "borrador" });
      await tx`INSERT INTO impactos_indicadores (norma_cambio_id, norma_id, indicador_id, vence_en, creado_en)
        VALUES (${cambioNorma.id}, ${n.id}, ${conImpacto.id}, ${T3}, ${T1})`;
      const conReporte = await indicadorDePrueba(tx, { estado: "borrador" });
      await tx`INSERT INTO reportes_externos (indicador_id, periodo, desde, hasta, vence_en, ente)
        VALUES (${conReporte.id}, '2026-S1', ${new Date("2026-01-01T05:00:00Z")}, ${new Date("2026-07-01T04:59:59.999Z")}, ${T3}, 'Supersalud')`;
      const mensaje = "El indicador tiene revisiones por cambio de norma o reportes al ente: no se puede borrar";
      await rechaza(borrarIndicador(admin, conImpacto.id, { sql: tx }), mensaje);
      await rechaza(borrarIndicador(admin, conReporte.id, { sql: tx }), mensaje);
      const libre = await indicadorDePrueba(tx, { estado: "borrador" });
      await borrarIndicador(admin, libre.id, { sql: tx });
      expect(await tx`SELECT 1 FROM indicadores WHERE id = ${libre.id}`).toHaveLength(0);
    }));
});

describe("lo que no es de la base", () => {
  it("un interbloqueo entre la norma y la ficha vuelve como un mensaje legible; otro error sigue igual", () => {
    const interbloqueo = Object.assign(new Error("deadlock detected"), { code: "40P01" });
    const convertido = legibleSiInterbloqueo(interbloqueo);
    expect(convertido).toBeInstanceOf(ErrorIndicador);
    expect((convertido as Error).message).toBe(INTERBLOQUEO_NORMA_O_FICHA);
    expect(INTERBLOQUEO_NORMA_O_FICHA).toBe("Otra persona estaba cambiando esa norma o esa ficha al mismo tiempo: inténtelo de nuevo");
    const otro = Object.assign(new Error("duplicate key"), { code: "23505" });
    expect(legibleSiInterbloqueo(otro)).toBe(otro);
  });

  it("más de cinco revisiones se agrupan en una tarea que lleva a la lista filtrada", () => {
    const vence = new Date("2026-11-26T04:59:59.999Z");
    const tareas: Tarea[] = Array.from({ length: 6 }, (_, k) => ({
      id: `impacto-indicador:${k + 1}`,
      modulo: "indicadores",
      titulo: `Revisar SGC-ID-00${k + 1} por el cambio de Resolución 1 de 2020`,
      detalle: null,
      vence,
      enlace: `/indicadores/SGC-ID-00${k + 1}?vista=ficha`,
    }));
    // Un `impacto:` de la 13C con el mismo número no se mezcla con ellas.
    const ajena: Tarea = { id: "impacto:1:2", modulo: "documentos", titulo: "Revisar el impacto", detalle: null, vence, enlace: "/normograma/impactos/1?proceso=2" };
    const r = agruparTareas([...tareas, ajena], 5, new Date("2026-11-20T15:00:00Z"));
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ modulo: "indicadores", titulo: "6 indicadores por revisar por un cambio de norma", enlace: "/indicadores?impacto=1" });
    expect(r[1]).toEqual(ajena);
  });
});
