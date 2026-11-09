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
import { comoSeCerro } from "@/lib/distribucion/hallazgos";
import { fechasQueViajan, resumenDeChequeo } from "@/lib/distribucion/verificacion";

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
  porValidarDelPunto: 0,
  alCerrar: null,
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

  it("el ítem ya no pinta la fecha de corrección: se elige al cerrar", () => {
    const html = renderToStaticMarkup(
      <ItemChequeo verificacionId={4} item={item(7, null)} valor={{ respuesta: "no_conforme", nota: "", retirado: false }} editable />,
    );
    expect(html).not.toContain('type="date"');
    expect(html).not.toContain("fecha_7");
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
    expect(html).not.toContain("Validó");
  });

  it("dice cuántos hallazgos por validar validó y cuántos reabrió el cierre", () => {
    const cerrada = (alCerrar: Verificacion["alCerrar"]) =>
      renderToStaticMarkup(
        <ResumenCierre verificacion={verificacion([item(1, "conforme")], { estado: "cerrada", conforme: true, cerradaPor: "Ana", cerradaEn: new Date("2026-11-15T15:00:00Z"), alCerrar })} />,
      );
    expect(cerrada({ validados: 2, reabiertos: 1 })).toContain("Validó 2 hallazgos por validar. Reabrió 1.");
    expect(cerrada({ validados: 1, reabiertos: 0 })).toContain("Validó 1 hallazgo por validar.");
    expect(cerrada({ validados: 0, reabiertos: 0 })).not.toMatch(/Validó|Reabrió/);
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

  const fechas = { propuesta: "2026-11-29", minima: "2026-11-15", maxima: "2027-11-14" };

  it("el diálogo de cierre lista cada hallazgo que se abrirá con su fecha propuesta, su rango y sin nombre de campo", () => {
    const html = renderToStaticMarkup(
      <ListaChequeo
        verificacion={verificacion([item(1, "conforme"), item(2, "no_conforme", { texto: "Copia rota" }), item(3, "no_conforme", { texto: "Sin sello" })])}
        fechas={fechas}
      />,
    );
    const campos = html.match(/<input[^>]*type="date"[^>]*\/>/g) ?? [];
    expect(campos).toHaveLength(2);
    for (const campo of campos) {
      expect(campo).toContain('value="2026-11-29"');
      expect(campo).toContain('min="2026-11-15"');
      expect(campo).toContain('max="2027-11-14"');
      expect(campo).toContain("max-w-44");
      expect(campo).not.toContain("name=");
    }
    expect(html).toContain("Copia rota");
    expect(html).toContain("Sin sello");
    expect(html).toContain("Se propone según el plazo de corrección; puede cambiarla entre mañana y un año.");
    // Ninguna fecha sin tocar viaja: el formulario no lleva ningún campo `fecha_`.
    expect(html).not.toContain('name="fecha_');
  });

  it("sin no conformes el diálogo queda como siempre; con por validar en el punto, lo avisa", () => {
    const sinNoConformes = renderToStaticMarkup(<ListaChequeo verificacion={verificacion([item(1, "conforme")])} fechas={fechas} />);
    expect(sinNoConformes).not.toContain('type="date"');
    expect(sinNoConformes).toContain("No se abrirá ningún hallazgo.");
    expect(sinNoConformes).not.toContain("por validar");
    const conPorValidar = renderToStaticMarkup(
      <ListaChequeo verificacion={verificacion([item(1, "conforme")], { porValidarDelPunto: 2 })} fechas={fechas} />,
    );
    expect(conPorValidar).toContain(
      "Este punto tiene 2 hallazgos por validar: al cerrar se validan los que no vuelvan a salir no conformes y se reabren los que sí.",
    );
  });

  it("viaja solo la fecha cambiada de un ítem no conforme", () => {
    expect(fechasQueViajan([2, 3], {}, "2026-11-29")).toEqual([]);
    expect(fechasQueViajan([2, 3], { 2: "2026-11-29", 3: "2026-12-05" }, "2026-11-29")).toEqual([{ itemId: 3, fecha: "2026-12-05" }]);
    // La de un ítem que dejó de ser no conforme, o una borrada, no viaja.
    expect(fechasQueViajan([2], { 3: "2026-12-05", 2: "" }, "2026-11-29")).toEqual([]);
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
  const pintar = (hallazgos: HallazgoDeVerificacion[]) => renderToStaticMarkup(<ListaHallazgos hallazgos={hallazgos} volver={{ verificacionId: 4 }} />);

  it("un hallazgo abierto ofrece «Corregido» con nota y foto solo a quien puede corregirlo", () => {
    const conPermiso = pintar([hallazgo(1, { puedeCorregir: true })]);
    expect(conPermiso).toContain("Hallazgos (1)");
    expect(conPermiso).toContain("Abierto");
    expect(conPermiso).toContain('name="nota"');
    expect(conPermiso).toMatch(/<button[^>]*type="submit"[^>]*>Corregido<\/button>/);
    expect(conPermiso).toContain("Zona de carga");
    // Nota, foto y, al final, la acción; el botón envía el formulario de la nota.
    expect(conPermiso.indexOf('name="nota"')).toBeLessThan(conPermiso.indexOf("Zona de carga"));
    expect(conPermiso.indexOf("Zona de carga")).toBeLessThan(conPermiso.indexOf(">Corregido</button>"));
    const formulario = /<form[^>]*id="([^"]+)"/.exec(conPermiso)?.[1];
    expect(conPermiso).toMatch(new RegExp(`<button[^>]*form="${formulario}"[^>]*>Corregido</button>`));
    expect(conPermiso).toContain('name="verificacion" value="4"');
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
        cierre: { en: new Date("2026-11-18T15:00:00Z"), porId: 5, por: "Ana", nota: "Retiré la guía" },
      }),
      hallazgo(2, { estado: "cerrado", validacion: "admin", cierre: { en: new Date("2026-11-18T15:00:00Z"), porId: 5, por: "Ana", nota: "Se retiró la guía" } }),
    ]);
    expect(html).toContain("Cerrado");
    expect(html).toContain("Validado por la siguiente verificación del punto");
    expect(html).toContain('href="/distribucion/verificaciones/11"');
    expect(html).toContain("Se reabrió 1 vez");
    // La nota de la corrección va una sola vez, como corrección; no se repite como si fuera de quien valida.
    expect(html.split("Retiré la guía").length - 1).toBe(1);
    expect(html).toContain("Cerrado por Ana");
    expect(html).toContain("Se retiró la guía");
    expect(html).not.toContain("<form");
  });

  it("dice cómo se cerró: validado por el Admin, por quien lo corrigió o directamente", () => {
    const cierre = { en: new Date("2026-11-18T15:00:00Z"), porId: 5, por: "Ana", nota: "Retiré la guía" };
    const validado = pintar([hallazgo(1, { estado: "cerrado", correccion, validacion: "admin", cierre })]);
    expect(validado).toContain("Validado por el Administrador del SGC (Ana)");
    expect(validado.split("Retiré la guía").length - 1).toBe(1);
    const propio = pintar([hallazgo(1, { estado: "cerrado", correccion, validacion: "admin", cierre: { ...cierre, porId: 9, por: "Carlos Rojas", nota: "Cerré yo" } })]);
    expect(propio).toContain("Cerrado por quien lo corrigió (único Administrador del SGC activo)");
    expect(propio).toContain("Cerré yo");
    expect(comoSeCerro({ estado: "cerrado", correccion: null, validacion: "admin", cierre })).toBe("directo");
    expect(comoSeCerro({ estado: "cerrado", correccion, validacion: "admin", cierre: { ...cierre, nota: "Otra nota" } })).toBe("directo");
    expect(comoSeCerro({ estado: "cerrado", correccion, validacion: "verificacion", cierre })).toBe("verificacion");
    expect(comoSeCerro({ estado: "por_validar", correccion, validacion: null, cierre: null })).toBeNull();
  });

  it("un hallazgo de recogida vuelve a su copia y no enlaza fotos de ítem", () => {
    const html = renderToStaticMarkup(
      <ListaHallazgos
        hallazgos={[hallazgo(1, { origen: "recogida", verificacionId: null, itemId: null, puedeCorregir: true })]}
        volver={{ copiaId: 12 }}
        titulo="Hallazgos de esta copia"
      />,
    );
    expect(html).toContain("Hallazgos de esta copia (1)");
    expect(html).toContain('name="copia" value="12"');
    expect(html).not.toContain('name="verificacion"');
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
    const cierre = { en: new Date("2026-11-21T15:00:00Z"), porId: 5, por: "Ana", nota: "Retiré la guía" };
    const validada = renderToStaticMarkup(
      <TablaHallazgos hallazgos={[{ ...base, estado: "cerrado", validacion: "verificacion", validacionVerificacionId: 11, cierre }]} ahora={new Date("2026-11-22T15:00:00Z")} />,
    );
    expect(validada).toContain("Validado por la verificación del 21 nov 2026");
    expect(validada).toContain("Corrección de Carlos Rojas: Retiré la guía");
    expect(validada).not.toContain("Cerrado por Ana");
    const porAdmin = renderToStaticMarkup(
      <TablaHallazgos hallazgos={[{ ...base, estado: "cerrado", validacion: "admin", cierre }]} ahora={new Date("2026-11-22T15:00:00Z")} />,
    );
    expect(porAdmin).toContain("Validado por Ana");
    const directo = renderToStaticMarkup(
      <TablaHallazgos hallazgos={[{ ...base, estado: "cerrado", correccion: null, validacion: "admin", cierre: { ...cierre, nota: "Se cerró en el comité" } }]} ahora={new Date("2026-11-22T15:00:00Z")} />,
    );
    expect(directo).toContain("Cerrado por Ana: Se cerró en el comité");
  });
});
