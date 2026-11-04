import { obtenerSql } from "../cliente";

export type Notificacion = {
  id: number;
  tipo: string;
  titulo: string;
  cuerpo: string | null;
  enlace: string | null;
  leidaEn: Date | null;
  creadoEn: Date;
};

type Cliente = ReturnType<typeof obtenerSql>;

export async function crearNotificacion(
  n: {
    usuarioId: number;
    tipo: string;
    titulo: string;
    cuerpo?: string | null;
    enlace?: string | null;
    entidad?: string | null;
    entidadId?: number | null;
  },
  sql: Cliente = obtenerSql(),
): Promise<number> {
  const [fila] = await sql`INSERT INTO notificaciones
      (usuario_id, tipo, titulo, cuerpo, enlace, entidad, entidad_id)
    VALUES (${n.usuarioId}, ${n.tipo}, ${n.titulo}, ${n.cuerpo ?? null},
            ${n.enlace ?? null}, ${n.entidad ?? null}, ${n.entidadId ?? null})
    RETURNING id`;
  return Number(fila.id);
}

export async function contarNoLeidas(usuarioId: number): Promise<number> {
  const [fila] = await obtenerSql()`SELECT count(*)::int AS n FROM notificaciones
    WHERE usuario_id = ${usuarioId} AND leida_en IS NULL`;
  return Number(fila.n);
}

export async function listarRecientes(usuarioId: number, limite = 10): Promise<Notificacion[]> {
  const filas = await obtenerSql()`SELECT id, tipo, titulo, cuerpo, enlace, leida_en, creado_en
    FROM notificaciones WHERE usuario_id = ${usuarioId}
    ORDER BY creado_en DESC, id DESC LIMIT ${limite}`;
  return filas.map((f) => ({
    id: Number(f.id),
    tipo: f.tipo,
    titulo: f.titulo,
    cuerpo: f.cuerpo,
    enlace: f.enlace,
    leidaEn: f.leida_en,
    creadoEn: f.creado_en,
  }));
}

/** Devuelve el enlace si la notificación es del usuario (también si ya estaba leída); null si no. */
export async function marcarLeida(id: number, usuarioId: number): Promise<string | null> {
  const [fila] = await obtenerSql()`UPDATE notificaciones
    SET leida_en = COALESCE(leida_en, now())
    WHERE id = ${id} AND usuario_id = ${usuarioId}
    RETURNING enlace`;
  return fila ? (fila.enlace ?? null) : null;
}

export async function marcarTodasLeidas(usuarioId: number): Promise<number> {
  const r = await obtenerSql()`UPDATE notificaciones SET leida_en = now()
    WHERE usuario_id = ${usuarioId} AND leida_en IS NULL`;
  return r.count;
}
