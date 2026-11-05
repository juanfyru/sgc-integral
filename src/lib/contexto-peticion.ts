import { headers } from "next/headers";
import { ipDePeticion } from "@/lib/ip";

/** IP y agente de usuario de la petición en curso, para `accesos` y `firmas`. */
export async function contextoDePeticion() {
  const cabeceras = await headers();
  return { ip: ipDePeticion(cabeceras), userAgent: cabeceras.get("user-agent") };
}
