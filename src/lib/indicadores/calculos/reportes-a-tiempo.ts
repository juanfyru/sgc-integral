// Regla pura de «Reportes de indicadores a tiempo» (anexo 14B, §5.2). Sin Node ni BD.

export type MedicionParaPlazo = { venceEn: Date; primerReporteEn: Date | null };

// A tiempo: el primer reporte (o «no aplica») fue en la fecha límite o antes. Sin reporte, tarde.
export function reportesATiempo(ms: readonly MedicionParaPlazo[]): { aTiempo: number; total: number } {
  let aTiempo = 0;
  for (const m of ms) {
    if (m.primerReporteEn !== null && m.primerReporteEn.getTime() <= m.venceEn.getTime()) aTiempo += 1;
  }
  return { aTiempo, total: ms.length };
}
