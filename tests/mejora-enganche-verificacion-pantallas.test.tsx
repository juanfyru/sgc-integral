/**
 * Lo que pintan las pantallas de la no conformidad de un hallazgo de verificación (Fase 15B, anexo §7, maqueta 6): la pieza de la
 * fila de Distribución (`NoConformidadDeVerificacion`, en la tabla de hallazgos), la sección «Corrección» enlazada y, aparte, la acción
 * correctiva requerida (`AccionCorrectivaRequerida`). Sin base: los datos llegan ya decididos por `engancheDeVerificacion`,
 * `correccionEnlazada` y la lectura del hallazgo.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TablaHallazgos } from "@/componentes/distribucion/verificaciones/TablaHallazgos";
import { AccionCorrectivaRequerida } from "@/componentes/mejoramiento/enganches/AccionCorrectivaRequerida";
import { NoConformidadDeVerificacion } from "@/componentes/mejoramiento/enganches/NoConformidadDeVerificacion";
import { SeccionCorreccion } from "@/componentes/mejoramiento/SeccionCorreccion";
import type { Hallazgo } from "@/db/consultas/distribucion/hallazgos";
import type { EngancheDeVerificacion } from "@/db/consultas/mejoramiento/enganche-verificacion";
import type { DetalleDeHallazgo } from "@/db/consultas/mejoramiento/lectura";
import { CORRECCION_EN_DISTRIBUCION } from "@/lib/mejoramiento/enganches";

const sinNada = (html: string) => html.replaceAll("<!-- -->", "");
const pieza = (enganche: EngancheDeVerificacion | undefined) =>
  sinNada(renderToStaticMarkup(<NoConformidadDeVerificacion hallazgoId={5} enganche={enganche} />));

describe("NoConformidadDeVerificacion", () => {
  it("sin nada que decir no pinta nada", () => {
    expect(pieza(undefined)).toBe("");
    expect(pieza({ noConformidad: null, puedeAbrir: false, sugerir: null })).toBe("");
  });

  it("al Admin SGC: «Abrir no conformidad» lleva al registro con el hallazgo, con la sugerencia si la hay", () => {
    const sola = pieza({ noConformidad: null, puedeAbrir: true, sugerir: null });
    expect(sola).toMatch(/<a [^>]*href="\/mejoramiento\/nuevo\?verificacion=5"[^>]*>Abrir no conformidad<\/a>/);
    expect(sola).not.toContain("Puede abrir una no conformidad");
    const reabierto = pieza({ noConformidad: null, puedeAbrir: true, sugerir: { por: "reabierto", veces: 1 } });
    expect(reabierto).toContain("Este hallazgo se reabrió una vez. Puede abrir una no conformidad para tratar la causa.");
    const acumula = pieza({ noConformidad: null, puedeAbrir: true, sugerir: { por: "acumula", hallazgos: 3, meses: 12 } });
    expect(acumula).toContain("Este punto acumula 3 hallazgos en 12 meses. Puede abrir una no conformidad para tratar la causa.");
  });

  it("después, la no conformidad y en qué va, con enlace solo a quien la ve", () => {
    const nc = { id: 9, codigo: "HZ-2026-033", estado: "Por formular" };
    const visible = pieza({ noConformidad: { ...nc, visible: true }, puedeAbrir: false, sugerir: null });
    expect(visible).toMatch(/<a [^>]*href="\/mejoramiento\/9"[^>]*>No conformidad HZ-2026-033<\/a> · Por formular/);
    expect(visible).not.toContain("Abrir no conformidad");
    const oculta = pieza({ noConformidad: { ...nc, visible: false }, puedeAbrir: false, sugerir: null });
    expect(oculta).toContain("No conformidad HZ-2026-033</span> · Por formular");
    expect(oculta).not.toContain("/mejoramiento/9");
  });

  it("en la fila de la tabla de hallazgos de Distribución, dentro de la celda del hallazgo", () => {
    const h: Hallazgo = {
      id: 5,
      punto: { id: 2, nombre: "Urgencias" },
      origen: "verificacion",
      verificacionId: 4,
      itemId: 7,
      copia: null,
      descripcion: "Copia obsoleta del protocolo de triage",
      retiradoEnElActo: false,
      responsable: { id: 9, nombre: "Carlos Rojas" },
      estado: "abierto",
      venceEn: new Date("2030-11-20T15:00:00Z"),
      creadoEn: new Date("2026-11-15T15:00:00Z"),
      correccion: null,
      cierre: null,
      validacion: null,
      validacionVerificacionId: null,
      reaperturas: 1,
      fotos: [],
      fotosCorreccion: [],
    };
    const enganches = new Map([[5, { noConformidad: null, puedeAbrir: true, sugerir: { por: "reabierto" as const, veces: 1 } }]]);
    const html = sinNada(renderToStaticMarkup(<TablaHallazgos hallazgos={[h]} ahora={new Date("2026-11-18T15:00:00Z")} enganches={enganches} />));
    expect(html).toMatch(/Copia obsoleta del protocolo de triage<\/a>[\s\S]*Este hallazgo se reabrió una vez[\s\S]*Abrir no conformidad<\/a><\/div><\/td>/);
    // Sin el mapa, la fila es la de siempre.
    expect(sinNada(renderToStaticMarkup(<TablaHallazgos hallazgos={[h]} ahora={new Date("2026-11-18T15:00:00Z")} />))).not.toContain(
      "Abrir no conformidad",
    );
  });
});

describe("SeccionCorreccion con la corrección de un hallazgo de verificación", () => {
  const correccion: DetalleDeHallazgo["correccion"] = {
    requerida: null,
    descripcion: null,
    responsable: null,
    implementadaEn: null,
    registradaEn: null,
    validadaPor: null,
    validadaEn: null,
  };
  const decision: DetalleDeHallazgo["decision"] = {
    accionRequerida: true,
    justificacion: "Es la tercera copia obsoleta del año en este punto",
    decididaEn: new Date("2026-11-18T15:00:00Z"),
  };
  const pintar = (enlazada: DetalleDeHallazgo["correccionEnlazada"]) =>
    sinNada(
      renderToStaticMarkup(
        <SeccionCorreccion correccion={correccion} decision={decision} zona="America/Bogota" abierta archivos={null} enlazada={enlazada} />,
      ),
    );

  it("a quien la ve: en qué va, qué se corrigió, quién, cuándo y el enlace; la acción correctiva requerida con su justificación", () => {
    const html = pintar({
      visible: true,
      estado: "Por validar",
      nota: "Se retiró la copia vieja y se entregó la vigente",
      por: "Carlos Rojas",
      en: new Date("2026-11-11T15:00:00Z"),
      enlace: "/distribucion/verificaciones/4",
      punto: "Urgencias",
    });
    expect(html).toContain("La del hallazgo de verificación de Urgencias · Por validar");
    expect(html).toContain("Se retiró la copia vieja y se entregó la vigente");
    expect(html).toContain("Carlos Rojas");
    expect(html).toMatch(/<a [^>]*href="\/distribucion\/verificaciones\/4"[^>]*>Ver el hallazgo de verificación<\/a>/);
    // La decisión sigue en la sección, para todo el que la ve (también quien ve el hallazgo solo por su actividad, como en la 15A); la
    // pieza a la vista (`AccionCorrectivaRequerida`) la añade la página a quien lo ve completo.
    expect(html).toContain("¿Requiere acción correctiva?");
    expect(html).toContain("Es la tercera copia obsoleta del año en este punto");
    expect(html).not.toContain("Aún no se registra la corrección</span>");
    expect(html).not.toContain(CORRECCION_EN_DISTRIBUCION);
  });

  it("a quien no la ve: solo que la corrección está en Distribución", () => {
    const html = pintar({ visible: false });
    expect(html).toContain(CORRECCION_EN_DISTRIBUCION);
    expect(html).not.toContain("/distribucion/");
    expect(html).not.toContain("Ver el hallazgo de verificación");
  });
});

describe("AccionCorrectivaRequerida (anexo 15B §7.2, maqueta 6)", () => {
  const pintar = (decision: DetalleDeHallazgo["decision"]) =>
    sinNada(renderToStaticMarkup(<AccionCorrectivaRequerida decision={decision} zona="America/Bogota" />));

  it("la acción requerida desde que nació, con su justificación y quién la decidió y cuándo", () => {
    const html = pintar({
      accionRequerida: true,
      justificacion: "Es la tercera copia obsoleta del año en este punto",
      decididaEn: new Date("2026-11-18T15:00:00Z"),
      decididaPor: "Marta Ríos",
    });
    expect(html).toMatch(/<h2 [^>]*>Acción correctiva<\/h2>/);
    expect(html).toContain("Requerida: «Es la tercera copia obsoleta del año en este punto»");
    expect(html).toContain("La decidió al abrir la no conformidad: Marta Ríos, ");
    // Sin el nombre (una fila anterior), la fecha sola.
    expect(pintar({ accionRequerida: true, justificacion: "Tercera copia obsoleta", decididaEn: new Date("2026-11-18T15:00:00Z") })).toContain(
      "La decidió al abrir la no conformidad: ",
    );
  });

  it("sin la acción requerida o sin su justificación no pinta nada", () => {
    expect(pintar({ accionRequerida: null, justificacion: null, decididaEn: null })).toBe("");
    expect(pintar({ accionRequerida: false, justificacion: "Hecho aislado", decididaEn: new Date("2026-11-18T15:00:00Z") })).toBe("");
    expect(pintar({ accionRequerida: true, justificacion: null, decididaEn: null })).toBe("");
  });
});
