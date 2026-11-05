import { obtenerSql } from "@/db/cliente";
import type { ResultadoAcceso } from "@/db/consultas/autenticacion";

export type FiltrosAccesos = {
  usuario?: string;
  resultado?: ResultadoAcceso;
  desde?: string;
  hasta?: string;
  pagina?: number;
};
export type FilaAcceso = {
  id: number;
  usuarioTexto: string;
  nombre: string | null;
  resultado: ResultadoAcceso;
  ip: string | null;
  userAgent: string | null;
  creadoEn: string;
};
export type RespuestaAccesos = {
  filas: FilaAcceso[];
  total: number;
  pagina: number;
  totalPaginas: number;
};

const TAMANO = 50;
const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export const RESULTADOS_ACCESO: ReadonlyArray<ResultadoAcceso> = [
  "ingreso", "salida", "fallo", "bloqueo",
  "desbloqueo", "restablecimiento", "factor_fallo", "cierre_forzado", "firma_fallo",
];

function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Registro de accesos (inmutable), más reciente primero, 50 por página. */
export async function obtenerAccesos(filtros: FiltrosAccesos): Promise<RespuestaAccesos> {
  const sql = obtenerSql();
  const pagina = Math.max(Math.floor(filtros.pagina ?? 1) || 1, 1);
  const desde = filtros.desde && PATRON_FECHA.test(filtros.desde) ? filtros.desde : null;
  const hasta = filtros.hasta && PATRON_FECHA.test(filtros.hasta) ? filtros.hasta : null;
  const texto = filtros.usuario?.trim();
  const patron = texto ? `%${escaparLike(texto)}%` : null;
  const resultado = filtros.resultado && RESULTADOS_ACCESO.includes(filtros.resultado) ? filtros.resultado : null;

  const cond = sql`
    ${patron ? sql`AND (a.usuario_texto ILIKE ${patron} OR u.nombre ILIKE ${patron})` : sql``}
    ${resultado ? sql`AND a.resultado = ${resultado}` : sql``}
    ${desde ? sql`AND a.creado_en >= ${desde}` : sql``}
    ${hasta ? sql`AND a.creado_en < (${hasta}::date + 1)` : sql``}`;

  const [filas, conteo] = await Promise.all([
    sql`
      SELECT a.id, a.usuario_texto, u.nombre, a.resultado, host(a.ip) AS ip, a.user_agent,
             to_char(a.creado_en, 'YYYY-MM-DD HH24:MI:SS') AS creado_en
      FROM accesos a LEFT JOIN usuarios u ON u.id = a.usuario_id
      WHERE true ${cond}
      ORDER BY a.creado_en DESC, a.id DESC
      LIMIT ${TAMANO} OFFSET ${(pagina - 1) * TAMANO}`,
    sql`SELECT count(*)::int AS total FROM accesos a LEFT JOIN usuarios u ON u.id = a.usuario_id WHERE true ${cond}`,
  ]);

  const total = (conteo[0]?.total as number | undefined) ?? 0;
  return {
    filas: filas.map((f) => ({
      id: Number(f.id),
      usuarioTexto: f.usuario_texto as string,
      nombre: (f.nombre as string | null) ?? null,
      resultado: f.resultado as ResultadoAcceso,
      ip: (f.ip as string | null) ?? null,
      userAgent: (f.user_agent as string | null) ?? null,
      creadoEn: f.creado_en as string,
    })),
    total,
    pagina,
    totalPaginas: Math.max(Math.ceil(total / TAMANO), 1),
  };
}
