import { NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";

export const dynamic = "force-dynamic";

// Ruta pública (healthcheck del compose): solo dice si la app llega a la BD.
// La versión de PostgreSQL y los errores del driver van al log, nunca a la respuesta.
let versionRegistrada = false;

export async function GET() {
  try {
    const [fila] = await obtenerSql()`SELECT version() AS version`;
    if (!versionRegistrada) {
      console.log(`[salud] Base de datos conectada: ${(fila.version as string).split(" on ")[0]}`);
      versionRegistrada = true;
    }
    return NextResponse.json({ estado: "ok" });
  } catch (error) {
    console.error(`[salud] Sin conexión con la base de datos: ${error instanceof Error ? error.message : "error desconocido"}`);
    return NextResponse.json({ estado: "error" }, { status: 503 });
  }
}
