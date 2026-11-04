import { expect, it } from "vitest";
import { pendienteDeCuenta, puedeDesactivarTotp, rutaDePendiente } from "@/lib/cuenta-estado";

const base = { rol: "consulta" as const, factorPendiente: false, debeCambiarClave: false, aceptoDatos: true, totpActivo: false };
it("devuelve null cuando no hay pendientes y respeta el orden factor > clave > aviso > totp", () => {
  expect(pendienteDeCuenta(base, [])).toBeNull();
  expect(pendienteDeCuenta({ ...base, factorPendiente: true, debeCambiarClave: true }, [])).toBe("factor");
  expect(pendienteDeCuenta({ ...base, debeCambiarClave: true, aceptoDatos: false }, [])).toBe("clave");
  expect(pendienteDeCuenta({ ...base, aceptoDatos: false }, [])).toBe("aviso");
  expect(pendienteDeCuenta({ ...base, rol: "admin_sgc" }, ["admin_sgc"])).toBe("totp_obligatorio");
  expect(pendienteDeCuenta({ ...base, rol: "admin_sgc", totpActivo: true }, ["admin_sgc"])).toBeNull();
});
it("rutaDePendiente mapea las cuatro rutas", () => {
  expect(rutaDePendiente("factor")).toBe("/ingreso/verificar");
  expect(rutaDePendiente("clave")).toBe("/cuenta/clave-inicial");
  expect(rutaDePendiente("aviso")).toBe("/aviso-datos");
  expect(rutaDePendiente("totp_obligatorio")).toBe("/cuenta/segundo-factor?obligatorio=1");
});

it("puedeDesactivarTotp niega a los roles que exigen segundo factor", () => {
  expect(puedeDesactivarTotp("admin_sgc", ["admin_sgc", "gerencia"])).toBe(false);
  expect(puedeDesactivarTotp("consulta", ["admin_sgc", "gerencia"])).toBe(true);
  expect(puedeDesactivarTotp("admin_sgc", [])).toBe(true);
});
