import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { resolverRutaAlmacen } from "@/lib/almacen";

/** SHA-256 en hexadecimal de un archivo del almacén, leído por trozos para no cargarlo en memoria. */
export async function huellaDeArchivo(rutaRelativa: string): Promise<string> {
  const ruta = resolverRutaAlmacen(rutaRelativa);
  if (!ruta) throw new Error("La ruta no está dentro del almacén");
  const hash = createHash("sha256");
  for await (const trozo of createReadStream(ruta)) hash.update(trozo as Buffer);
  return hash.digest("hex");
}
