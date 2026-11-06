import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { huellaDeArchivo } from "@/lib/huella";

const previo = process.env.ALMACEN_RUTA;
let almacen: string;

beforeAll(async () => {
  almacen = await mkdtemp(path.join(tmpdir(), "sgc-huella-"));
  process.env.ALMACEN_RUTA = almacen;
});

afterAll(async () => {
  if (previo === undefined) delete process.env.ALMACEN_RUTA;
  else process.env.ALMACEN_RUTA = previo;
  await rm(almacen, { recursive: true, force: true });
});

describe("huellaDeArchivo", () => {
  it("coincide con el SHA-256 de los bytes, también en un archivo de varios trozos", async () => {
    const bytes = Buffer.alloc(3 * 1024 * 1024, "abc");
    await writeFile(path.join(almacen, "grande.bin"), bytes);
    expect(await huellaDeArchivo("grande.bin")).toBe(createHash("sha256").update(bytes).digest("hex"));
  });

  it("lanza si la ruta se sale del almacén", async () => {
    await expect(huellaDeArchivo("../fuera.pdf")).rejects.toThrow();
    await expect(huellaDeArchivo("carpeta/../../fuera.pdf")).rejects.toThrow();
  });

  it("lanza si el archivo no existe", async () => {
    await expect(huellaDeArchivo("no-existe.pdf")).rejects.toThrow();
  });
});
