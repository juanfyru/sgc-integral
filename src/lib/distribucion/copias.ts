import { VENTANA_IMPRESION_MS, type EstadoCopia } from "./tipos";

const ARISTAS: Record<EstadoCopia, readonly EstadoCopia[]> = {
  emitida: ["recibida", "anulada", "por_recoger"],
  recibida: ["anulada", "por_recoger"],
  por_recoger: ["recogida"],
  recogida: [],
  anulada: [],
};

export function puedePasar(de: EstadoCopia, a: EstadoCopia): boolean {
  return ARISTAS[de].includes(a);
}

export function numeroDeCopia(n: number): string {
  return String(n).padStart(2, "0");
}

function fechaCorta(fecha: Date, zona: string): string {
  const partes = new Intl.DateTimeFormat("es-CO", {
    timeZone: zona,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(fecha);
  const de = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${de("day")}/${de("month")}/${de("year")}`;
}

export function textoSello(d: {
  numero: number;
  codigo: string;
  version: number;
  punto: string;
  responsable: string;
  cargo: string | null;
  emitidaEn: Date;
  zona: string;
}): { titulo: string; detalle: string } {
  const entregada = d.cargo ? `${d.responsable}, ${d.cargo}` : d.responsable;
  return {
    titulo: `COPIA CONTROLADA N.º ${numeroDeCopia(d.numero)}`,
    detalle: `${d.codigo} v${d.version} · ${d.punto} · Entregada a ${entregada} · ${fechaCorta(d.emitidaEn, d.zona)}`,
  };
}

export function urlDeQr(urlPublica: string | null, codigo: string, version: number): string | null {
  if (!urlPublica) return null;
  return `${urlPublica.replace(/\/+$/, "")}/documentos/${encodeURIComponent(codigo)}?v=${version}`;
}

export function enVentanaDeImpresion(abiertaEn: Date | null, ahora: Date): boolean {
  if (!abiertaEn) return false;
  return ahora.getTime() - abiertaEn.getTime() < VENTANA_IMPRESION_MS;
}
