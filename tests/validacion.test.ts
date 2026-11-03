import { expect, it } from "vitest";
import { EsquemaIngreso } from "@/lib/esquemas/cuenta";
import { EsquemaUsuario, type DatosUsuarioFormulario } from "@/lib/esquemas/usuarios";
import { ErrorValidacion, parsearFormulario } from "@/lib/validacion";

it("convierte FormData y reporta el primer error en espanol con el campo", () => {
  const fd = new FormData(); fd.set("usuario", " Ana "); fd.set("clave", "x");
  expect(parsearFormulario(fd, EsquemaIngreso)).toEqual({ usuario: "Ana", clave: "x" });
  const malo = new FormData(); malo.set("usuario", "");
  expect(() => parsearFormulario(malo, EsquemaIngreso)).toThrow(ErrorValidacion);
  expect(() => parsearFormulario(malo, EsquemaIngreso)).toThrow(/^usuario: /);
});

it("ignora los campos $ACTION_ de React aun con esquema estricto", () => {
  const fd = new FormData();
  fd.set("$ACTION_KEY", "k123"); fd.set("$ACTION_1:0", "[1]"); fd.set("$ACTION_REF_1", "x");
  fd.set("usuario", "ana"); fd.set("clave", "x");
  expect(parsearFormulario(fd, EsquemaIngreso)).toEqual({ usuario: "ana", clave: "x" });
});

it("EsquemaUsuario exige procesos al lider y rechaza campos extra", () => {
  expect(() => EsquemaUsuario.parse({ usuario: "ana.p", nombre: "Ana Pérez", rol: "lider_proceso", procesoIds: [], verHistorial: false })).toThrow(/proceso/);
  expect(() => EsquemaUsuario.parse({ usuario: "ana.p", nombre: "Ana Pérez", rol: "consulta", procesoIds: [], verHistorial: false, extra: 1 })).toThrow();
});

it("EsquemaUsuario coacciona lo que llega de un formulario", () => {
  const fd = new FormData();
  fd.set("usuario", "ana.p"); fd.set("nombre", "Ana Pérez"); fd.set("correo", "");
  fd.set("rol", "lider_proceso"); fd.set("cargoId", ""); fd.set("jefeInmediatoId", "4");
  fd.append("procesoIds", "1"); fd.append("procesoIds", "2"); fd.set("verHistorial", "on");
  const d: DatosUsuarioFormulario = parsearFormulario(fd, EsquemaUsuario);
  expect(d).toEqual({
    usuario: "ana.p", nombre: "Ana Pérez", correo: null, rol: "lider_proceso",
    cargoId: null, jefeInmediatoId: 4, procesoIds: [1, 2], verHistorial: true,
  });
  const uno = new FormData();
  uno.set("usuario", "luis"); uno.set("nombre", "Luis Gómez"); uno.set("rol", "consulta"); uno.set("procesoIds", "3");
  expect(parsearFormulario(uno, EsquemaUsuario)).toMatchObject({ procesoIds: [3], verHistorial: false, correo: null });
});

it("EsquemaUsuario acepta objetos ya tipados (lote)", () => {
  const d = EsquemaUsuario.parse({ usuario: "ana.p", nombre: "Ana Pérez", correo: null, rol: "consulta", cargoId: null, jefeInmediatoId: null, procesoIds: [], verHistorial: false });
  expect(d.correo).toBeNull();
});
