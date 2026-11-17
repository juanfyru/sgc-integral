import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { parecidosDelProceso } from "@/db/consultas/mejoramiento/parecidos";
import { alcanceProcesos, enAlcance } from "@/lib/alcance";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

/** Menos que esto no es un texto con qué comparar (el formulario tampoco lo pide). */
const MINIMO = 15;
const MAXIMO = 4200;

/**
 * Los hallazgos del mismo proceso que se parecen a lo que se está escribiendo (spec 15 §7.5). Quien no puede registrar en
 * ese proceso recibe 404, como si el proceso no existiera: ni dice cuántos hallazgos tiene.
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const proceso = peticion.nextUrl.searchParams.get("proceso") ?? "";
  const texto = (peticion.nextUrl.searchParams.get("q") ?? "").trim().slice(0, MAXIMO);
  const noExiste = () => NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!puede(sesion, "mejora.registrar") || !/^\d{1,15}$/.test(proceso)) return noExiste();
  const procesoId = Number(proceso);
  if (!Number.isSafeInteger(procesoId) || !enAlcance(await alcanceProcesos(sesion), procesoId)) return noExiste();
  if (texto.length < MINIMO) return NextResponse.json({ parecidos: [] }, { headers: { "Cache-Control": "no-store" } });
  const parecidos = await parecidosDelProceso(obtenerSql(), { procesoId, texto });
  return NextResponse.json(
    { parecidos: parecidos.map((p) => ({ ...p, cuando: p.cuando.toISOString() })) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
