import { obtenerSql } from "@/db/cliente";

export type EventoConsulta = {
  tipo: "vista" | "descarga";
  documentoId: number;
  versionId?: number;
  ip: string | null;
  userAgent: string | null;
};

/**
 * Trazabilidad de consulta pública sin login (D8): quién (IP + user-agent),
 * qué y cuándo. Nunca debe tumbar la respuesta al usuario: el que llama
 * decide si espera o ignora el error.
 */
export async function registrarEventoConsulta(evento: EventoConsulta) {
  const sql = obtenerSql();
  await sql`
    INSERT INTO eventos_consulta (tipo, documento_id, version_id, ip, user_agent)
    VALUES (${evento.tipo}, ${evento.documentoId}, ${evento.versionId ?? null},
            ${evento.ip}, ${evento.userAgent})`;
}

// Reexportada hasta la Tarea 8; la lógica vive en @/lib/ip.
export { ipDePeticion } from "@/lib/ip";
