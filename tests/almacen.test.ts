/**
 * La app sirve archivos desde FUERA del webroot (regla de negocio 7): la ruta
 * guardada en BD jamás debe poder escapar de la carpeta del almacén.
 * Estos tests no requieren BD.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolverRutaAlmacen, rutaBaseAlmacen } from "@/lib/almacen";

describe("resolverRutaAlmacen — anti path traversal", () => {
  it("resuelve una ruta válida dentro del almacén", () => {
    const resuelta = resolverRutaAlmacen("MN-CAL-001/v1/mn-cal-001-v1.pdf");
    expect(resuelta).not.toBeNull();
    expect(resuelta).toBe(
      path.join(rutaBaseAlmacen(), "MN-CAL-001", "v1", "mn-cal-001-v1.pdf"),
    );
  });

  it("rechaza el ascenso con .. al inicio", () => {
    expect(resolverRutaAlmacen("../secreto.txt")).toBeNull();
  });

  it("rechaza el ascenso con .. en el medio", () => {
    expect(resolverRutaAlmacen("MN-CAL-001/../../../etc/passwd")).toBeNull();
  });

  it("rechaza rutas absolutas POSIX", () => {
    expect(resolverRutaAlmacen("/etc/passwd")).toBeNull();
  });

  it("rechaza rutas absolutas de Windows", () => {
    expect(resolverRutaAlmacen("C:\\Windows\\system32\\cmd.exe")).toBeNull();
    expect(resolverRutaAlmacen("C:/Windows/system32/cmd.exe")).toBeNull();
  });

  it("rechaza separadores backslash (las rutas del almacén usan /)", () => {
    expect(resolverRutaAlmacen("MN-CAL-001\\v1\\archivo.pdf")).toBeNull();
  });

  it("rechaza segmentos . y vacíos", () => {
    expect(resolverRutaAlmacen("MN-CAL-001/./archivo.pdf")).toBeNull();
    expect(resolverRutaAlmacen("MN-CAL-001//archivo.pdf")).toBeNull();
  });

  it("rechaza bytes nulos y caracteres de control", () => {
    expect(resolverRutaAlmacen("archivo\0.pdf")).toBeNull();
    expect(resolverRutaAlmacen("archivo\n.pdf")).toBeNull();
  });

  it("rechaza la cadena vacía", () => {
    expect(resolverRutaAlmacen("")).toBeNull();
  });

  it("rechaza codificaciones URL de .. sin decodificar dobles", () => {
    // La ruta viene de la BD, no de la URL, pero un admin comprometido no
    // debe poder guardar una ruta que escape al decodificarse.
    expect(resolverRutaAlmacen("%2e%2e/secreto")).toBeNull();
  });
});
