/**
 * Lógica de arranque del contenedor (Fase 10): espera de BD con reintentos y
 * bootstrap del admin desde variables de entorno. Sin BD ni timers reales.
 */
import { describe, expect, it } from "vitest";
import {
  configurarAdminDesdeEnv,
  decidirConexiones,
  esperarConReintentos,
} from "@/lib/arranque";

describe("esperarConReintentos", () => {
  it("devuelve 1 si el primer intento funciona, sin dormir", async () => {
    const esperas: number[] = [];
    const intento = await esperarConReintentos(async () => {}, {
      intentos: 5,
      esperaMs: 100,
      dormir: async (ms) => {
        esperas.push(ms);
      },
    });
    expect(intento).toBe(1);
    expect(esperas).toEqual([]);
  });

  it("reintenta hasta que funciona y duerme entre intentos", async () => {
    const esperas: number[] = [];
    let llamadas = 0;
    const intento = await esperarConReintentos(
      async () => {
        llamadas++;
        if (llamadas < 3) throw new Error("aún no");
      },
      {
        intentos: 5,
        esperaMs: 200,
        dormir: async (ms) => {
          esperas.push(ms);
        },
      },
    );
    expect(intento).toBe(3);
    expect(esperas).toEqual([200, 200]);
  });

  it("al agotar los intentos relanza el último error", async () => {
    let llamadas = 0;
    await expect(
      esperarConReintentos(
        async () => {
          llamadas++;
          throw new Error(`fallo ${llamadas}`);
        },
        { intentos: 3, esperaMs: 1, dormir: async () => {} },
      ),
    ).rejects.toThrow("fallo 3");
    expect(llamadas).toBe(3);
  });
});

describe("configurarAdminDesdeEnv", () => {
  const base = { ADMIN_USUARIO: "admin", ADMIN_CLAVE: "secreta123" };

  it("con usuario y clave devuelve la config completa sin forzar", () => {
    const r = configurarAdminDesdeEnv({ ...base, ADMIN_NOMBRE: "Calidad" });
    expect(r).toEqual({
      accion: "asegurar",
      config: {
        usuario: "admin",
        nombre: "Calidad",
        clave: "secreta123",
        forzarClave: false,
      },
    });
  });

  it("sin ADMIN_NOMBRE usa 'Administrador'", () => {
    const r = configurarAdminDesdeEnv(base);
    expect(r.accion).toBe("asegurar");
    if (r.accion === "asegurar") expect(r.config.nombre).toBe("Administrador");
  });

  it("ADMIN_FORZAR_CLAVE=1 activa forzarClave", () => {
    const r = configurarAdminDesdeEnv({ ...base, ADMIN_FORZAR_CLAVE: "1" });
    if (r.accion === "asegurar") expect(r.config.forzarClave).toBe(true);
    else expect.fail("debió asegurar");
  });

  it("sin ADMIN_CLAVE se omite nombrando la variable en el motivo", () => {
    const r = configurarAdminDesdeEnv({ ADMIN_USUARIO: "admin" });
    expect(r.accion).toBe("omitir");
    if (r.accion === "omitir") expect(r.motivo).toContain("ADMIN_CLAVE");
  });

  it("sin ADMIN_USUARIO se omite nombrando la variable en el motivo", () => {
    const r = configurarAdminDesdeEnv({ ADMIN_CLAVE: "x" });
    expect(r.accion).toBe("omitir");
    if (r.accion === "omitir") expect(r.motivo).toContain("ADMIN_USUARIO");
  });
});

describe("decidirConexiones", () => {
  it("con las tres variables usa migrador y app distintas, sin advertencias", () => {
    const c = decidirConexiones({
      DATABASE_URL: "postgres://app",
      DATABASE_URL_MIGRADOR: "postgres://dueno",
      BD_APP_CLAVE: "k",
    });
    expect(c).toEqual({
      migrador: "postgres://dueno",
      app: "postgres://app",
      claveApp: "k",
      advertencias: [],
    });
  });
  it("sin migrador cae al modo heredado con advertencia", () => {
    const c = decidirConexiones({ DATABASE_URL: "postgres://x" });
    expect(c.migrador).toBe("postgres://x");
    expect(c.claveApp).toBeNull();
    expect(c.advertencias.join(" ")).toMatch(/DATABASE_URL_MIGRADOR/);
    expect(c.advertencias.join(" ")).toMatch(/BD_APP_CLAVE/);
  });
  it("sin DATABASE_URL lanza", () => {
    expect(() => decidirConexiones({})).toThrow(/DATABASE_URL/);
  });
});
