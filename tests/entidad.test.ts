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
  obtenerLogoAlmacenado,
  obtenerMarca,
  obtenerUrlPublica,
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

  it("guardarEntidad rechaza colores que no son hex y no escribe", async () => {
    const antes = await obtenerEntidad();
    try {
      for (const malo of ["red", "#135", "#1b4e8e;}", "url(x)"]) {
        await expect(guardarEntidad({ ...antes, primario: malo }, actorId)).rejects.toThrow("Color inválido");
        await expect(guardarEntidad({ ...antes, secundario: malo }, actorId)).rejects.toThrow("Color inválido");
      }
      expect(await obtenerEntidad()).toEqual(antes);
    } finally {
      await guardarEntidad(antes, actorId);
    }
  });

  it("guardarEntidad escribe las seis claves y audita", async () => {
    const antes = await obtenerEntidad();
    try {
      await guardarEntidad({ ...antes, sigla: "ZZS" }, actorId);
      expect((await obtenerEntidad()).sigla).toBe("ZZS");
      const [a] = await sql()`SELECT detalle FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'editar_configuracion' ORDER BY id DESC LIMIT 1`;
      expect(a.detalle.claves).toContain("sigla_entidad");
    } finally {
      await guardarEntidad(antes, actorId);
    }
  });

  it("la dirección pública se valida, se guarda sin barra final y vacía es null", async () => {
    const antes = await obtenerEntidad();
    try {
      await expect(guardarEntidad({ ...antes, urlPublica: "javascript:alert(1)" }, actorId)).rejects.toThrow(/http/);
      expect((await obtenerEntidad()).urlPublica).toBe(antes.urlPublica);
      await guardarEntidad({ ...antes, urlPublica: "https://sgc.hospital.gov.co/" }, actorId);
      expect(await obtenerUrlPublica()).toBe("https://sgc.hospital.gov.co");
      expect((await obtenerEntidad()).urlPublica).toBe("https://sgc.hospital.gov.co");
      await guardarEntidad({ ...antes, urlPublica: "" }, actorId);
      expect(await obtenerUrlPublica()).toBeNull();
    } finally {
      await guardarEntidad(antes, actorId);
    }
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

describe("obtenerLogoAlmacenado", () => {
  async function conClaves(ruta: string, mime: string, prueba: () => Promise<void>) {
    const previas = await sql()`SELECT clave, valor FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime')`;
    try {
      for (const [clave, valor] of [["logo_ruta", ruta], ["logo_mime", mime]]) {
        await sql()`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
          ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      }
      await prueba();
    } finally {
      await sql()`DELETE FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime')`;
      for (const f of previas) {
        await sql()`INSERT INTO configuracion (clave, valor) VALUES (${f.clave}, ${f.valor})`;
      }
    }
  }
  it("devuelve la ruta y el MIME cuando son válidos", async () => {
    await conClaves("marca/logo-f0e59280.png", "image/png", async () => {
      expect(await obtenerLogoAlmacenado()).toEqual({ ruta: "marca/logo-f0e59280.png", mime: "image/png" });
    });
  });
  it("devuelve null con una logo_ruta fuera de marca/logo-<hex>", async () => {
    await conClaves("documentos/SGC-PR-01/v1/x.png", "image/png", async () => {
      expect(await obtenerLogoAlmacenado()).toBeNull();
    });
  });
  it("devuelve null con un logo_mime que no es propio de LOGO_MIMES", async () => {
    await conClaves("marca/logo-f0e59280.png", "constructor", async () => {
      expect(await obtenerLogoAlmacenado()).toBeNull();
    });
    await conClaves("marca/logo-f0e59280.png", "image/svg+xml", async () => {
      expect(await obtenerLogoAlmacenado()).toBeNull();
    });
  });
});

describe("entidad: textos recortados y quitar sin logo", () => {
  async function conClavesRestauradas(claves: string[], prueba: () => Promise<void>) {
    const previas = await sql()`SELECT clave, valor FROM configuracion WHERE clave IN ${sql()(claves)}`;
    try {
      await prueba();
    } finally {
      await sql()`DELETE FROM configuracion WHERE clave IN ${sql()(claves)}`;
      for (const f of previas) {
        await sql()`INSERT INTO configuracion (clave, valor) VALUES (${f.clave}, ${f.valor})`;
      }
    }
  }

  it("obtenerMarca devuelve nombre, sigla y lema ya recortados", async () => {
    await conClavesRestauradas(["nombre_entidad", "sigla_entidad", "lema"], async () => {
      for (const [clave, valor] of [["nombre_entidad", "  Hospital ZZ  "], ["sigla_entidad", "\tZZS \n"], ["lema", "  Un lema  "]]) {
        await sql()`INSERT INTO configuracion (clave, valor) VALUES (${clave}, ${valor})
          ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor`;
      }
      const m = await obtenerMarca();
      expect(m.nombre).toBe("Hospital ZZ");
      expect(m.sigla).toBe("ZZS");
      expect(m.lema).toBe("Un lema");
    });
  });

  it("quitarLogo sin logo no audita y devuelve rutaAnterior null", async () => {
    await conClavesRestauradas(["logo_ruta", "logo_mime", "logo_version"], async () => {
      await sql()`DELETE FROM configuracion WHERE clave IN ('logo_ruta', 'logo_mime', 'logo_version')`;
      const contar = async () => {
        const [f] = await sql()`SELECT count(*)::int AS n FROM auditoria WHERE usuario_id = ${actorId} AND accion = 'quitar_logo'`;
        return Number(f.n);
      };
      const antes = await contar();
      expect(await quitarLogo(actorId)).toEqual({ rutaAnterior: null });
      expect(await contar()).toBe(antes);
    });
  });
});
