import { obtenerSql, type Cliente } from "@/db/cliente";
import type { ContextoFirma } from "@/lib/firma";
import type { Firma } from "@/lib/tramites/tipos";

export type FirmaRegistrada = {
  firma: Firma;
  ronda: number;
  usuarioId: number;
  nombre: string;
  cargo: string | null;
  hashSha256: string;
  metodo: string;
  creadoEn: Date;
};

/**
 * Copia a la fila el nombre y el cargo del firmante en este momento: el acta no cambia si
 * después cambian. `ahora` deja a todo lo que escribe una transición con la misma hora.
 */
export async function registrarFirma(
  tx: Cliente,
  f: {
    tramiteId: number;
    versionId: number | null;
    usuarioId: number;
    firma: Firma;
    ronda: number;
    hashSha256: string;
    metodo: "clave" | "clave_totp";
    contexto: ContextoFirma;
    ahora?: Date;
  },
): Promise<number> {
  const [fila] = await tx`INSERT INTO firmas
      (tramite_id, version_id, usuario_id, firma, ronda, hash_sha256,
       nombre_firmante, cargo_firmante, metodo, ip, user_agent, creado_en)
    SELECT ${f.tramiteId}, ${f.versionId}, u.id, ${f.firma}, ${f.ronda}, ${f.hashSha256},
       u.nombre, c.nombre, ${f.metodo}, ${f.contexto.ip}, ${f.contexto.userAgent}, ${f.ahora ?? new Date()}
    FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id
    WHERE u.id = ${f.usuarioId}
    RETURNING id`;
  return Number(fila.id);
}

/** Firmas del trámite por orden de creación. */
export async function listarFirmas(
  tramiteId: number,
  opciones?: { sql?: Cliente },
): Promise<FirmaRegistrada[]> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT firma, ronda, usuario_id, nombre_firmante, cargo_firmante,
      hash_sha256, metodo, creado_en
    FROM firmas WHERE tramite_id = ${tramiteId}
    ORDER BY id`;
  return filas.map((f) => ({
    firma: f.firma as Firma,
    ronda: f.ronda as number,
    usuarioId: Number(f.usuario_id),
    nombre: f.nombre_firmante as string,
    cargo: f.cargo_firmante as string | null,
    hashSha256: f.hash_sha256 as string,
    metodo: f.metodo as string,
    creadoEn: new Date(f.creado_en as string),
  }));
}
