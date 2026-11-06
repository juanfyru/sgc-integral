/** El aviso de la lista de verificación cuando no queda ningún ítem activo (F13A-R37). */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ListaItemsVerificacion } from "@/componentes/admin/config-documental/ListaItemsVerificacion";
import type { ItemVerificacion } from "@/db/consultas/revision";

vi.mock("@/app/admin/acciones-config-documental", () => ({
  alternarItemVerificacionAccion: vi.fn(),
  crearItemVerificacionAccion: vi.fn(),
  editarItemVerificacionAccion: vi.fn(),
  moverItemVerificacionAccion: vi.fn(),
}));

const item = (id: number, activo: boolean): ItemVerificacion => ({ id, texto: `Ítem ${id}`, critico: false, orden: id, activo });
const aviso = "No hay ítems activos: ningún revisor puede dar el concepto favorable hasta que active al menos uno.";
const lista = (items: ItemVerificacion[]) => renderToStaticMarkup(<ListaItemsVerificacion items={items} />);

describe("ListaItemsVerificacion", () => {
  it("avisa si desactivar dejó la lista sin ítems activos", () => {
    expect(lista([item(1, false), item(2, false)])).toContain(aviso);
  });

  it("no avisa mientras quede uno activo, y la región ya existe para que se anuncie al aparecer", () => {
    const html = lista([item(1, false), item(2, true)]);
    expect(html).not.toContain(aviso);
    expect(html).toMatch(/<p id="sin-items-activos" role="status"[^>]*><\/p>/);
  });
});
