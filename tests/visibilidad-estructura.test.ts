/**
 * Guarda estática de spec 13A §12: ninguna consulta del portal que lea
 * documentos vigentes queda sin la regla de acceso. Si aparece una consulta
 * nueva con `estado = 'vigente'` sin `filtroAcceso(`, este test falla.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const contar = (texto: string, aguja: string) => texto.split(aguja).length - 1;

describe("consultas del portal", () => {
  it.each(["documentos.ts", "procesos.ts", "busqueda.ts", "mapa.ts"])(
    "%s aplica filtroAcceso en cada lectura de vigentes",
    (archivo) => {
      // obtenerDatosMapaAdmin (vista previa del panel) es la última función de mapa.ts y queda fuera.
      const [codigo] = readFileSync(`src/db/consultas/${archivo}`, "utf8").split(
        "export async function obtenerDatosMapaAdmin",
      );
      const vigentes = contar(codigo, "estado = 'vigente'");
      expect(vigentes).toBeGreaterThan(0);
      expect(contar(codigo, "filtroAcceso(")).toBeGreaterThanOrEqual(vigentes);
    },
  );
});

describe("interfaz", () => {
  it("la ficha del portal marca el documento restringido", () => {
    const pagina = readFileSync("src/app/(app)/documentos/[codigo]/page.tsx", "utf8");
    expect(pagina).toContain("Acceso restringido");
  });

  it("el formulario de usuarios habla de Procesos para cualquier rol", () => {
    const formulario = readFileSync("src/componentes/admin/usuarios/FormularioUsuario.tsx", "utf8");
    expect(formulario).not.toContain("Procesos que lidera");
    expect(formulario).toContain(">Procesos</legend>");
    expect(formulario).toContain(
      "Para un líder: los procesos que lidera. Para los demás: los procesos a los que pertenece; le dan acceso a sus documentos restringidos.",
    );
  });
});
