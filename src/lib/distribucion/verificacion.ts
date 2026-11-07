import { numeroDeCopia } from "./copias";
import type { RespuestaItem } from "./tipos";

export const ITEMS_FIJOS = [
  "Sin documentos obsoletos a la vista",
  "Sin copias no controladas (impresiones sin sello)",
  "El personal sabe consultar la plataforma",
] as const;

export type CopiaParaLista = {
  id: number;
  codigo: string;
  version: number;
  numero: number;
  estado: "emitida" | "recibida" | "por_recoger";
};

export type FilaListaChequeo = {
  origen: "copia" | "copia_por_recoger" | "fijo";
  copiaId: number | null;
  texto: string;
};

export function armarListaDeChequeo(copias: CopiaParaLista[]): FilaListaChequeo[] {
  const orden = (a: CopiaParaLista, b: CopiaParaLista) =>
    a.codigo.localeCompare(b.codigo) || a.version - b.version || a.numero - b.numero;
  const ordenadas = [...copias].sort(orden);
  const vivas = ordenadas.filter((c) => c.estado !== "por_recoger");
  const porRecoger = ordenadas.filter((c) => c.estado === "por_recoger");
  const nombre = (c: CopiaParaLista) => `${c.codigo} v${c.version} · Copia N.º ${numeroDeCopia(c.numero)}`;
  const filas: FilaListaChequeo[] = [];
  for (const c of vivas) {
    for (const pregunta of ["está", "legible", "es la versión vigente"]) {
      filas.push({ origen: "copia", copiaId: c.id, texto: `${nombre(c)}: ${pregunta}` });
    }
  }
  for (const c of porRecoger) {
    filas.push({ origen: "copia_por_recoger", copiaId: c.id, texto: `${nombre(c)} (obsoleta): ya no está` });
  }
  for (const texto of ITEMS_FIJOS) filas.push({ origen: "fijo", copiaId: null, texto });
  return filas;
}

export function esConforme(items: { respuesta: RespuestaItem | null }[]): boolean {
  return items.every((i) => i.respuesta !== "no_conforme");
}

export function conformidad(
  puntos: { conforme: boolean }[],
  umbral: number,
): { porcentaje: number | null; cumple: boolean | null } {
  if (puntos.length === 0) return { porcentaje: null, cumple: null };
  const exacto = (puntos.filter((p) => p.conforme).length / puntos.length) * 100;
  return { porcentaje: Math.round(exacto), cumple: exacto >= umbral };
}

export function verificacionVencida(ultimaCerrada: Date | null, cadaDias: number, ahora: Date): boolean {
  if (!ultimaCerrada) return true;
  return ahora.getTime() - ultimaCerrada.getTime() >= cadaDias * 86_400_000;
}
