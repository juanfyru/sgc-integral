import { NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sql = obtenerSql();
    const [fila] = await sql`SELECT version() AS version, now() AS ahora`;
    return NextResponse.json({
      estado: "ok",
      baseDeDatos: "conectada",
      postgres: (fila.version as string).split(" on ")[0],
      hora: fila.ahora,
    });
  } catch (error) {
    return NextResponse.json(
      {
        estado: "error",
        baseDeDatos: "sin conexión",
        detalle: error instanceof Error ? error.message : "error desconocido",
      },
      { status: 503 },
    );
  }
}
