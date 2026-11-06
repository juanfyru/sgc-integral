import { expect, it } from "vitest";
import type { z } from "zod";
import { EsquemaArea } from "@/lib/esquemas/estructura";
import { EsquemaIngreso } from "@/lib/esquemas/cuenta";
import {
  EsquemaAceptarCreacion,
  EsquemaConcepto,
  EsquemaControlCambios,
  EsquemaDevolucionAprobacion,
  EsquemaFirma,
  EsquemaMotivoCierre,
  EsquemaObservacion,
  EsquemaReaperturaObservacion,
  EsquemaRespuestaObservacion,
  EsquemaSolicitud,
} from "@/lib/esquemas/tramites";
import { EsquemaUsuario, type DatosUsuarioFormulario } from "@/lib/esquemas/usuarios";
import { ErrorValidacion, parsearFormulario } from "@/lib/validacion";

it("convierte FormData y reporta el primer error en espanol con el campo", () => {
  const fd = new FormData(); fd.set("usuario", " Ana "); fd.set("clave", "x");
  expect(parsearFormulario(fd, EsquemaIngreso)).toEqual({ usuario: "Ana", clave: "x" });
  const malo = new FormData(); malo.set("usuario", "");
  expect(() => parsearFormulario(malo, EsquemaIngreso)).toThrow(ErrorValidacion);
  expect(() => parsearFormulario(malo, EsquemaIngreso)).toThrow(/^usuario: /);
});

it("un mensaje escrito en el esquema va tal cual, sin el nombre del campo", () => {
  const fd = new FormData();
  fd.set("rol", "lider_proceso"); fd.set("usuario", "ana.p"); fd.set("nombre", "Ana Pérez");
  expect(() => parsearFormulario(fd, EsquemaUsuario)).toThrow(/^El líder de proceso debe tener al menos un proceso asignado$/);
});

const formulario = (campos: Record<string, string>) => {
  const fd = new FormData();
  for (const [campo, valor] of Object.entries(campos)) fd.set(campo, valor);
  return fd;
};

const solicitud = { tipo: "crear", motivo: "mejora" };

it.each([
  ["vacía", ""],
  ["de solo espacios", "      "],
  ["corta", "Muy poco"],
])("la justificación %s se rechaza en español natural", (_caso, justificacion) => {
  expect(() => parsearFormulario(formulario({ ...solicitud, justificacion }), EsquemaSolicitud))
    .toThrow(/^La justificación debe tener al menos 10 caracteres$/);
});

it("la justificación demasiado larga dice el máximo", () => {
  expect(() => parsearFormulario(formulario({ ...solicitud, justificacion: "x".repeat(2001) }), EsquemaSolicitud))
    .toThrow(/^La justificación no puede pasar de 2000 caracteres$/);
});

it.each<[string, z.ZodType<unknown>, string]>([
  ["texto", EsquemaObservacion, "La observación"],
  ["respuesta", EsquemaRespuestaObservacion, "La respuesta"],
  ["nota", EsquemaReaperturaObservacion, "La nota de reapertura"],
  ["concepto", EsquemaConcepto, "El concepto"],
  ["resumenCambios", EsquemaControlCambios, "El control de cambios"],
  ["motivo", EsquemaMotivoCierre, "El motivo"],
])("%s: solo espacios o de más, con un mensaje que nombra lo que es", (campo, esquema, nombre) => {
  const maximo = campo === "motivo" ? 1000 : 2000;
  expect(() => parsearFormulario(formulario({ [campo]: "    " }), esquema)).toThrow(new RegExp(`^${nombre} debe tener al menos 5 caracteres$`));
  expect(() => parsearFormulario(formulario({ [campo]: "x".repeat(maximo + 1) }), esquema)).toThrow(new RegExp(`^${nombre} no puede pasar de ${maximo} caracteres$`));
});

it("la firma sin clave y la devolución sin observaciones se dicen en palabras", () => {
  expect(() => parsearFormulario(formulario({}), EsquemaFirma)).toThrow(/^Escriba su clave$/);
  expect(() => parsearFormulario(formulario({}), EsquemaDevolucionAprobacion)).toThrow(/^Escriba al menos una observación$/);
});

it("lo que falta al aceptar un documento nuevo se nombra, sin decir solo «Es obligatorio»", () => {
  const datos = { decision: "nuevo", elaboradorId: "1", revisorId: "2", aprobadorId: "3", venceElaboracion: "2026-11-20" };
  expect(() => parsearFormulario(formulario(datos), EsquemaAceptarCreacion)).toThrow(/^Elija el tipo de documento$/);
  expect(() => parsearFormulario(formulario({ ...datos, tipoDocumentoId: "1" }), EsquemaAceptarCreacion)).toThrow(/^Elija el proceso propietario$/);
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

it("omitir descarta claves de ruta antes del esquema estricto", () => {
  const fd = new FormData(); fd.set("id", "5"); fd.set("nombre", "Urgencias");
  expect(() => parsearFormulario(fd, EsquemaArea)).toThrow(ErrorValidacion);
  expect(parsearFormulario(fd, EsquemaArea, { omitir: ["id"] })).toEqual({ nombre: "Urgencias" });
});
