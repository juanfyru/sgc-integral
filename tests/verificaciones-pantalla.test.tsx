import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-distribucion", () => ({
  agregarItemLibreAccion: vi.fn(),
  cerrarHallazgoAccion: vi.fn(),
  cerrarVerificacionAccion: vi.fn(),
  corregirHallazgoAccion: vi.fn(),
  reabrirHallazgoAccion: vi.fn(),
  validarHallazgoAccion: vi.fn(),
  descartarVerificacionAccion: vi.fn(),
  guardarAvanceAccion: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ItemChequeo, type ValorItem } from "@/componentes/distribucion/verificaciones/ItemChequeo";
import { ListaChequeo } from "@/componentes/distribucion/verificaciones/ListaChequeo";
import { ListaHallazgos } from "@/componentes/distribucion/verificaciones/ListaHallazgos";
import { ResumenCierre } from "@/componentes/distribucion/verificaciones/ResumenCierre";
import { TablaHallazgos } from "@/componentes/distribucion/verificaciones/TablaHallazgos";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { HallazgoDeVerificacion, ItemVerificacion, Verificacion } from "@/db/consultas/distribucion/verificaciones";
import { resumenDeChequeo } from "@/lib/distribucion/verificacion";

const item = (id: number, respuesta: ItemVerificacion["respuesta"], p: Partial<ItemVerificacion> = {}): ItemVerificacion => ({
  id,
  orden: id,
  origen: "fijo",
  copiaId: null,
  texto: `Ítem ${id}`,
  respuesta,
  nota: null,
  retirado: false,
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

  it("«no conforme» propone la fecha de corrección y deja cambiarla entre mañana y hoy + 365", () => {
    const fechas = { propuesta: "2026-11-29", minima: "2026-11-15", maxima: "2027-11-14" };
    const html = renderToStaticMarkup(
      <ItemChequeo verificacionId={4} item={item(7, null)} valor={{ respuesta: "no_conforme", nota: "", retirado: false }} editable fechas={fechas} />,
    );
    const campo = /<input[^>]*name="fecha_7"[^>]*\/>/.exec(html)?.[0] ?? "";
    expect(campo).toContain('type="date"');
    expect(campo).toContain('value="2026-11-29"');
    expect(campo).toContain('min="2026-11-15"');
    expect(campo).toContain('max="2027-11-14"');
    expect(html).toContain("Fecha de corrección");
    const elegida = renderToStaticMarkup(
      <ItemChequeo verificacionId={4} item={item(7, null)} valor={{ respuesta: "no_conforme", nota: "", retirado: false, fecha: "2026-12-01" }} editable fechas={fechas} />,
    );
    expect(elegida).toMatch(/name="fecha_7"[^>]*value="2026-12-01"|value="2026-12-01"[^>]*name="fecha_7"/);
    // Conforme no abre hallazgo: no hay fecha que elegir.
    const conforme = renderToStaticMarkup(
      <ItemChequeo verificacionId={4} item={item(7, null)} valor={{ respuesta: "conforme", nota: "", retirado: false }} editable fechas={fechas} />,
    );
    expect(conforme).not.toContain('name="fecha_7"');
    const lista = renderToStaticMarkup(<ListaChequeo verificacion={verificacion([item(7, "no_conforme")])} fechas={fechas} />);
    expect(lista).toMatch(/name="fecha_7"[^>]*value="2026-11-29"|value="2026-11-29"[^>]*name="fecha_7"/);
  });

  it("pinta la casilla «Retirado en el acto» desde el valor guardado", () => {
    const marcado = renderToStaticMarkup(
      <ItemChequeo verificacionId={4} item={item(7, "no_conforme", { retirado: true })} valor={{ respuesta: "no_conforme", nota: "", retirado: true }} editable />,
    );
    expect(marcado).toMatch(/name="retirado_7"[^>]*checked|checked[^>]*name="retirado_7"/);
    const lista = renderToStaticMarkup(<ListaChequeo verificacion={verificacion([item(7, "no_conforme", { retirado: true })])} />);
    expect(lista).toMatch(/name="retirado_7"[^>]*checked|checked[^>]*name="retirado_7"/);
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
  const hallazgo = (id: number, p: Partial<HallazgoDeVerificacion> = {}): HallazgoDeVerificacion => ({
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
    correccion: null,
    cierre: null,
    validacion: null,
    validacionVerificacionId: null,
    reaperturas: 0,
    fotos: [],
    fotosCorreccion: [],
    puedeCorregir: false,
    puedeValidar: false,
    puedeCerrar: false,
    ...p,
  });
  const foto = { id: 3, nombreOriginal: "corregido.png", mime: "image/png", tamanoBytes: 2048, hashSha256: "a".repeat(64), creadoEn: new Date() };
  const correccion = { en: new Date("2026-11-17T15:00:00Z"), porId: 9, por: "Carlos Rojas", nota: "Retiré la guía" };
  const pintar = (hallazgos: HallazgoDeVerificacion[]) => renderToStaticMarkup(<ListaHallazgos hallazgos={hallazgos} verificacionId={4} />);

  it("un hallazgo abierto ofrece «Corregido» con nota y foto solo a quien puede corregirlo", () => {
    const conPermiso = pintar([hallazgo(1, { puedeCorregir: true })]);
    expect(conPermiso).toContain("Hallazgos (1)");
    expect(conPermiso).toContain("Abierto");
    expect(conPermiso).toContain('name="nota"');
    expect(conPermiso).toMatch(/<button[^>]*type="submit"[^>]*>Corregido<\/button>/);
    expect(conPermiso).toContain("Zona de carga");
    expect(conPermiso).toContain("Retirado en el acto");
    expect(conPermiso).not.toContain(">Validar<");
    const sinPermiso = pintar([hallazgo(1)]);
    expect(sinPermiso).not.toContain('name="nota"');
    expect(sinPermiso).not.toContain("Zona de carga");
  });

  it("por validar dice quién lo corrigió, enlaza su foto y ofrece «Validar» y «Reabrir…» a quien valida", () => {
    const porValidar = hallazgo(1, { estado: "por_validar", correccion, fotosCorreccion: [foto], puedeValidar: true, puedeCerrar: true });
    const html = pintar([porValidar]);
    expect(html).toContain("Por validar");
    expect(html).toContain("Corregido por Carlos Rojas el");
    expect(html).toContain("Retiré la guía");
    expect(html).toContain(`href="/distribucion/verificaciones/hallazgos/1/archivos/3/corregido.png"`);
    expect(html).toMatch(/<button[^>]*>Validar<\/button>/);
    expect(html).toContain("Reabrir…");
    expect(html).toContain("Cerrar directamente…");
    expect(html).not.toMatch(/>Corregido<\/button>/);
    // Quien lo ve sin poder validarlo, solo lee.
    const deLectura = pintar([{ ...porValidar, puedeValidar: false, puedeCerrar: false }]);
    expect(deLectura).not.toContain("<form");
    expect(deLectura).toContain("Retiré la guía");
  });

  it("cerrado dice cómo se validó y cuántas veces se reabrió", () => {
    const html = pintar([
      hallazgo(1, {
        estado: "cerrado",
        correccion,
        validacion: "verificacion",
        validacionVerificacionId: 11,
        reaperturas: 1,
        cierre: { en: new Date("2026-11-18T15:00:00Z"), por: "Ana", nota: "Retiré la guía" },
      }),
      hallazgo(2, { estado: "cerrado", validacion: "admin", cierre: { en: new Date("2026-11-18T15:00:00Z"), por: "Ana", nota: "Se retiró la guía" } }),
    ]);
    expect(html).toContain("Cerrado");
    expect(html).toContain("Validado por la siguiente verificación del punto");
    expect(html).toContain('href="/distribucion/verificaciones/11"');
    expect(html).toContain("Se reabrió 1 vez");
    expect(html).toContain("Cerrado por Ana");
    expect(html).toContain("Se retiró la guía");
    expect(html).not.toContain("<form");
  });
});

describe("TablaHallazgos", () => {
  it("el estado se dice con texto: abierto, por validar y cerrado", () => {
    const base: Hallazgo = {
      id: 1,
      punto: { id: 2, nombre: "Farmacia" },
      origen: "verificacion",
      verificacionId: 4,
      itemId: 7,
      copia: null,
      descripcion: "Hay una guía vieja",
      retiradoEnElActo: false,
      responsable: { id: 9, nombre: "Carlos Rojas" },
      estado: "por_validar",
      venceEn: new Date("2030-11-20T15:00:00Z"),
      creadoEn: new Date("2026-11-15T15:00:00Z"),
      correccion: { en: new Date("2026-11-17T15:00:00Z"), porId: 9, por: "Carlos Rojas", nota: "Retiré la guía" },
      cierre: null,
      validacion: null,
      validacionVerificacionId: null,
      reaperturas: 0,
      fotos: [],
      fotosCorreccion: [],
    };
    const html = renderToStaticMarkup(<TablaHallazgos hallazgos={[base]} ahora={new Date("2026-11-18T15:00:00Z")} />);
    expect(html).toContain("Por validar");
    expect(html).toContain("Corregido por Carlos Rojas: Retiré la guía");
  });
});
