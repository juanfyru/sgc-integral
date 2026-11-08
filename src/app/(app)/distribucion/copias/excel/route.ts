import { type NextRequest, NextResponse } from "next/server";
import { obtenerSql } from "@/db/cliente";
import { registrarAuditoria } from "@/db/consultas/admin";
import { listarCopias, type FiltroCopias } from "@/db/consultas/distribucion/copias";
import { obtenerMarcaSegura } from "@/db/consultas/entidad";
import { construirExcelCopias } from "@/lib/distribucion/copias-excel";
import { numeroDeCopia } from "@/lib/distribucion/copias";
import { puede } from "@/lib/permisos";
import { sesionDePeticion } from "@/lib/sesion-actual";
import { fechaCompactaLocal, fechaHoraLocal } from "@/lib/zona-horaria";

export const dynamic = "force-dynamic";

const ESTADOS: NonNullable<FiltroCopias["estado"]>[] = ["vivas", "por_recoger", "sin_recibido", "anuladas", "todas"];
const entero = (v: string | null): number | undefined => (v && /^\d{1,15}$/.test(v) ? Number(v) : undefined);

export async function GET(peticion: NextRequest): Promise<Response> {
  const sesion = await sesionDePeticion(peticion);
  if (!sesion) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!puede(sesion, "distribucion.ver")) return NextResponse.json({ error: "Sin permiso" }, { status: 403 });

  const q = peticion.nextUrl.searchParams;
  const ahora = new Date();
  const estado = ESTADOS.find((e) => e === q.get("estado")) ?? "vivas";
  const puntoId = entero(q.get("punto"));
  const documentoId = entero(q.get("documento"));
  const sql = obtenerSql();
  const [copias, marca] = await Promise.all([
    listarCopias(sesion, { estado, puntoId, documentoId }),
    obtenerMarcaSegura(),
  ]);
  const ids = [...new Set(copias.flatMap((c) => (c.reemplazaCopiaId === null ? [] : [c.reemplazaCopiaId])))];
  const reemplazos = new Map<number, string>();
  if (ids.length > 0) {
    const filas = await sql`SELECT cc.id, cc.numero, d.codigo, v.numero AS version
      FROM copias_controladas cc JOIN documento_versiones v ON v.id = cc.version_id JOIN documentos d ON d.id = v.documento_id
      WHERE cc.id = ANY(${ids})`;
    for (const f of filas) reemplazos.set(Number(f.id), `N.º ${numeroDeCopia(Number(f.numero))} de ${f.codigo} v${f.version}`);
  }
  const buffer = await construirExcelCopias(copias, {
    hospital: marca.nombre,
    generadoEn: fechaHoraLocal(ahora),
    filtro: `Estado: ${estado}`,
    total: copias.length,
    reemplazos,
  });

  await registrarAuditoria(sql, {
    usuarioId: sesion.usuarioId,
    accion: "exporto_copias",
    entidad: "copias",
    entidadId: null,
    detalle: { formato: "excel", estado, puntoId: puntoId ?? null, documentoId: documentoId ?? null, total: copias.length },
  });

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="copias-${fechaCompactaLocal(ahora)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
