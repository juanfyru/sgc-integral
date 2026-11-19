/**
 * Las páginas con lo del hallazgo de un impacto de norma (Fase 15B, anexo §8, maqueta 6): la del cambio de norma
 * (`/normograma/impactos/[cambioId]`), la del indicador con su revisión pendiente (`AvisoDeImpacto`), el registro desde `?impacto=` (lo
 * fijo como texto, la norma derogada por su nombre, sin «Ya está en curso») y la edición del hallazgo que nació de un impacto. Pintadas
 * sobre la BD de trabajo, dentro de una transacción que se revierte; la sesión y el cliente se sustituyen. Además, los parecidos desde un
 * impacto no ofrecen la ocurrencia.
 */
import { renderToReadableStream, renderToStaticMarkup } from "react-dom/server";
import type { TransactionSql } from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

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
  usePathname: () => "/",
  useRouter: () => ({ refresh: () => {} }),
}));

import PaginaIndicador from "@/app/(app)/indicadores/[codigo]/page";
import PaginaEditarHallazgo from "@/app/(app)/mejoramiento/[id]/editar/page";
import PaginaNuevoHallazgo from "@/app/(app)/mejoramiento/nuevo/page";
import PaginaImpactosDelCambio from "@/app/(app)/normograma/impactos/[cambioId]/page";
import { SalidasDeParecidos } from "@/componentes/mejoramiento/ParecidosDelProceso";
import { obtenerSql } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { cambiarProceso, registrarHallazgo } from "@/db/consultas/mejoramiento/registro";
import { OCURRENCIA_DESDE_UN_IMPACTO, SUGERENCIA_DE_IMPACTO } from "@/lib/mejoramiento/enganches";
import { indicadorDePrueba } from "./utiles/indicadores";
import { baseDeMejora, c, datosDeHallazgo, impactoDePrueba, otroProcesoConLider, revisionDePrueba } from "./utiles/mejoramiento";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();
afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const AHORA = "2026-11-18T15:00:00Z";
/** Vencido y escalado mucho antes de cualquier reloj en que corra la prueba (las páginas leen la hora real). */
const VENCIO = new Date("2026-11-04T04:59:59Z");
const ESCALO = new Date("2026-11-10T15:00:00Z");

/** Pinta el elemento que devuelve una página como `sesion`, con la BD en `tx`. */
async function pintar(tx: TransactionSql, sesion: SesionFlujo, pagina: () => Promise<React.ReactElement>): Promise<string> {
  contexto.tx = tx;
  contexto.sesion = sesion;
  try {
    const flujo = await renderToReadableStream(await pagina());
    await flujo.allReady;
    return (await new Response(flujo).text()).replaceAll("<!-- -->", "");
  } finally {
    contexto.tx = null;
    contexto.sesion = null;
  }
}

const delCambio = (cambioId: number, proceso: number) => () =>
  PaginaImpactosDelCambio({ params: Promise.resolve({ cambioId: String(cambioId) }), searchParams: Promise.resolve({ proceso: String(proceso) }) });
const delIndicador = (codigo: string) => () => PaginaIndicador({ params: Promise.resolve({ codigo }), searchParams: Promise.resolve({ vista: "ficha" }) });

const abrir = (parametro: string, id: number) => new RegExp(`<a [^>]*href="/mejoramiento/nuevo\\?${parametro}=${id}"[^>]*>Abrir hallazgo</a>`);

describe("la página del cambio de norma", () => {
  it("al líder del proceso: «Abrir hallazgo» con el impacto; vencido y escalado, la sugerencia; después, su hallazgo con su enlace", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId, conDocumento: true });
      const antes = await pintar(tx, b.lider, delCambio(imp.cambioId, b.procesoId));
      expect(antes).toMatch(abrir("impacto", imp.id));
      expect(antes).not.toContain(SUGERENCIA_DE_IMPACTO);
      await tx`UPDATE impactos_normativos SET vence_en = ${VENCIO}, aviso_vencido_en = ${ESCALO}, escalado_en = ${ESCALO} WHERE id = ${imp.id}`;
      const vencido = await pintar(tx, b.admin, delCambio(imp.cambioId, b.procesoId));
      expect(vencido).toContain(SUGERENCIA_DE_IMPACTO);
      expect(vencido).toMatch(abrir("impacto", imp.id));

      const r = await registrarHallazgo(b.lider, { ...datosDeHallazgo(b.procesoId), impactoId: imp.id, documentoId: imp.documento!.id }, c(AHORA, tx));
      const despues = await pintar(tx, b.lider, delCambio(imp.cambioId, b.procesoId));
      expect(despues).not.toContain("Abrir hallazgo");
      expect(despues).not.toContain(SUGERENCIA_DE_IMPACTO);
      expect(despues).toMatch(new RegExp(`<a [^>]*href="/mejoramiento/${r.id}"[^>]*>Hallazgo ${r.codigo}</a> · Por corregir`));
    }));

  it("al líder que ya no ve el hallazgo (lo pasaron a otro proceso), nada de él: ni su código, ni «Abrir hallazgo», ni la sugerencia", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const otro = await otroProcesoConLider(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId });
      await tx`UPDATE impactos_normativos SET vence_en = ${VENCIO}, aviso_vencido_en = ${ESCALO}, escalado_en = ${ESCALO} WHERE id = ${imp.id}`;
      const r = await registrarHallazgo(b.admin, { ...datosDeHallazgo(b.procesoId), impactoId: imp.id }, c(AHORA, tx));
      await cambiarProceso(b.admin, { hallazgoId: r.id, procesoId: otro.procesoId, justificacion: "Lo atiende el otro proceso" }, c(AHORA, tx));
      const html = await pintar(tx, b.lider, delCambio(imp.cambioId, b.procesoId));
      expect(html).toContain("Revisar el impacto de");
      expect(html).not.toContain(r.codigo);
      expect(html).not.toContain(`/mejoramiento/${r.id}`);
      expect(html).not.toContain("Abrir hallazgo");
      expect(html).not.toContain(SUGERENCIA_DE_IMPACTO);
      // Al Admin SGC, que lo ve: el hallazgo.
      expect(await pintar(tx, b.admin, delCambio(imp.cambioId, b.procesoId))).toContain(`Hallazgo ${r.codigo}`);
    }));
});

describe("la página del indicador con una revisión pendiente", () => {
  it("al líder del proceso del indicador, «Abrir hallazgo»; a Consulta, la revisión sin nada de mejoramiento; después, el hallazgo solo a quien lo ve", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const ind = await indicadorDePrueba(tx, { procesoId: b.procesoId });
      const rev = await revisionDePrueba(tx, b.admin, ind.id);
      expect(await pintar(tx, b.lider, delIndicador(ind.codigo))).toMatch(abrir("impactoIndicador", rev.id));
      const deConsulta = await pintar(tx, b.consulta, delIndicador(ind.codigo));
      expect(deConsulta).toContain("Revisión por cambio normativo");
      expect(deConsulta).not.toContain("Abrir hallazgo");

      const r = await registrarHallazgo(b.lider, { ...datosDeHallazgo(b.procesoId), impactoIndicadorId: rev.id }, c(AHORA, tx));
      expect(await pintar(tx, b.gerencia, delIndicador(ind.codigo))).toMatch(
        new RegExp(`<a [^>]*href="/mejoramiento/${r.id}"[^>]*>Hallazgo ${r.codigo}</a> · Por corregir`),
      );
      const despues = await pintar(tx, b.consulta, delIndicador(ind.codigo));
      expect(despues).toContain("Revisión por cambio normativo");
      expect(despues).not.toContain(r.codigo);
      expect(despues).not.toContain("Abrir hallazgo");
    }));
});

describe("el registro y la edición del hallazgo de un impacto", () => {
  it("/mejoramiento/nuevo?impacto=: el origen, la norma (derogada, por su nombre) y el proceso como texto fijo; el impacto oculto; sin «Ya está en curso»", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId, conDocumento: true });
      const html = await pintar(tx, b.admin, () => PaginaNuevoHallazgo({ searchParams: Promise.resolve({ impacto: String(imp.id) }) }));
      expect(html).toMatch(new RegExp(`<input type="hidden" name="impactoId" value="${imp.id}"/>`));
      for (const campo of ["origen", "requisitoNormaId", "procesoId"]) expect(html).not.toMatch(new RegExp(`<select[^>]*name="${campo}"`));
      expect(html).toMatch(/<input type="hidden" name="origen" value="control_documental"\/>/);
      expect(html).toContain(`<p class="text-sm text-foreground">${imp.norma.nombre}</p><input type="hidden" name="requisitoNormaId" value="${imp.norma.id}"/>`);
      expect(html).toMatch(new RegExp(`<input type="hidden" name="procesoId" value="${b.procesoId}"/>`));
      expect(html).toContain(`value="Cambio de ${imp.norma.nombre}"`);
      expect(html).not.toContain("Ya está en curso");
      // Sin el impacto, la carga se ofrece.
      expect(await pintar(tx, b.admin, () => PaginaNuevoHallazgo({ searchParams: Promise.resolve({}) }))).toContain("Ya está en curso");
    }));

  it("la edición del hallazgo de un impacto: el origen, la norma y el proceso como texto fijo, sin sus selectores", () =>
    revertida(sql, async (tx) => {
      const b = await baseDeMejora(tx);
      const imp = await impactoDePrueba(tx, b.admin, { procesoId: b.procesoId });
      const { id } = await registrarHallazgo(b.admin, { ...datosDeHallazgo(b.procesoId), impactoId: imp.id }, c(AHORA, tx));
      const html = await pintar(tx, b.admin, () => PaginaEditarHallazgo({ params: Promise.resolve({ id: String(id) }) }));
      for (const campo of ["origen", "requisitoNormaId", "procesoId"]) expect(html).not.toMatch(new RegExp(`<select[^>]*name="${campo}"`));
      expect(html).toContain(`<p class="text-sm text-foreground">${imp.norma.nombre}</p><input type="hidden" name="requisitoNormaId" value="${imp.norma.id}"/>`);
      expect(html).toMatch(/<select[^>]*name="clase"/);
      // Uno que no nació de un impacto conserva sus selectores.
      const comun = (await registrarHallazgo(b.admin, datosDeHallazgo(b.procesoId), c(AHORA, tx))).id;
      const normal = await pintar(tx, b.admin, () => PaginaEditarHallazgo({ params: Promise.resolve({ id: String(comun) }) }));
      for (const campo of ["origen", "requisitoNormaId", "procesoId"]) expect(normal).toMatch(new RegExp(`<select[^>]*name="${campo}"`));
    }));
});

describe("los parecidos desde un impacto", () => {
  it("no ofrecen la ocurrencia de un abierto, y la nota lo dice; la reincidencia de un cerrado, sí", () => {
    const parecidos = [
      { id: 1, codigo: "HZ-2026-001", titulo: "Abierto", etiqueta: "Por corregir", abierto: true, cuando: "2026-11-01T00:00:00Z" },
      { id: 2, codigo: "HZ-2025-009", titulo: "Cerrado", etiqueta: "Cerrado · eficaz", abierto: false, cuando: "2025-06-01T00:00:00Z" },
    ];
    const html = renderToStaticMarkup(<SalidasDeParecidos parecidos={parecidos} vigente="distinto" alCambiar={() => {}} desdeUnImpacto />);
    expect(html).not.toContain("que está abierto: se añade como ocurrencia");
    expect(html).toContain("Es reincidencia de HZ-2025-009");
    expect(html).toContain(`HZ-2026-001 está abierto. ${OCURRENCIA_DESDE_UN_IMPACTO}.`);
  });
});
