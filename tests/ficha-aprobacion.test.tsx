/**
 * La ficha dice cómo se aprobó la versión vigente (spec 13A §13.2 y §15.5): en la plataforma, con
 * su acta, o fuera de ella.
 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { DatosDeAprobacion } from "@/componentes/documentos/DatosDeAprobacion";
import { obtenerSql } from "@/db/cliente";
import { obtenerFichaDocumento } from "@/db/consultas/documentos";
import { transicionar } from "@/db/consultas/tramites-flujo";
import { documentoLibre, opc, sesionAdmin, tramiteEn } from "./utiles/tramites";
import { revertida } from "./utiles/transaccion";

const sql = obtenerSql();

afterAll(async () => {
  await sql.end();
  globalThis.__sql = undefined;
});

const pintar = (origen: "plataforma" | "fuera", tramiteId: number | null) =>
  renderToStaticMarkup(<DatosDeAprobacion origen={origen} tramiteId={tramiteId} />);

describe("DatosDeAprobacion", () => {
  it("aprobada en la plataforma: lo dice y conserva el enlace al acta", () => {
    const html = pintar("plataforma", 7);
    expect(html).toContain("<dt");
    expect(html).toContain(">Aprobación<");
    expect(html).toContain("Aprobada en la plataforma");
    expect(html).toContain('href="/tramites/7/acta"');
    expect(html).toContain("Acta de aprobación");
  });

  it("aprobada fuera: lo dice y no ofrece un acta que no existe", () => {
    const html = pintar("fuera", null);
    expect(html).toContain(">Aprobación<");
    expect(html).toContain("Aprobación registrada fuera de la plataforma");
    expect(html).not.toContain("/acta");
    expect(html).not.toContain("Acta de aprobación");
  });
});

describe("obtenerFichaDocumento", () => {
  it("da el origen de la aprobación de la versión vigente", () => revertida(sql, async (tx) => {
    const admin = await sesionAdmin(tx);
    const heredado = await documentoLibre(tx, { proceso: "GTH", tipo: "PR" });
    const fuera = await obtenerFichaDocumento(heredado.codigo, admin, { sql: tx });
    expect(fuera!.version).toMatchObject({ origenAprobacion: "fuera", tramiteId: null });

    const t = await tramiteEn(tx, "publicacion");
    try {
      await transicionar(t.admin, { tramiteId: t.tramiteId, accion: "publicar", etapaEsperada: "publicacion", rondaEsperada: t.ronda, credenciales: { clave: "x" } }, opc(tx));
      const plataforma = await obtenerFichaDocumento(t.codigo, admin, { sql: tx });
      expect(plataforma!.version).toMatchObject({ origenAprobacion: "plataforma", tramiteId: t.tramiteId });
    } finally {
      await t.limpiar();
    }
  }));
});
