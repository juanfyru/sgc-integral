import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-distribucion", () => ({
  anularCopiaAccion: vi.fn(),
  confirmarRecibidoAccion: vi.fn(),
  confirmarRecogidaAccion: vi.fn(),
  confirmarReemplazoAccion: vi.fn(),
  emitirCopiaAccion: vi.fn(),
  reemplazarCopiasAccion: vi.fn(),
}));

import { AccionesCopia } from "@/componentes/distribucion/copias/AccionesCopia";
import { ListaPuntos } from "@/componentes/distribucion/copias/ListaPuntos";
import { TablaCopias } from "@/componentes/distribucion/copias/TablaCopias";
import { PestanasDistribucion } from "@/componentes/distribucion/PestanasDistribucion";
import type { Copia } from "@/db/consultas/distribucion/copias";
import type { AccionCopia } from "@/db/consultas/distribucion/copias";

const AHORA = new Date("2026-11-16T15:00:00Z");
const dias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000);

const base: Copia = {
  id: 1,
  versionId: 10,
  documentoId: 20,
  codigo: "GTH-PR-02",
  titulo: "Inducción y reinducción",
  version: 2,
  numero: 2,
  punto: { id: 3, nombre: "Urgencias", sede: null },
  responsable: { id: 4, nombre: "Luz Dary Ortiz", cargo: null },
  responsableActual: { id: 4, nombre: "Luz Dary Ortiz" },
  emitidaPor: { id: 5, nombre: "María F. Perdomo" },
  emitidaEn: new Date("2026-11-12T15:00:00Z"),
  estado: "recibida",
  nota: null,
  hashPrincipal: "a".repeat(64),
  reemplazaCopiaId: null,
  versionVigente: true,
  venceEn: null,
  fechas: { recibidaEn: new Date("2026-11-12T16:00:00Z"), porRecogerEn: null, recogidaEn: null, anuladaEn: null },
  motivoPorRecoger: null,
  destinoRecogida: null,
  motivoAnulacion: null,
};

const copias: Copia[] = [
  base,
  { ...base, id: 2, numero: 1, codigo: "AIN-FO-01", version: 1, estado: "emitida", emitidaEn: dias(4), fechas: { ...base.fechas, recibidaEn: null } },
  {
    ...base,
    id: 3,
    numero: 3,
    codigo: "GBS-PR-01",
    version: 1,
    estado: "por_recoger",
    versionVigente: false,
    motivoPorRecoger: "nueva_version",
    fechas: { ...base.fechas, porRecogerEn: dias(6) },
    venceEn: new Date(AHORA.getTime() + 86_400_000),
  },
  { ...base, id: 4, numero: 4, estado: "anulada", motivoAnulacion: "error", fechas: { ...base.fechas, anuladaEn: dias(1) } },
];

describe("TablaCopias", () => {
  const html = renderToStaticMarkup(<TablaCopias copias={copias} ahora={AHORA} />);

  it("cada estado lleva su texto", () => {
    expect(html).toContain("Recibida 12 nov");
    expect(html).toContain("Sin recibido · 4 días");
    expect(html).toContain("Por recoger · 6 días");
    expect(html).toContain("Anulada");
  });

  it("muestra número, documento y responsable, en tabla y en tarjetas", () => {
    expect(html).toContain("GTH-PR-02 v2");
    expect(html).toContain("Luz Dary Ortiz");
    expect(html).toContain("Hay una versión nueva vigente");
    expect(html).toContain("hidden md:block");
    expect(html).toContain("md:hidden");
    expect(html).toContain('href="/distribucion/copias/3"');
  });

  it("un día se escribe en singular", () => {
    const uno = renderToStaticMarkup(<TablaCopias copias={[copias[1]]} ahora={new Date(copias[1].emitidaEn.getTime() + 86_400_000)} />);
    expect(uno).toContain("Sin recibido · 1 día<");
  });
});

describe("AccionesCopia", () => {
  const render = (acciones: AccionCopia[], extra?: Partial<Parameters<typeof AccionesCopia>[0]>) =>
    renderToStaticMarkup(<AccionesCopia copiaId={9} acciones={acciones} nuncaRecibida={false} reemplazo={null} {...extra} />);

  it("sin acciones no pinta nada", () => {
    expect(render([])).toBe("");
  });

  it("pinta solo lo que dice `acciones`", () => {
    const html = render(["recibir", "anular"]);
    expect(html).toContain("Confirmar el recibido");
    expect(html).toContain("Anular");
    expect(html).not.toContain("Confirmar la recogida");
    expect(html).not.toContain("Reimprimir");
    expect(html).not.toContain("Abrir el PDF");
  });

  it("el PDF es un enlace a otra pestaña", () => {
    const html = render(["pdf", "reimprimir"]);
    expect(html).toMatch(/<a [^>]*href="\/distribucion\/copias\/9\/pdf"[^>]*target="_blank"[^>]*rel="noopener"/);
    expect(html).toContain("Reimprimir");
  });

  it("una copia con reemplazo se recibe y retira la anterior en un solo gesto", () => {
    const html = render(["recibir"], { reemplazo: { numero: "03", version: 1 } });
    expect(html).toContain("Recibí esta y retiré la v1");
    expect(html).not.toContain("Confirmar el recibido");
  });

  it("recoger ofrece la confirmación", () => {
    expect(render(["recoger"])).toContain("Confirmar la recogida");
  });
});

describe("ListaPuntos y pestañas", () => {
  it("los puntos llevan su cuenta y el activo se marca", () => {
    const html = renderToStaticMarkup(
      <ListaPuntos
        puntos={[
          { puntoId: 3, nombre: "Urgencias", sede: null, vivas: 4, porRecoger: 2, sinRecibido: 1 },
          { puntoId: 4, nombre: "Farmacia", sede: "Sede norte", vivas: 3, porRecoger: 0, sinRecibido: 0 },
        ]}
        activo={3}
        estado="por_recoger"
      />,
    );
    expect(html).toContain("Urgencias");
    expect(html).toContain("4 copias vivas");
    expect(html).toContain("Sede norte");
    expect(html).toContain('href="/distribucion/copias?estado=por_recoger&amp;punto=4"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("las cuatro pestañas existen y la activa se marca", () => {
    const html = renderToStaticMarkup(<PestanasDistribucion activa="acuses" />);
    for (const texto of ["Copias controladas", "Acuses de lectura", "Socializaciones", "Verificaciones"]) {
      expect(html).toContain(texto);
    }
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Acuses de lectura/);
  });
});
