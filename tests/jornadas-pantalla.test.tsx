import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/acciones-distribucion", () => ({ anularJornadaAccion: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { DetalleJornada } from "@/componentes/distribucion/socializaciones/DetalleJornada";
import type { Jornada } from "@/db/consultas/distribucion/jornadas";

const version = (versionId: number, vigente: boolean) => ({ versionId, codigo: `GTH-PR-0${versionId}`, titulo: "Inducción", version: 2, vigente });

const base: Jornada = {
  id: 3,
  fecha: "2026-11-14",
  modalidad: "reunion_servicio",
  facilitador: { id: 1, nombre: "Ana" },
  observaciones: null,
  asistentesExternos: null,
  registradaPor: { id: 1, nombre: "Ana" },
  creadoEn: new Date("2026-11-14T15:00:00Z"),
  anulada: null,
  versiones: [version(1, true)],
  versionesOcultas: 0,
  asistentes: [],
  asistentesCantidad: 2,
  evidencias: [],
  evidenciasCantidad: 0,
  puedeVerEvidencia: true,
};

const pintar = (j: Partial<Jornada>) =>
  renderToStaticMarkup(<DetalleJornada jornada={{ ...base, ...j }} puedeAdjuntar={false} hasta={null} puedeAnular />);

describe("el texto de la anulación dice lo que pasa según la vigencia", () => {
  it("con versiones vigentes, los acuses vuelven a pendientes y la requerida se reabre", () => {
    expect(pintar({})).toContain("vuelven a pendientes y la socialización requerida se reabre.");
  });
  it("sin ninguna vigente, quedan superados y nada se reabre", () => {
    const h = pintar({ versiones: [version(1, false)] });
    expect(h).toContain("Ninguna de sus versiones sigue vigente");
    expect(h).not.toContain("se reabre");
  });
  it("con una mezcla, distingue las que siguen vigentes", () => {
    expect(pintar({ versiones: [version(1, true), version(2, false)] })).toContain("en las versiones que siguen vigentes");
  });
  it("ya anulada, lo dice en pasado", () => {
    const h = pintar({
      versiones: [version(1, false)],
      anulada: { en: new Date("2026-11-20T15:00:00Z"), por: "Ana", motivo: "Error de registro" },
    });
    expect(h).toContain("quedaron superados");
  });
  it("de lo que no se ve solo muestra la cuenta", () => {
    const h = pintar({ versionesOcultas: 2, puedeVerEvidencia: false });
    expect(h).toContain("y 2 documentos más que no puede ver");
  });
});
