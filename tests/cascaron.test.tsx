import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ContenidoBarra, LARGO_NOMBRE_LETRA_NORMAL, claseNombreEntidad } from "@/componentes/cascaron/ContenidoBarra";
import { MenuUsuario } from "@/componentes/cascaron/MenuUsuario";
import { entradasVisibles } from "@/componentes/cascaron/navegacion";

// Fuera del enrutador de Next usePathname devuelve null: se fija la ruta para todo el archivo.
vi.mock("next/navigation", () => ({ usePathname: () => "/admin/usuarios/5" }));

const marca = { nombre: "Hospital X", sigla: "HX", logoUrl: null };

describe("cascarón (render estático de los componentes cliente)", () => {
  it("una etiqueta larga de la navegación baja de línea: no se corta", () => {
    const h = renderToStaticMarkup(
      <ContenidoBarra marca={marca} entradas={entradasVisibles({ rol: "admin_sgc" })} tareas={0} version="0.1.0" />,
    );
    expect(h).toContain("Configuración documental");
    expect(h).not.toContain("truncate");
  });

  it("ContenidoBarra marca la ruta activa, agrupa y pinta el pie con la versión", () => {
    const h = renderToStaticMarkup(
      <ContenidoBarra marca={marca} entradas={entradasVisibles({ rol: "admin_sgc" })} tareas={0} version="0.1.0" />,
    );
    expect(h).toMatch(/aria-current="page"[^>]*href="\/admin\/usuarios"|href="\/admin\/usuarios"[^>]*aria-current="page"/);
    expect(h).toContain("Documentos");
    expect(h).toContain("Administración");
    expect(h).toContain("SGC Integral · v0.1.0");
    expect(h).toContain("HX"); // monograma sin logo
  });
  it("Trámites sale en la barra con su ícono, en el grupo Documentos", () => {
    const h = renderToStaticMarkup(
      <ContenidoBarra marca={marca} entradas={entradasVisibles({ rol: "lider_proceso" })} tareas={0} version="0.1.0" />,
    );
    expect(h).toMatch(/href="\/tramites"[^]*lucide-clipboard-list[^]*Trámites/);
    expect(
      renderToStaticMarkup(<ContenidoBarra marca={marca} entradas={entradasVisibles({ rol: "consulta" })} tareas={0} version="0.1.0" />),
    ).not.toContain('href="/tramites"');
  });
  it("el nombre de la entidad se muestra completo y la letra baja con los nombres largos", () => {
    expect(claseNombreEntidad("Hospital X")).toBe("text-sm");
    expect(claseNombreEntidad("x".repeat(LARGO_NOMBRE_LETRA_NORMAL))).toBe("text-sm");
    expect(claseNombreEntidad("x".repeat(LARGO_NOMBRE_LETRA_NORMAL + 1))).toBe("text-xs");
    const largo = "ESE Hospital Nuestra Señora de Fátima de Suaza";
    const h = renderToStaticMarkup(
      <ContenidoBarra marca={{ ...marca, nombre: largo }} entradas={[]} tareas={0} version="0.1.0" />,
    );
    expect(h).toContain(largo);
    expect(h).not.toContain("line-clamp");
    expect(h).toMatch(/class="[^"]*text-xs[^"]*"[^>]*>ESE Hospital/);
    const corto = renderToStaticMarkup(<ContenidoBarra marca={marca} entradas={[]} tareas={0} version="0.1.0" />);
    expect(corto).toMatch(/class="[^"]*text-sm[^"]*"[^>]*>Hospital X/);
  });
  it("sin tareas no hay contador; con 3, lo muestra", () => {
    const entradas = entradasVisibles({ rol: "admin_sgc" });
    expect(
      renderToStaticMarkup(<ContenidoBarra marca={marca} entradas={entradas} tareas={0} version="0.1.0" />),
    ).not.toContain("data-contador");
    expect(
      renderToStaticMarkup(<ContenidoBarra marca={marca} entradas={entradas} tareas={3} version="0.1.0" />),
    ).toContain('data-contador="3"');
  });
  it("la entrada «Vigencia» lleva el conteo de vencidos de su alcance, con texto accesible; sin vencidos o sin la entrada, nada", () => {
    const conVigencia = entradasVisibles({ rol: "consulta", responsableTecnico: true });
    const pintar = (entradas: ReturnType<typeof entradasVisibles>, vencidos: number) =>
      renderToStaticMarkup(<ContenidoBarra marca={marca} entradas={entradas} tareas={0} vencidos={vencidos} version="0.1.0" />);
    const con = pintar(conVigencia, 4);
    expect(con).toMatch(/href="\/vigencia"[^]*data-vencidos="4"[^>]*>4<span class="sr-only"> con revisión vencida<\/span><\/span>/);
    expect(pintar(conVigencia, 0)).not.toContain("data-vencidos");
    // Quien no ve la entrada no la tiene, ni su conteo.
    expect(pintar(entradasVisibles({ rol: "consulta" }), 4)).not.toContain("data-vencidos");
    // La insignia de «Inicio» sigue siendo la de las tareas.
    expect(renderToStaticMarkup(<ContenidoBarra marca={marca} entradas={conVigencia} tareas={2} vencidos={4} version="0.1.0" />)).toContain(
      'data-contador="2"',
    );
  });
  it("MenuUsuario ofrece los tres temas con el actual marcado", () => {
    const h = renderToStaticMarkup(<MenuUsuario nombre="Ana" etiquetaRol="Gerencia" tema="oscuro" />);
    expect(h).toContain("Según el sistema");
    // React escribe checked antes que value en los <input>: se acepta cualquier orden.
    expect(h).toMatch(/value="oscuro"[^>]*checked=""|checked=""[^>]*value="oscuro"/);
  });
});
