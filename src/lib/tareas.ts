import type { SesionValida } from "./sesion";

export type Tarea = {
  id: string; // "<fuente>:<id>", estable
  modulo: "documentos" | "indicadores" | "planes";
  titulo: string; // "Aprobar GTH-PR-12 v3"
  detalle: string | null; // "Inducción y reinducción"
  vence: Date | null;
  enlace: string; // ruta interna
};

export async function misTareas(
  sesion: Pick<SesionValida, "usuarioId" | "rol">,
): Promise<Tarea[]> {
  void sesion;
  // La Fase 13 añade las fuentes (flujo documental, indicadores, planes).
  return [];
}
