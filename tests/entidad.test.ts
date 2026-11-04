/**
 * Consultas de la entidad (marca configurable), contra la BD de desarrollo.
 * El actor lleva nombre único por corrida y no se borra (auditoría de solo inserción).
 */
import { existsSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

if (!process.env.DATABASE_URL && existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { obtenerSql } from "@/db/cliente";
import {
  guardarEntidad,
  guardarLogo,
  obtenerEntidad,
  obtenerMarca,
  quitarLogo,
} from "@/db/consultas/entidad";

const sql = () => obtenerSql();
let actorId: number;

beforeAll(async () => {
  const nombre = `zz_entidad_${Date.now()}`;
  const [u] = await sql()`
    INSERT INTO usuarios (usuario, nombre, hash_clave, rol, acepto_datos_en)
    VALUES (${nombre}, ${nombre}, 'hash-falso', 'admin_sgc', now()) RETURNING id`;
  actorId = Number(u.id);
});

describe("entidad", () => {
  it("obtenerMarca completa con los valores por defecto lo que falta", async () => {
    const m = await obtenerMarca();
    expect(m.primario).toMatch(/^#[0-9a-f]{6}$/);
    expect(m.sigla.length).toBeGreaterThan(0);
  });

  it("guardarEntidad rechaza P1 con el mensaje y no escribe", async () => {
    const antes = await obtenerEntidad();
    await expect(guardarEntidad({ ...antes, primario: "#9ecbff" }, actorId)).rejects.toThrow(/texto blanco/);
    expect((await obtenerEntidad()).primario).toBe(antes.primario);
  });

  it("guardarEntidad escribe las seis claves y audita", async () => {
    const antes = await obtenerEntidad();
    await guardarEntidad({ ...antes, sigla: "ZZS" }, actorId);
    expect((await obtenerEntidad()).sigla).toBe("ZZS");
    const [a] = await sql()`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_configuracion' ORDER BY id DESC LIMIT 1`;
    expect(a.detalle.claves).toContain("sigla_entidad");
    await guardarEntidad(antes, actorId);
  });

  it("guardarLogo devuelve la ruta anterior solo si cambia, y quitarLogo la limpia", async () => {
    const logo = { ruta: "marca/logo-aaaaaaaa.png", mime: "image/png", version: "aaaaaaaa", nombre: "l.png", bytes: 10, ancho: 64, alto: 64 };
    const previo = await sql()`SELECT clave, valor FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime', 'logo_version')`;
    try {
      await guardarLogo(logo, actorId);
      expect((await obtenerMarca()).logo).toEqual({ version: "aaaaaaaa", mime: "image/png" });
      expect((await guardarLogo(logo, actorId)).rutaAnterior).toBeNull();
      expect((await guardarLogo({ ...logo, ruta: "marca/logo-bbbbbbbb.png", version: "bbbbbbbb" }, actorId)).rutaAnterior).toBe("marca/logo-aaaaaaaa.png");
      expect((await quitarLogo(actorId)).rutaAnterior).toBe("marca/logo-bbbbbbbb.png");
      expect((await obtenerMarca()).logo).toBeNull();
    } finally {
      // Restaura el logo previo (la demo trae uno).
      await sql()`DELETE FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime', 'logo_version')`;
      for (const f of previo) {
        await sql()`INSERT INTO configuracion (clave, valor) VALUES (${f.clave}, ${f.valor})`;
      }
    }
  });
});
