import { type NextRequest, NextResponse } from "next/server";
import { autorizarSubida, ROLES_POR_DESTINO, type DestinoDeMejora } from "@/db/consultas/mejoramiento/archivos";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { puede, type Permiso } from "@/lib/permisos";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import { sesionDePeticion } from "@/lib/sesion-actual";

// 30 subidas por minuto y usuario, entre las cuatro rutas del módulo (instancia única, en memoria).
const permitirSubida = crearLimitador({ limite: 30, ventanaMs: 60_000 });

const CARPETAS = {
  mejora_hallazgo: "hallazgos",
  mejora_ronda: "rondas",
  mejora_actividad: "actividades",
  mejora_reporte: "reportes",
} as const;

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

/**
 * Lo común de las cuatro subidas de mejoramiento (spec 15 §12.2), en el orden de las demás: sesión 401, permiso de la
 * matriz 403, origen 403, límite 429, identificador 404, `autorizarSubida` (404, 403 o 409) y `recibirArchivo`. El permiso
 * de la matriz solo cierra la puerta a lo que no es del módulo; la regla de quién sube qué es `autorizarSubida`. El rol del
 * archivo viaja en `?rol=` y se valida contra la lista del destino (el hallazgo, por omisión `evidencia`; la ronda lo
 * exige). Va fuera del `matcher` del proxy: este handler exige la sesión.
 */
export async function subirAMejora(
  peticion: NextRequest,
  contexto: DestinoDeMejora["contexto"],
  permiso: Permiso,
  idCrudo: string,
): Promise<NextResponse> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return error(401, "No autorizado");
  if (!puede(sesion, permiso)) return error(403, "Sin permiso");
  if (!origenValido(peticion.headers)) return error(403, "Origen no permitido");
  if (!permitirSubida(String(sesion.usuarioId))) return error(429, "Demasiadas subidas seguidas. Espere un minuto.");
  if (!/^\d{1,15}$/.test(idCrudo)) return error(404, "No existe a qué adjuntar el archivo");
  const id = Number(idCrudo);

  let destino: DestinoDeMejora;
  if (contexto === "mejora_hallazgo" || contexto === "mejora_ronda") {
    const roles: readonly string[] = ROLES_POR_DESTINO[contexto];
    const pedido = peticion.nextUrl.searchParams.get("rol") ?? (contexto === "mejora_hallazgo" ? "evidencia" : "");
    if (!roles.includes(pedido)) return error(400, "El rol del archivo no es válido");
    destino = { contexto, id, rol: pedido } as DestinoDeMejora;
  } else {
    destino = { contexto, id };
  }

  const permitido = await autorizarSubida(sesion, destino);
  if (!permitido.ok) return error(permitido.estado, permitido.error);
  return recibirArchivo(
    peticion,
    {
      contexto,
      contextoId: id,
      carpeta: `mejoramiento/${CARPETAS[contexto]}/${id}`,
      ...("rol" in destino ? { rol: destino.rol } : {}),
    },
    sesion.usuarioId,
  );
}
