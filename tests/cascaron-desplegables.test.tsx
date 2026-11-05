/**
 * Campana y menú de usuario de la barra superior: la lógica de cierre (Escape, clic fuera, apertura
 * exclusiva) y el envío diferido del tema viven en módulos sin DOM y se prueban con objetos simples y
 * temporizadores falsos; el render estático comprueba que los dos siguen siendo <details> con sus
 * formularios (funcionan sin JavaScript).
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Campana } from "@/componentes/cascaron/Campana";
import { MenuUsuario } from "@/componentes/cascaron/MenuUsuario";
import { cerrarConEscape, cerrarSiPulsaFuera, crearGrupoExclusivo, type Plegable } from "@/componentes/cascaron/logica-desplegable";
import { ESPERA_TEMA_MS, crearEnvioDiferido } from "@/componentes/cascaron/envio-diferido";

vi.mock("next/navigation", () => ({ usePathname: () => "/documentos" }));

/** Un <details> de mentira: `dentro` son los nodos que contiene (resumen, botones, formularios). */
function plegable(abierto: boolean, ...dentro: object[]): Plegable {
  return { open: abierto, contains: (n) => n !== null && dentro.includes(n) };
}
const cuerpo = { nodo: "body" } as unknown as Node;
const nodo = (nombre: string) => ({ nombre }) as unknown as Node;

describe("desplegable: Escape", () => {
  it("con el foco dentro, lo cierra y pide devolver el foco al resumen", () => {
    const radio = nodo("radio del tema");
    const p = plegable(true, radio);
    expect(cerrarConEscape(p, "Escape", radio, cuerpo)).toBe(true);
    expect(p.open).toBe(false);
  });
  it("sin foco en ninguna parte (abierto con el ratón en Safari) también lo cierra", () => {
    const p = plegable(true);
    expect(cerrarConEscape(p, "Escape", cuerpo, cuerpo)).toBe(true);
    expect(cerrarConEscape(plegable(true), "Escape", null, cuerpo)).toBe(true);
  });
  it("no roba el Escape de otro diálogo (foco en el buscador Ctrl K) ni reacciona a otra tecla", () => {
    const p = plegable(true, nodo("dentro"));
    expect(cerrarConEscape(p, "Escape", nodo("campo del buscador"), cuerpo)).toBe(false);
    expect(cerrarConEscape(p, "Enter", cuerpo, cuerpo)).toBe(false);
    expect(p.open).toBe(true);
  });
  it("cerrado no hace nada", () => {
    const p = plegable(false);
    expect(cerrarConEscape(p, "Escape", cuerpo, cuerpo)).toBe(false);
    expect(p.open).toBe(false);
  });
});

describe("desplegable: clic fuera", () => {
  it("un clic fuera lo cierra", () => {
    const p = plegable(true, nodo("dentro"));
    expect(cerrarSiPulsaFuera(p, nodo("contenido de la página"))).toBe(true);
    expect(p.open).toBe(false);
  });
  it("un clic dentro (Marcar todas, un aviso, un radio del tema) no lo cierra", () => {
    const marcarTodas = nodo("botón Marcar todas como leídas");
    const aviso = nodo("botón del aviso");
    const radio = nodo("radio Oscuro");
    const p = plegable(true, marcarTodas, aviso, radio);
    for (const objetivo of [marcarTodas, aviso, radio]) expect(cerrarSiPulsaFuera(p, objetivo)).toBe(false);
    expect(p.open).toBe(true);
  });
  it("cerrado, un clic fuera no hace nada", () => {
    const p = plegable(false);
    expect(cerrarSiPulsaFuera(p, nodo("x"))).toBe(false);
    expect(p.open).toBe(false);
  });
});

describe("desplegable: apertura exclusiva", () => {
  it("abrir uno cierra el otro", () => {
    const grupo = crearGrupoExclusivo();
    const campana = plegable(true);
    const menu = plegable(false);
    grupo.registrar(campana);
    grupo.registrar(menu);
    menu.open = true;
    grupo.alAbrir(menu);
    expect(campana.open).toBe(false);
    expect(menu.open).toBe(true);
    campana.open = true;
    grupo.alAbrir(campana);
    expect(menu.open).toBe(false);
    expect(campana.open).toBe(true);
  });
  it("uno que se desmontó deja de contar", () => {
    const grupo = crearGrupoExclusivo();
    const viejo = plegable(true);
    const nuevo = plegable(true);
    const quitar = grupo.registrar(viejo);
    grupo.registrar(nuevo);
    quitar();
    grupo.alAbrir(nuevo);
    expect(viejo.open).toBe(true);
  });
});

describe("tema: envío diferido", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  /** El formulario del tema de mentira y su `enviar`, como el que pasa onChange. */
  const formulario = () => {
    const f = { requestSubmit: vi.fn() };
    return { f, enviar: () => f.requestSubmit() };
  };

  it("dos cambios seguidos dan un solo requestSubmit, unos 400 ms después del último", () => {
    const { f, enviar } = formulario();
    const envio = crearEnvioDiferido();
    expect(ESPERA_TEMA_MS).toBe(400);
    envio.cambio(enviar); // flecha: Claro → Oscuro
    vi.advanceTimersByTime(300);
    envio.cambio(enviar); // flecha: Oscuro → Según el sistema
    vi.advanceTimersByTime(ESPERA_TEMA_MS - 1);
    expect(f.requestSubmit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.requestSubmit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(f.requestSubmit).toHaveBeenCalledTimes(1);
  });
  it("vale el envío del último cambio", () => {
    const primero = formulario();
    const ultimo = formulario();
    const envio = crearEnvioDiferido();
    envio.cambio(primero.enviar);
    envio.cambio(ultimo.enviar);
    vi.advanceTimersByTime(ESPERA_TEMA_MS);
    expect(primero.f.requestSubmit).not.toHaveBeenCalled();
    expect(ultimo.f.requestSubmit).toHaveBeenCalledTimes(1);
  });
  it("si el foco sale del grupo antes, envía en ese momento y no otra vez al vencer la espera", () => {
    const { f, enviar } = formulario();
    const envio = crearEnvioDiferido();
    envio.cambio(enviar);
    vi.advanceTimersByTime(100);
    envio.vaciar();
    expect(f.requestSubmit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(ESPERA_TEMA_MS);
    expect(f.requestSubmit).toHaveBeenCalledTimes(1);
  });
  it("sin cambio pendiente, la salida del foco no envía", () => {
    const envio = crearEnvioDiferido();
    envio.vaciar();
    const { f, enviar } = formulario();
    envio.cambio(enviar);
    vi.advanceTimersByTime(ESPERA_TEMA_MS);
    envio.vaciar();
    expect(f.requestSubmit).toHaveBeenCalledTimes(1);
  });
  it("cancelar (Aplicar ya envió, o el menú se desmonta) descarta el pendiente", () => {
    const { f, enviar } = formulario();
    const envio = crearEnvioDiferido();
    envio.cambio(enviar);
    envio.cancelar();
    vi.advanceTimersByTime(ESPERA_TEMA_MS * 2);
    envio.vaciar();
    expect(f.requestSubmit).not.toHaveBeenCalled();
  });
});

describe("campana y menú siguen siendo <details> con sus formularios", () => {
  const aviso = {
    id: 7, tipo: "aviso", titulo: "Bienvenida", cuerpo: "Cuerpo", enlace: "/cuenta",
    leidaEn: null, creadoEn: new Date(),
  };
  it("la campana: resumen con su etiqueta, avisos y Marcar todas", () => {
    const h = renderToStaticMarkup(<Campana noLeidas={2} recientes={[aviso]} />);
    expect(h).toMatch(/^<details[^>]*name="barra-superior"/);
    expect(h).toContain('<summary aria-label="Notificaciones, 2 sin leer"');
    expect(h).toContain("Marcar todas como leídas");
    expect(h).toContain('name="volver"');
  });
  it("el menú: el formulario del tema conserva Aplicar (sin JavaScript) y la ruta para volver", () => {
    const h = renderToStaticMarkup(<MenuUsuario nombre="Ana" etiquetaRol="Gerencia" tema="claro" />);
    expect(h).toMatch(/^<details[^>]*name="barra-superior"/);
    expect(h).toContain('type="radio"');
    expect(h).toContain(">Aplicar</button>");
    expect(h).toContain('name="volver" value="/documentos"');
    expect(h).toContain("Salir");
  });
});

// Sin DOM en los tests (no hay jsdom ni happy-dom), el cableado de los eventos se comprueba en la fuente.
describe("cableado de los componentes", () => {
  const fuente = (archivo: string) => readFileSync(`src/componentes/cascaron/${archivo}`, "utf8");
  it("MenuUsuario: cada cambio de radio programa el envío; requestSubmit solo lo llama el envío diferido", () => {
    const m = fuente("MenuUsuario.tsx");
    expect(m).toContain("envioTema.cambio(() => formulario?.requestSubmit())");
    expect(m).toContain("envioTema.vaciar()");
    expect(m).toContain("envioTema.cancelar(); // Aplicar");
    expect(m.match(/requestSubmit/g)).toHaveLength(1);
  });
  it("Desplegable: se cierra al cambiar la ruta y escucha pointerdown y keydown mientras está abierto", () => {
    const d = fuente("Desplegable.tsx");
    expect(d).toMatch(/detalles\.current\.open = false;\s*\}, \[ruta\]\);/);
    expect(d).toContain('document.addEventListener("pointerdown", alPulsar)');
    expect(d).toContain('document.addEventListener("keydown", alTeclear)');
    expect(d).toContain("resumenRef.current?.focus()");
    expect(d).toContain("grupoBarraSuperior.alAbrir(el)");
  });
});
