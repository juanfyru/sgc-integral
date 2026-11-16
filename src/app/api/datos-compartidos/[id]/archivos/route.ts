import { type NextRequest, NextResponse } from "next/server";
import { PERIODO_NO_EXISTE } from "@/db/consultas/indicadores/datos-periodos";
import {
  autorizarSoporteDeDato,
  CERRADO_SIN_SOPORTES,
  quitarSoporteDeDato,
  SOPORTE_NO_EXISTE,
} from "@/db/consultas/indicadores/datos-soporte";
import { ErrorIndicador } from "@/lib/indicadores/tipos";
import { crearLimitador } from "@/lib/limite";
import { origenValido } from "@/lib/origen";
import { ErrorPermiso, puede } from "@/lib/permisos";
import { recibirArchivo } from "@/lib/recepcion-archivo";
import type { SesionValida } from "@/lib/sesion";
import { sesionDePeticion } from "@/lib/sesion-actual";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 30 subidas o quitadas por minuto y usuario (instancia única, en memoria): reemplazar un soporte es quitarlo y subir otro.
const permitirCambio = crearLimitador({ limite: 30, ventanaMs: 60_000 });

const ID = /^\d{1,15}$/;

function error(estado: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

type Autorizacion = { sesion: SesionValida; periodoId: number } | { respuesta: NextResponse };

/** Lo que comparten la subida y la quitada antes de tocar nada: la sesión, el permiso, el `Origin`, el ritmo y el periodo. */
async function autorizar(peticion: NextRequest, { params }: Params): Promise<Autorizacion> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return { respuesta: error(401, "No autorizado") };
  if (!puede(sesion, "indicadores.medir")) return { respuesta: error(403, "Sin permiso") };
  if (!origenValido(peticion.headers)) return { respuesta: error(403, "Origen no permitido") };
  if (!permitirCambio(String(sesion.usuarioId))) return { respuesta: error(429, "Demasiados cambios seguidos. Espere un minuto.") };

  const { id } = await params;
  if (!ID.test(id)) return { respuesta: error(404, PERIODO_NO_EXISTE) };
  const permiso = await autorizarSoporteDeDato(Number(id), sesion);
  if (!permiso.ok) {
    if (permiso.estado === 409) return { respuesta: error(409, CERRADO_SIN_SOPORTES) };
    return { respuesta: permiso.estado === 403 ? error(403, "Sin permiso") : error(404, PERIODO_NO_EXISTE) };
  }
  return { sesion, periodoId: Number(id) };
}

/**
 * Adjunta un soporte a un periodo de un dato compartido (anexo 14C, §4.6; `id` es el periodo): PDF, imagen o Excel `.xlsx`
 * por sus bytes (nunca `.xls`), en `datos-compartidos/<id>` del almacén. Lo sube quien puede reportar el dato, mientras el
 * periodo no esté cerrado; quien no ve el dato recibe 404. Va fuera del `matcher` del proxy (el búfer truncaba las subidas
 * grandes): este handler exige la sesión.
 */
export async function POST(peticion: NextRequest, contexto: Params) {
  const r = await autorizar(peticion, contexto);
  if ("respuesta" in r) return r.respuesta;
  return recibirArchivo(
    peticion,
    { contexto: "dato_compartido", contextoId: r.periodoId, carpeta: `datos-compartidos/${r.periodoId}` },
    r.sesion.usuarioId,
  );
}

/** Quita el soporte `?archivo=<id>` del periodo, con las mismas condiciones de la subida; solo un soporte de ese periodo. */
export async function DELETE(peticion: NextRequest, contexto: Params) {
  const r = await autorizar(peticion, contexto);
  if ("respuesta" in r) return r.respuesta;
  const archivo = peticion.nextUrl.searchParams.get("archivo") ?? "";
  if (!ID.test(archivo)) return error(404, SOPORTE_NO_EXISTE);
  try {
    await quitarSoporteDeDato(r.sesion, { periodoId: r.periodoId, archivoId: Number(archivo) });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ErrorPermiso) return error(403, "Sin permiso");
    if (err instanceof ErrorIndicador) {
      return err.message === SOPORTE_NO_EXISTE || err.message === PERIODO_NO_EXISTE ? error(404, err.message) : error(409, err.message);
    }
    console.error("Fallo al quitar el soporte de un dato compartido:", err);
    return error(500, "No se pudo quitar el soporte");
  }
}
