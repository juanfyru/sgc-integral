import { obtenerSql, type Cliente } from "@/db/cliente";

export type ConfigDocumental = {
  formatoCodigo: string | null;
  plazos: {
    visto_bueno: number;
    aceptacion: number;
    elaboracion: number;
    ajustes: number;
    revision: number;
    aprobacion: number;
    publicacion: number;
  };
  escalamientoDias: number;
  publicacionDirecta: boolean;
};

export const CONFIG_DOCUMENTAL_DEFECTO: ConfigDocumental = {
  formatoCodigo: null,
  plazos: { visto_bueno: 3, aceptacion: 3, elaboracion: 15, ajustes: 5, revision: 5, aprobacion: 5, publicacion: 2 },
  escalamientoDias: 3,
  publicacionDirecta: true,
};

const CLAVES = [
  "formato_codigo",
  "plazo_visto_bueno_dias",
  "plazo_aceptacion_dias",
  "plazo_elaboracion_dias",
  "plazo_ajustes_dias",
  "plazo_revision_dias",
  "plazo_aprobacion_dias",
  "plazo_publicacion_dias",
  "escalamiento_dias",
  "publicacion_directa",
];

function dias(valor: string | undefined, defecto: number): number {
  const limpio = valor?.trim() ?? "";
  if (!/^\d{1,3}$/.test(limpio)) return defecto;
  const n = Number(limpio);
  return n <= 365 ? n : defecto;
}

export async function obtenerConfigDocumental(opciones?: { sql?: Cliente }): Promise<ConfigDocumental> {
  const sql = opciones?.sql ?? obtenerSql();
  const filas = await sql`SELECT clave, valor FROM configuracion WHERE clave = ANY(${CLAVES})`;
  const valores = new Map(filas.map((f) => [f.clave as string, f.valor as string]));
  const plazo = (nombre: keyof ConfigDocumental["plazos"]) =>
    dias(valores.get(`plazo_${nombre}_dias`), CONFIG_DOCUMENTAL_DEFECTO.plazos[nombre]);
  const directa = valores.get("publicacion_directa")?.trim();

  return {
    formatoCodigo: valores.get("formato_codigo")?.trim() || null,
    plazos: {
      visto_bueno: plazo("visto_bueno"),
      aceptacion: plazo("aceptacion"),
      elaboracion: plazo("elaboracion"),
      ajustes: plazo("ajustes"),
      revision: plazo("revision"),
      aprobacion: plazo("aprobacion"),
      publicacion: plazo("publicacion"),
    },
    escalamientoDias: dias(valores.get("escalamiento_dias"), CONFIG_DOCUMENTAL_DEFECTO.escalamientoDias),
    publicacionDirecta:
      directa === "0" ? false : directa === "1" ? true : CONFIG_DOCUMENTAL_DEFECTO.publicacionDirecta,
  };
}
