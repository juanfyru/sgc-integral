import { type NextRequest, NextResponse } from "next/server";
import { obtenerConfigDocumental } from "@/db/consultas/config-documental";
import { obtenerMarca } from "@/db/consultas/entidad";
import { membreteListo } from "@/db/consultas/formato-acta";
import { generarActa, type DatosActa } from "@/lib/acta";
import { crearLimitador } from "@/lib/limite";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { ETIQUETA_FIRMA } from "@/lib/tramites/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

// El mismo tope de la ruta del acta.
const permitirEjemplo = crearLimitador({ limite: 60, ventanaMs: 60_000 });

const HUELLA_FICTICIA = "0".repeat(64);
const firma = (etiqueta: string, nombre: string, fecha: string): DatosActa["firmas"][number] => ({
  firma: etiqueta, nombre, cargo: "Cargo de ejemplo", fecha: new Date(fecha), huella: HUELLA_FICTICIA,
});

/** Un acta inventada, con texto para dos páginas y el bloque de criterios. Nada de esto es un registro. */
const EJEMPLO: Omit<DatosActa, "entidad" | "zona" | "formato"> = {
  clase: "aprobacion",
  ejemplo: true,
  documento: { codigo: "XXX-PR-01", titulo: "Procedimiento de ejemplo", tipo: "Procedimiento", proceso: "Proceso de ejemplo" },
  version: 2,
  solicitud: {
    numero: "SOL-0000-000",
    tipo: "Modificar",
    motivo: "Mejora del proceso",
    justificacion:
      "Texto de ejemplo. Aquí va la justificación que escribió quien pidió el cambio: qué se busca mejorar, a quién afecta y por qué conviene hacerlo ahora. Sirve para comprobar que el texto respeta el espacio del encabezado y el del pie, también cuando un párrafo ocupa varias líneas.",
    solicitante: "Persona solicitante de ejemplo",
    fecha: new Date("2026-01-12T14:00:00Z"),
  },
  vistoBueno: "Dado por Persona líder de ejemplo, 12/01/2026 09:30",
  aceptacion: { quien: "Persona coordinadora de ejemplo", fecha: new Date("2026-01-13T14:00:00Z"), duplicidad: null },
  controlCambios:
    "Texto de ejemplo. Aquí va el control de cambios de la versión: las secciones que cambiaron, lo que se añadió y lo que se quitó. Cuando el resumen es largo, sigue en varias líneas y, si hace falta, en la hoja siguiente, siempre dentro del espacio que deja el formato.",
  firmas: [
    firma(ETIQUETA_FIRMA.elaboro, "Persona elaboradora de ejemplo", "2026-01-14T15:00:00Z"),
    firma(ETIQUETA_FIRMA.reviso, "Persona revisora de ejemplo", "2026-01-15T15:00:00Z"),
    firma(ETIQUETA_FIRMA.aprobo, "Persona aprobadora de ejemplo", "2026-01-16T15:00:00Z"),
    firma(ETIQUETA_FIRMA.publico, "Persona coordinadora de ejemplo", "2026-01-16T15:30:00Z"),
  ],
  noCumple: [
    {
      texto: "Primer criterio de ejemplo que no cumple",
      nota: "Texto de ejemplo. Aquí va la nota de quien dio el concepto favorable a pesar de este criterio, y cómo se resolverá.",
    },
    {
      texto: "Segundo criterio de ejemplo que no cumple",
      nota: "Texto de ejemplo. Las notas de los criterios salen en el acta tal como se escribieron, y siguen en otra hoja si no caben en esta.",
    },
  ],
  rondas: 2,
  observaciones: { total: 3, cerradas: 3 },
  versionObsoleta: 1,
  publicadoEn: new Date("2026-01-16T15:30:00Z"),
};

/**
 * El acta tal como saldría con el formato y los espacios **guardados**: primero se guarda, después se
 * mira (spec de las adiciones, §4.5). Sin un formato listo, sale con el diseño básico. Solo lee: no se
 * guarda ni se audita.
 */
export async function GET(peticion: NextRequest) {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "tramites.gestionar")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  if (!permitirEjemplo(String(sesion.usuarioId))) {
    return NextResponse.json(
      { error: "Demasiadas peticiones, intente de nuevo en un momento" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const [{ formatoActa }, marca] = await Promise.all([obtenerConfigDocumental(), obtenerMarca()]);
  const membrete = await membreteListo(formatoActa.documentoId);
  const datos: DatosActa = {
    ...EJEMPLO,
    entidad: marca.nombre,
    zona: zonaHoraria(),
    formato: membrete && {
      archivoId: membrete.archivoId,
      hash: membrete.hash,
      codigo: membrete.codigo,
      version: membrete.version,
      margenSuperiorCm: formatoActa.margenSuperiorCm,
      margenInferiorCm: formatoActa.margenInferiorCm,
    },
  };
  const pdf = await generarActa(datos, membrete?.bytes);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": 'inline; filename="Acta de ejemplo.pdf"',
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    },
  });
}
