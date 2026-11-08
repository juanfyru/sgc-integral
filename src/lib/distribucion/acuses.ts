export function porcentaje(confirmados: number, pendientes: number): number | null {
  const total = confirmados + pendientes;
  if (total === 0) return null;
  return Math.round((confirmados / total) * 100);
}

export function acusadosPorFirma(firmantes: number[], audiencia: number[]): number[] {
  const enAudiencia = new Set(audiencia);
  return [...new Set(firmantes)].filter((id) => enAudiencia.has(id));
}
