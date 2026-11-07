import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-distribucion", () => ({
  agregarItemLibreAccion: vi.fn(),
  cerrarHallazgoAccion: vi.fn(),
  cerrarVerificacionAccion: vi.fn(),
  descartarVerificacionAccion: vi.fn(),
  guardarAvanceAccion: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ItemChequeo, type ValorItem } from "@/componentes/distribucion/verificaciones/ItemChequeo";
import { ListaChequeo } from "@/componentes/distribucion/verificaciones/ListaChequeo";
import { ListaHallazgos } from "@/componentes/distribucion/verificaciones/ListaHallazgos";
import { ResumenCierre } from "@/componentes/distribucion/verificaciones/ResumenCierre";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { ItemVerificacion, Verificacion } from "@/db/consultas/distribucion/verificaciones";
import { resumenDeChequeo } from "@/lib/distribucion/verificacion";

const item = (id: number, respuesta: ItemVerificacion["respuesta"], p: Partial<ItemVerificacion> = {}): ItemVerificacion => ({
  id,
  orden: id,
  origen: "fijo",
  copiaId: null,
  texto: `Ítem ${id}`,
  respuesta,
  nota: null,
  fotos: [],
  ...p,
});

const verificacion = (items: ItemVerificacion[], p: Partial<Verificacion> = {}): Verificacion => ({
  id: 4,
  punto: { id: 2, nombre: "Farmacia", sede: null },
  responsable: { id: 9, nombre: "Carlos Rojas" },
  estado: "abierta",
  abiertaPor: "Ana",
  abiertaEn: new Date("2026-11-14T15:00:00Z"),
  cerradaPor: null,
  cerradaEn: null,
  conforme: null,
  propioPunto: false,
  motivoDescarte: null,
  items,
  hallazgos: [],
  puedeEditar: true,
  ...p,
});

const sinValor: ValorItem = { respuesta: null, nota: "", retirado: false };

describe("ItemChequeo", () => {
  it("«no conforme» despliega la nota, la casilla «Retirado en el acto» y la foto", () => {
    const html = renderToStaticMarkup(
      <ItemChequeo verificacionId={4} item={item(7, null)} valor={{ respuesta: "no_conforme", nota: "Hay otra", retirado: true }} editable />,
    );
    expect(html).toContain('name="nota_7"');
    expect(html).toContain('name="retirado_7"');
    expect(html).toContain("Retirado en el acto");
    expect(html).toContain("Zona de carga");
    expect(html).toContain("Hay otra");
  });

  it("conforme o sin responder no muestra la nota ni la foto; las tres respuestas llevan su texto", () => {
    for (const respuesta of ["conforme", null] as const) {
      const html = renderToStaticMarkup(<ItemChequeo verificacionId={4} item={item(7, null)} valor={{ ...sinValor, respuesta }} editable />);
      expect(html).not.toContain('name="nota_7"');
      expect(html).not.toContain("Zona de carga");
      for (const texto of ["Conforme", "No conforme", "No aplica"]) expect(html).toContain(texto);
      expect(html.match(/type="radio"/g)).toHaveLength(3);
    }
  });

  it("de solo lectura, dice la respuesta con texto y enlaza las fotos de un no conforme", () => {
    const foto = { id: 3, nombreOriginal: "ñoño.png", mime: "image/png", tamanoBytes: 2048, hashSha256: "a".repeat(64), creadoEn: new Date() };
    const html = renderToStaticMarkup(
      <ItemChequeo
        verificacionId={4}
        item={item(7, "no_conforme", { nota: "Sin sello", fotos: [foto] })}
        valor={sinValor}
        editable={false}
      />,
    );
    expect(html).toContain("No conforme");
    expect(html).toContain("Nota: Sin sello");
    expect(html).toContain(`/distribucion/verificaciones/4/archivos/3/${encodeURIComponent("ñoño.png")}`);
    expect(html).not.toContain("<input");
  });
});

describe("ResumenCierre", () => {
  it("dice «7 de 9 ítems conformes · Punto no conforme»", () => {
    const items = [
      ...[1, 2, 3, 4, 5, 6, 7].map((n) => item(n, "conforme")),
      item(8, "no_conforme"),
      item(9, "no_conforme"),
    ];
    const html = renderToStaticMarkup(
      <ResumenCierre verificacion={verificacion(items, { estado: "cerrada", conforme: false, cerradaPor: "Ana", cerradaEn: new Date("2026-11-15T15:00:00Z") })} />,
    );
    expect(html).toContain("7 de 9 ítems conformes · Punto no conforme");
    expect(html).not.toContain("provisional");
    expect(html).toContain("Cerrada por Ana");
  });

  it("los «no aplica» no cuentan en el total", () => {
    expect(resumenDeChequeo([{ respuesta: "conforme" }, { respuesta: "no_aplica" }, { respuesta: null }])).toEqual({
      conformes: 1,
      total: 2,
      sinResponder: 1,
      conforme: true,
    });
  });
});

describe("ListaChequeo", () => {
  it("abierta, muestra el resumen provisional, guardar, cerrar (sin habilitar mientras falte responder) y descartar", () => {
    const html = renderToStaticMarkup(<ListaChequeo verificacion={verificacion([item(1, "conforme"), item(2, null)])} />);
    expect(html).toContain("1 de 2 ítems conformes · Punto conforme (provisional)");
    expect(html).toContain("falta 1 ítem por responder");
    expect(html).toContain("Guardar avance");
    expect(html).toContain("Añadir ítem");
    expect(html).toContain("Descartar");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Cerrar verificación/);
  });

  it("cerrada o descartada es solo lectura: sin campos ni botones", () => {
    const html = renderToStaticMarkup(
      <ListaChequeo verificacion={verificacion([item(1, "conforme")], { estado: "cerrada", puedeEditar: false, conforme: true })} />,
    );
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<button");
    expect(html).toContain("Conforme");
  });
});

describe("ListaHallazgos", () => {
  const hallazgo = (id: number, p: Partial<Hallazgo> = {}): Hallazgo => ({
    id,
    punto: { id: 2, nombre: "Farmacia" },
    origen: "verificacion",
    verificacionId: 4,
    itemId: 7,
    copia: null,
    descripcion: "Hay una guía vieja",
    retiradoEnElActo: true,
    responsable: { id: 9, nombre: "Carlos Rojas" },
    estado: "abierto",
    venceEn: new Date("2026-11-20T15:00:00Z"),
    creadoEn: new Date("2026-11-15T15:00:00Z"),
    cierre: null,
    fotos: [],
    ...p,
  });

  it("un hallazgo abierto ofrece cerrarlo solo a quien puede; uno cerrado muestra su cierre", () => {
    const abierto = hallazgo(1);
    const cerrado = hallazgo(2, { estado: "cerrado", cierre: { en: new Date("2026-11-18T15:00:00Z"), por: "Carlos Rojas", nota: "Se retiró la guía" } });
    const conPermiso = renderToStaticMarkup(<ListaHallazgos hallazgos={[abierto, cerrado]} verificacionId={4} cerrables={[1]} />);
    expect(conPermiso).toContain("Hallazgos (2)");
    expect(conPermiso).toContain('name="nota"');
    expect(conPermiso).toContain("Cerrado por Carlos Rojas");
    expect(conPermiso).toContain("Se retiró la guía");
    expect(conPermiso).toContain("Retirado en el acto");
    const sinPermiso = renderToStaticMarkup(<ListaHallazgos hallazgos={[abierto]} verificacionId={4} cerrables={[]} />);
    expect(sinPermiso).not.toContain('name="nota"');
  });
});
