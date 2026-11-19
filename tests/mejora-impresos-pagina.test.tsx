/**
 * La página de los impresos de un hallazgo (Fase 15A, Tarea 21; spec 15 §16.4): quién la abre, qué imprime con y sin `?analisis=` y
 * el encabezado del formato elegido. Contra la BD de desarrollo, dentro de una transacción que se revierte (el cliente de la app se
 * sustituye por ella). Lo que pinta cada impreso, sin base, en `tests/mejora-impresos.test.tsx`.
 */
import { existsSync } from "node:fs";
import type { TransactionSql } from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

const contexto = vi.hoisted(() => ({ sql: null as unknown, sesion: null as unknown, seguimientosLeidos: 0 }));

vi.mock("@/db/cliente", async (original) => {
  const real = await original<typeof import("@/db/cliente")>();
  return { ...real, obtenerSql: () => (contexto.sql ?? real.obtenerSql()) as ReturnType<typeof real.obtenerSql> };
});
vi.mock("@/lib/paginas", () => ({ exigirSesion: async () => contexto.sesion }));
// Cuántas veces la página lee los seguimientos: solo el registro completo los pinta.
vi.mock("@/db/consultas/mejoramiento/formatos", async (original) => {
  const real = await original<typeof import("@/db/consultas/mejoramiento/formatos")>();
  return {
    ...real,
    seguimientosDelHallazgo: (...args: Parameters<typeof real.seguimientosDelHallazgo>) => {
      contexto.seguimientosLeidos += 1;
      return real.seguimientosDelHallazgo(...args);
    },
  };
});
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NO_ENCONTRADA");
  },
  usePathname: () => "/mejoramiento",
}));

import PaginaImprimirHallazgo from "@/app/(app)/mejoramiento/[id]/imprimir/page";
import PaginaConsolidado from "@/app/(app)/mejoramiento/consolidado/page";
import PaginaImprimirPlan from "@/app/(app)/mejoramiento/planes/[id]/imprimir/page";
import {
  APROBADO_FUERA,
  CONVENCIONES_DE_TIPO,
  PlanDeMejoramientoImpreso,
  SIN_PLAN,
} from "@/componentes/mejoramiento/impresos/PlanDeMejoramientoImpreso";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { ponerEnPlan } from "@/db/consultas/mejoramiento/clasificacion";
import { guardarConfigMejora, obtenerConfigMejora, type ConfigMejora } from "@/db/consultas/mejoramiento/config";
import type { FilaDePlanDeAccion } from "@/db/consultas/mejoramiento/filas-de-plan";
import { CONSOLIDADO_DEL_PROCESO, type Fo14 } from "@/db/consultas/mejoramiento/fo14";
import { fechaDeDia } from "@/lib/mejoramiento/formato";
import { ORIGENES } from "@/lib/mejoramiento/origenes";
import { baseDeMejora, c, HORA_DE_ESCENA, hallazgoEn, otroProcesoConLider, planDeMejoraDePrueba } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";
import { documentoLibre, opc, usuarioDePrueba } from "./utiles/tramites";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const enTransaccion = (prueba: (tx: TransactionSql) => Promise<void>) =>
  revertida(sql, async (tx) => {
    contexto.sql = tx;
    try {
      await prueba(tx);
    } finally {
      contexto.sql = null;
      contexto.sesion = null;
    }
  });

/** Los formatos elegidos, dentro de la transacción: la base de trabajo puede traer los del punto de control. */
async function formatosElegidos(tx: TransactionSql, admin: SesionFlujo, formatos: ConfigMejora["formatos"]): Promise<void> {
  await guardarConfigMejora(admin, { ...(await obtenerConfigMejora({ sql: tx })), formatos }, opc(tx));
}

async function imprimir(sesion: SesionFlujo, id: number | string, analisis?: string | string[]): Promise<string> {
  contexto.sesion = sesion;
  const pagina = await PaginaImprimirHallazgo({
    params: Promise.resolve({ id: String(id) }),
    searchParams: Promise.resolve(analisis === undefined ? {} : { analisis }),
  });
  return renderToStaticMarkup(pagina);
}

describe("/mejoramiento/[id]/imprimir", () => {
  it("quien ve el hallazgo completo imprime el registro con el encabezado del formato elegido y el pie", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      await formatosElegidos(tx, b.admin, { registro: null, porques: null, ishikawa: null, plan: null });
      const sinFormato = await imprimir(b.lider, h.id);
      expect(sinFormato).toContain(">1. Identificación<");
      expect(sinFormato).toContain(">7. Cierre<");
      expect(sinFormato).not.toContain("Fecha de emisión");
      expect(sinFormato).toContain(`por ${b.lider.nombre}`);

      const doc = await documentoLibre(tx, { proceso: "CEX", tipo: "FO" });
      await formatosElegidos(tx, b.admin, { registro: doc.id, porques: null, ishikawa: null, plan: null });
      const conFormato = await imprimir(b.lider, h.id);
      expect(conFormato).toContain(doc.codigo);
      expect(conFormato).toContain("Fecha de emisión");
      // Con `?analisis=`, ese análisis en su formato: el de 5 porqués no tiene documento elegido.
      const [a] = await tx`SELECT id FROM mejora_analisis WHERE hallazgo_id = ${h.id}`;
      const analisis = await imprimir(b.lider, h.id, String(a.id));
      expect(analisis).toContain("Los cinco porqués");
      expect(analisis).toContain("Nadie asignó el registro al turno de noche");
      expect(analisis).not.toContain(doc.codigo);
      expect(analisis).not.toContain(">1. Identificación<");
    }));

  it("imprimir un análisis no lee los seguimientos; el registro completo, sí", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      const [a] = await tx`SELECT id FROM mejora_analisis WHERE hallazgo_id = ${h.id}`;
      contexto.seguimientosLeidos = 0;
      await imprimir(b.admin, h.id, String(a.id));
      expect(contexto.seguimientosLeidos).toBe(0);
      await imprimir(b.admin, h.id);
      expect(contexto.seguimientosLeidos).toBe(1);
    }));

  it("quien lo ve solo por una actividad, un análisis de otro hallazgo o un id que no se entiende: «no encontrado»", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const responsable = await usuarioDePrueba(tx, { rol: "consulta" });
      const h = await hallazgoEn(tx, b, "en_ejecucion", undefined, { responsableId: responsable.usuarioId });
      const otro = await hallazgoEn(tx, b, "en_ejecucion");
      const [deOtro] = await tx`SELECT id FROM mejora_analisis WHERE hallazgo_id = ${otro.id}`;

      await expect(imprimir(responsable, h.id)).rejects.toThrow("NO_ENCONTRADA");
      await expect(imprimir(b.consulta, h.id)).rejects.toThrow("NO_ENCONTRADA");
      for (const raro of [String(deOtro.id), "abc", "0", ["1", "2"]]) {
        await expect(imprimir(b.admin, h.id, raro)).rejects.toThrow("NO_ENCONTRADA");
      }
      // Control positivo: quien lo ve completo sí lo imprime.
      expect(await imprimir(b.admin, h.id)).toContain(h.codigo);
    }));
});

// ── El SGC-FO-14 (Fase 15B, Tarea 7; anexo §5, maqueta 4) ──────────────────────────────────────────────────────────────────────

const ZONA = "America/Bogota";
const IMPRESO_EN = new Date("2026-11-18T15:00:00Z");

const hallazgoDeFila = (cambios?: Partial<FilaDePlanDeAccion["hallazgo"]>): FilaDePlanDeAccion["hallazgo"] => ({
  id: 1,
  codigo: "HZ-2026-019",
  titulo: "Debilidades en los informes de supervisión de contratos",
  descripcion: "Los informes no siguen un formato único.",
  clase: "no_conformidad",
  origen: "auditoria_interna",
  procesoId: 9,
  proceso: "Gestión de Bienes y Servicios",
  planCodigo: "PM-2026-02",
  ...cambios,
});

const filaConActividad = (actividad?: Partial<NonNullable<FilaDePlanDeAccion["actividad"]>>): FilaDePlanDeAccion => ({
  hallazgo: hallazgoDeFila(),
  ronda: 1,
  rondas: 1,
  accion: {
    numero: "A1",
    tipo: "correctiva",
    descripcion: "Estandarizar el informe",
    recursos: "Ninguno adicional",
    indicadorCumplimiento: "Formato publicado",
    meta: "1",
    causas: "No existía un formato único",
    metodo: "5 porqués",
  },
  actividad: {
    id: 11,
    descripcion: "elaborar el formato",
    responsable: "Laura Rojas",
    cargo: "Asesora de planeación",
    inicio: "2026-11-02",
    fin: "2026-12-31",
    reprogramada: false,
    avance: 100,
    estado: "terminada",
    vencida: false,
    ultimoSeguimiento: { fecha: "2026-11-14", realizado: "Formato publicado y socializado" },
    archivos: 2,
    ...actividad,
  },
  enQueVa: null,
});

const filaSinActividad: FilaDePlanDeAccion = {
  hallazgo: hallazgoDeFila({ id: 2, codigo: "HZ-2026-020", titulo: "Pólizas sin aprobar antes del acta de inicio", planCodigo: null, origen: "indicador" }),
  ronda: 1,
  rondas: 1,
  accion: null,
  actividad: null,
  enQueVa: "En revisión",
};

function fo14De(forma: Fo14["forma"], cambios?: Partial<Fo14>): Fo14 {
  return {
    forma,
    formato: { codigo: "SGC-FO-14", version: 1, emitidoEn: new Date("2026-02-15T05:00:00Z") },
    encabezado: {
      origenDelPlan: forma === "plan" ? "Ente de control" : CONSOLIDADO_DEL_PROCESO,
      codigoDelPlan: forma === "plan" ? "PM-2026-02" : CONSOLIDADO_DEL_PROCESO,
      macroproceso: "Procesos de Apoyo",
      proceso: "Gestión de Bienes y Servicios",
      responsables: [{ nombre: "Ana Lucía Trujillo", cargo: "Líder de Gestión de Bienes y Servicios" }],
      vigencia: 2026,
      elaboradoEl: "2026-11-18",
      fuentes: ["auditoria_interna", "indicador"],
      objetivo: forma === "plan" ? "Subsanar las observaciones del ente" : null,
    },
    filas: [filaConActividad({ reprogramada: true }), filaConActividad({ id: 12, estado: "en_proceso", vencida: true, ultimoSeguimiento: null, archivos: 0 }), filaSinActividad],
    aprobaciones: [
      {
        codigo: "HZ-2026-019",
        elaboro: { nombre: "Ana Lucía Trujillo", cargo: "Líder de Gestión de Bienes y Servicios" },
        aprobo: { nombre: "Gerente de ejemplo", cargo: "Gerente", fecha: "2026-10-30" },
        fuera: null,
      },
      { codigo: "HZ-2025-031", elaboro: null, aprobo: null, fuera: { rol: "Coordinador del SGC", fecha: "2025-11-04" } },
    ],
    ...cambios,
  };
}

const pintar = (fo14: Fo14) =>
  renderToStaticMarkup(
    <PlanDeMejoramientoImpreso fo14={fo14} entidad="Entidad de prueba" logo={null} impresoEn={IMPRESO_EN} impresoPor="María Pérez" zona={ZONA} />,
  );

const veces = (texto: string, buscado: string) => texto.split(buscado).length - 1;

describe("el SGC-FO-14 impreso", () => {
  it("la columna «Plan» sale solo en el consolidado, con el código del plan o «Sin plan»; «Estado» sale en los dos", () => {
    const consolidado = pintar(fo14De("consolidado"));
    expect(consolidado).toContain(">Plan<");
    expect(consolidado).toContain(`>${SIN_PLAN}<`);
    expect(consolidado).toContain(">PM-2026-02<");
    expect(consolidado).toContain(">Estado<");
    const dePlan = pintar(fo14De("plan"));
    expect(dePlan).not.toContain(">Plan<");
    expect(dePlan).not.toContain(SIN_PLAN);
    expect(dePlan).toContain(">Estado<");
    // El estado de cada actividad, como en el Excel del ente: el suyo o «Vencida».
    expect(dePlan).toContain(">Terminada<");
    expect(dePlan).toContain("Vencida");
  });

  it("el hallazgo sin plan de acción aprobado va con en qué va a lo ancho; «Reprogramada» junto al fin", () => {
    const html = pintar(fo14De("plan"));
    expect(html).toMatch(/<td colSpan="12"[^>]*>En revisión<\/td>/i);
    expect(html).toContain(`${fechaDeDia("2026-12-31")}<span class="block font-semibold">Reprogramada</span>`);
    // El último seguimiento y cuántos archivos tiene; sin ellos, una raya.
    expect(html).toContain("Formato publicado y socializado · 2 archivos");
    // El tipo, por su sigla, y sus convenciones al pie.
    expect(html).toContain(">AC<");
    expect(html).toContain(CONVENCIONES_DE_TIPO);
  });

  it("las catorce fuentes salen con su casilla, marcadas las de las filas", () => {
    const html = pintar(fo14De("consolidado"));
    for (const o of ORIGENES) expect(html).toContain(o.etiqueta);
    expect(veces(html, "(marcada)")).toBe(2);
    expect(veces(html, "(sin marcar)")).toBe(ORIGENES.length - 2);
  });

  it("«Aprobación y control»: quién elaboró y quién aprobó, y el cargado, «Aprobado fuera de la plataforma» con su rol", () => {
    const html = pintar(fo14De("plan"));
    expect(html).toContain(">Aprobación y control<");
    expect(html).toContain("Gerente de ejemplo");
    expect(html).toContain(`Gerente · ${fechaDeDia("2026-10-30")}`);
    expect(html).toContain(`${APROBADO_FUERA} · Coordinador del SGC · ${fechaDeDia("2025-11-04")}`);
  });

  it("sin documento elegido, el encabezado sale sin el código, la versión ni la fecha de emisión", () => {
    const con = pintar(fo14De("plan"));
    expect(con).toContain("SGC-FO-14");
    expect(con).toContain("Fecha de emisión");
    const sin = pintar(fo14De("plan", { formato: null }));
    expect(sin).not.toContain("Fecha de emisión");
    expect(sin).not.toContain(">SGC-FO-14<");
    // El pie: quién lo imprimió y cuándo.
    expect(sin).toContain("Impreso el");
    expect(sin).toContain("por María Pérez");
  });

  it("el consolidado dice «Consolidado del proceso» en el origen y en el código, y deja el objetivo en blanco", () => {
    const html = pintar(fo14De("consolidado"));
    expect(veces(html, CONSOLIDADO_DEL_PROCESO)).toBe(2);
    expect(html).not.toContain("Subsanar las observaciones del ente");
    expect(pintar(fo14De("plan"))).toContain("Subsanar las observaciones del ente");
  });
});

async function imprimirPlan(sesion: SesionFlujo, id: string, proceso?: string | string[]): Promise<string> {
  contexto.sesion = sesion;
  const pagina = await PaginaImprimirPlan({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve(proceso === undefined ? {} : { proceso }),
  });
  return renderToStaticMarkup(pagina);
}

async function consolidado(sesion: SesionFlujo, q: Record<string, string | string[]>): Promise<string> {
  contexto.sesion = sesion;
  return renderToStaticMarkup(await PaginaConsolidado({ searchParams: Promise.resolve(q) }));
}

describe("/mejoramiento/planes/[id]/imprimir y /mejoramiento/consolidado", () => {
  it("la líder del proceso imprime el de su proceso en el plan; la de otro proceso y un parámetro que no se entiende: «no encontrado»", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const plan = await planDeMejoraDePrueba(tx, b.admin);
      const h = await hallazgoEn(tx, b, "en_ejecucion");
      await ponerEnPlan(b.admin, { planId: plan.id, hallazgoIds: [h.id] }, c(HORA_DE_ESCENA, tx));
      const html = await imprimirPlan(b.lider, String(plan.id), String(b.procesoId));
      expect(html).toContain(plan.codigo);
      expect(html).toContain(h.codigo);
      expect(html).toContain(`por ${b.lider.nombre}`);
      await expect(imprimirPlan(otro.lider, String(plan.id), String(b.procesoId))).rejects.toThrow("NO_ENCONTRADA");
      await expect(imprimirPlan(b.consulta, String(plan.id), String(b.procesoId))).rejects.toThrow("NO_ENCONTRADA");
      const raros: Array<[string, string | string[] | undefined]> = [
        ["abc", String(b.procesoId)],
        [String(plan.id), undefined],
        [String(plan.id), ["1", "2"]],
        [String(plan.id), "x"],
      ];
      for (const [id, proceso] of raros) await expect(imprimirPlan(b.admin, id, proceso)).rejects.toThrow("NO_ENCONTRADA");
      // Control positivo: quien ve todo también lo imprime.
      expect(await imprimirPlan(b.admin, String(plan.id), String(b.procesoId))).toContain(h.codigo);
    }));

  it("el consolidado lo imprime quien ve todo; Consulta, un año fuera de rango o que no se entiende: «no encontrado»; sin año, el en curso", () =>
    enTransaccion(async (tx) => {
      const b = await baseDeMejora(tx);
      const h = await hallazgoEn(tx, b, "en_revision");
      const proceso = String(b.procesoId);
      const html = await consolidado(b.admin, { proceso, anio: "2026" });
      expect(html).toContain(CONSOLIDADO_DEL_PROCESO);
      expect(html).toContain(h.codigo);
      expect(html).toContain('name="anio"');
      await expect(consolidado(b.consulta, { proceso, anio: "2026" })).rejects.toThrow("NO_ENCONTRADA");
      const raros: Array<Record<string, string | string[]>> = [
        { proceso, anio: "1999" },
        { proceso, anio: "abc" },
        { proceso, anio: ["2026", "2027"] },
        { anio: "2026" },
        { proceso: "x" },
      ];
      for (const q of raros) await expect(consolidado(b.admin, q)).rejects.toThrow("NO_ENCONTRADA");
      const anioEnCurso = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric" }).format(new Date());
      expect(await consolidado(b.admin, { proceso })).toContain(`Consolidado de`);
      expect(await consolidado(b.admin, { proceso })).toContain(`value="${anioEnCurso}"`);
    }));
});
