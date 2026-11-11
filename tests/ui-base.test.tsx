import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InsigniaEstadoDocumento } from "@/componentes/ui/Insignia";
import { TablaDatos } from "@/componentes/ui/TablaDatos";
import { TarjetaCifra } from "@/componentes/ui/TarjetaCifra";
import { EncabezadoPagina } from "@/componentes/ui/EncabezadoPagina";
import { Campo } from "@/componentes/ui/Campo";
import { Boton } from "@/componentes/ui/Boton";

const html = (n: React.ReactElement) => renderToStaticMarkup(n);

describe("componentes base de presentación", () => {
  it("InsigniaEstadoDocumento siempre lleva texto y la variante correcta", () => {
    const h = html(<InsigniaEstadoDocumento estado="vigente" />);
    expect(h).toContain("Vigente");
    expect(h).toContain('data-variante="bien"');
    expect(html(<InsigniaEstadoDocumento estado="raro" />)).toContain('data-variante="sin-dato"');
  });
  it("TablaDatos: región enfocable con etiqueta, caption oculto y fila vacía", () => {
    const h = html(
      <TablaDatos
        titulo="Usuarios"
        columnas={[
          { clave: "u", etiqueta: "Usuario" },
          { clave: "a", etiqueta: "Acción", oculta: true },
        ]}
        filas={0}
        vacio="Sin usuarios"
      >
        {null}
      </TablaDatos>,
    );
    expect(h).toContain('role="region"');
    expect(h).toContain('aria-label="Usuarios"');
    expect(h).toContain('tabindex="0"');
    expect(h).toContain("<caption");
    expect(h).toContain("Sin usuarios");
    expect(h).toMatch(/colspan="2"/i);
    expect(h).toMatch(/<span class="sr-only">Acción<\/span>/);
    // Posicionado: los `sr-only` de las celdas (absolutos) quedan dentro del desplazamiento de la tabla, y a 390 px la
    // página no se desplaza a lo ancho.
    expect(h).toMatch(/<div role="region"(?=[^>]*class="(?=[^"]*\brelative\b)(?=[^"]*\boverflow-x-auto\b)[^"]*")[^>]*>/);
  });
  it("TarjetaCifra pinta la franja del estado y el valor", () => {
    const h = html(<TarjetaCifra etiqueta="Vistas" valor={212} estado="bien" />);
    expect(h).toContain("212");
    expect(h).toContain('data-estado="bien"');
  });
  it("EncabezadoPagina pinta h1, texto superior y acciones", () => {
    const h = html(
      <EncabezadoPagina titulo="Usuarios" superior="Administración" acciones={<a href="/x">Nuevo</a>} />,
    );
    expect(h).toMatch(/<h1[^>]*>Usuarios<\/h1>/);
    expect(h).toContain("Administración");
    expect(h).toContain('href="/x"');
  });
  it("EncabezadoPagina pone código e insignias antes del h1 y el ícono fuera de él", () => {
    const h = html(
      <EncabezadoPagina
        titulo="Gestión del talento humano"
        icono={<span data-icono="si">I</span>}
        codigo="GTH-PR-02"
        insignias={<span data-insignia="si">Vigente</span>}
        descripcion="Descripción"
      />,
    );
    const h1 = h.indexOf("<h1");
    const contenidoH1 = h.slice(h1, h.indexOf("</h1>") + 5);
    expect(h1).toBeGreaterThan(-1);
    expect(h.indexOf('data-icono="si"')).toBeGreaterThan(-1);
    expect(h.indexOf('data-icono="si"')).toBeLessThan(h1);
    expect(h.indexOf("GTH-PR-02")).toBeLessThan(h.indexOf('data-insignia="si"'));
    expect(h.indexOf('data-insignia="si"')).toBeLessThan(h1);
    expect(contenidoH1).toBe('<h1 class="font-display text-2xl font-semibold tracking-tight">Gestión del talento humano</h1>');
    expect(h).toMatch(/<span class="font-mono[^"]*">GTH-PR-02<\/span>/);
    expect(h).not.toMatch(/uppercase[^"]*">GTH-PR-02/);
    expect(h.indexOf("Descripción")).toBeGreaterThan(h1);
  });
  it("Campo enlaza etiqueta, ayuda y error al control", () => {
    const h = html(
      <Campo etiqueta="Sigla" nombre="sigla" ayuda="2 a 12 letras" error="Muy corta">
        <input />
      </Campo>,
    );
    expect(h).toContain('for="sigla"');
    expect(h).toContain('id="sigla"');
    expect(h).toContain('aria-invalid="true"');
    expect(h).toMatch(/aria-describedby="[^"]*sigla-error/);
  });
  it("Boton pendiente queda deshabilitado y ocupado", () => {
    expect(html(<Boton pendiente>Guardar</Boton>)).toMatch(
      /disabled=""[^>]*aria-busy="true"|aria-busy="true"[^>]*disabled=""/,
    );
  });
});
