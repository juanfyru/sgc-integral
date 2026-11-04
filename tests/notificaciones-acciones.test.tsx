import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Campana } from "@/componentes/cascaron/Campana";
import { EsquemaIdNotificacion, EsquemaTema } from "@/lib/esquemas/entidad";
import { destinoNotificacion } from "@/lib/rutas";
import { ErrorValidacion, parsearFormulario } from "@/lib/validacion";
import { tiempoRelativo } from "@/lib/zona-horaria";

const nota = (o: Partial<Parameters<typeof Campana>[0]["recientes"][number]> = {}) => ({
  id: 7, tipo: "aviso", titulo: "Bienvenida", cuerpo: "Cuerpo", enlace: "/cuenta",
  leidaEn: null, creadoEn: new Date(), ...o,
});

describe("notificaciones", () => {
  it("un enlace externo o javascript: cae a /", () => {
    expect(destinoNotificacion("https://ejemplo.com/x")).toBe("/");
    expect(destinoNotificacion("javascript:alert(1)")).toBe("/");
    expect(destinoNotificacion("//evil")).toBe("/");
    expect(destinoNotificacion(null)).toBe("/");
    expect(destinoNotificacion("/documentos/pr-gth-001")).toBe("/documentos/pr-gth-001");
  });
  it("tiempoRelativo", () => {
    const ahora = new Date("2026-11-04T15:00:00Z");
    expect(tiempoRelativo(new Date("2026-11-04T14:55:00Z"), ahora)).toBe("hace 5 min");
    expect(tiempoRelativo(new Date("2026-11-04T12:00:00Z"), ahora)).toBe("hace 3 h");
    expect(tiempoRelativo(new Date("2026-11-03T15:00:00Z"), ahora)).toBe("ayer");
    // 22:00 del día 3 y 15:00 del día 3 en Bogotá: el mismo día local aunque en UTC sean días distintos.
    expect(tiempoRelativo(new Date("2026-11-03T20:00:00Z"), new Date("2026-11-04T03:00:00Z"))).toBe("hace 7 h");
    expect(tiempoRelativo(new Date("2026-10-20T15:00:00Z"), ahora)).toBe("2026-10-20");
  });
  it("Campana vacía muestra el texto y sin contador", () => {
    const h = renderToStaticMarkup(<Campana noLeidas={0} recientes={[]} />);
    expect(h).toContain("Sin notificaciones");
    expect(h).not.toContain("Marcar todas");
    expect(h).toContain('aria-label="Notificaciones, 0 sin leer"');
  });
  it("Campana con pendientes: contador 9+, lista y marcar todas", () => {
    const h = renderToStaticMarkup(<Campana noLeidas={12} recientes={[nota()]} />);
    expect(h).toContain("9+");
    expect(h).toContain("Bienvenida");
    expect(h).toContain("Marcar todas como leídas");
    expect(h).toContain('name="volver"');
  });
  it("el id de la notificación se valida", () => {
    const f = new FormData();
    f.set("id", "abc");
    expect(() => parsearFormulario(f, EsquemaIdNotificacion)).toThrow(ErrorValidacion);
  });
  it("un tema fabricado lanza ErrorValidacion (la acción lo atrapa)", () => {
    const f = new FormData();
    f.set("tema", "azul");
    f.set("volver", "/buscar?q=x");
    expect(() => parsearFormulario(f, EsquemaTema, { omitir: ["volver"] })).toThrow(ErrorValidacion);
  });
});
