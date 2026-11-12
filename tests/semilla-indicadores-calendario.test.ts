/**
 * El calendario y la agenda de la semilla de indicadores (spec 14 §22), sin base: para varios días de siembra, los
 * trimestres, los meses y el mes del cierre; ningún paso en el futuro; y lo que queda de cada periodo que terminó. Lo que
 * pasó su plazo de reporte queda reportado, registrado, «no aplica» o cerrado; solo urgencias deja a propósito un mes
 * vencido (`meses[2]`) y uno sin dato (`meses[4]`); lo que sigue en plazo queda por reportar, sin vencer.
 */
import { describe, expect, it } from "vitest";
import { agendaDeIndicadores, calendarioDeIndicadores } from "@/db/semillas/indicadores-demo-agenda";
import { PLAZO_DE_REPORTE } from "@/db/semillas/indicadores-demo-fichas";
import { periodoDe } from "@/lib/indicadores-documentales/periodo";
import { fechaLimiteDeReporte, periodosTerminados } from "@/lib/indicadores/periodos";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

const zona = zonaHoraria();

type Caso = { dia: string; trimestres: string[]; siguiente: string; semestre: string; anio: string; meses: string[] };

/** A las 10:00 de Bogotá de cada día; `meses` va de `meses[0]` a `meses[6]`. */
const CASOS: Caso[] = [
  {
    dia: "2026-11-12",
    trimestres: ["2026-T1", "2026-T2", "2026-T3"],
    siguiente: "2026-T4",
    semestre: "2026-S1",
    anio: "2025",
    meses: ["2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06", "2026-05"],
  },
  {
    dia: "2026-12-15",
    trimestres: ["2026-T1", "2026-T2", "2026-T3"],
    siguiente: "2026-T4",
    semestre: "2026-S1",
    anio: "2025",
    meses: ["2026-12", "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06"],
  },
  {
    dia: "2027-01-05",
    trimestres: ["2026-T1", "2026-T2", "2026-T3"],
    siguiente: "2026-T4",
    semestre: "2026-S1",
    anio: "2025",
    meses: ["2026-12", "2026-11", "2026-10", "2026-09", "2026-08", "2026-07", "2026-06"],
  },
  {
    dia: "2027-01-15",
    trimestres: ["2026-T2", "2026-T3", "2026-T4"],
    siguiente: "2027-T1",
    semestre: "2026-S1",
    anio: "2025",
    meses: ["2027-01", "2026-12", "2026-11", "2026-10", "2026-09", "2026-08", "2026-07"],
  },
  {
    dia: "2027-03-01",
    trimestres: ["2026-T2", "2026-T3", "2026-T4"],
    siguiente: "2027-T1",
    semestre: "2026-S1",
    anio: "2025",
    meses: ["2027-02", "2027-01", "2026-12", "2026-11", "2026-10", "2026-09", "2026-08"],
  },
  {
    dia: "2027-07-15",
    trimestres: ["2026-T4", "2027-T1", "2027-T2"],
    siguiente: "2027-T3",
    semestre: "2026-S2",
    anio: "2026",
    meses: ["2027-07", "2027-06", "2027-05", "2027-04", "2027-03", "2027-02", "2027-01"],
  },
];

const sembradoEl = (dia: string) => new Date(`${dia}T15:00:00Z`);

type Ficha = { periodicidad: Periodicidad; inicio: string; aprobada: Date | null; retirada: boolean; conDato: Set<string> };

/**
 * Lo que la agenda deja de cada periodo terminado de cada indicador aprobado y no retirado (al retirar se quitan sus
 * mediciones vacías): `vencidas` (sin dato, abiertas y con el plazo pasado), `sinDato` (las cerró el cierre del mes sin
 * dato), `porReportar` (sin dato y en plazo) e `historicosSinRegistrar`.
 */
function loQueQueda(ahora: Date) {
  const fichas = new Map<string, Ficha>();
  let cierre: { mes: string; momento: Date } | null = null;
  for (const { momento, hecho } of agendaDeIndicadores(ahora, zona)) {
    const ficha = (codigo: string) => fichas.get(codigo)!;
    if (hecho.tipo === "crear") {
      fichas.set(hecho.ficha.codigo, { periodicidad: hecho.ficha.periodicidad, inicio: hecho.inicio, aprobada: null, retirada: false, conDato: new Set() });
    } else if (hecho.tipo === "aprobar") {
      for (const codigo of hecho.codigos) ficha(codigo).aprobada ??= momento;
    } else if (hecho.tipo === "historicos") {
      for (const [clave] of hecho.filas) ficha(hecho.codigo).conDato.add(clave);
    } else if (hecho.tipo === "reportar" || hecho.tipo === "noAplica") {
      ficha(hecho.codigo).conDato.add(hecho.periodo);
    } else if (hecho.tipo === "retirar") {
      ficha(hecho.codigo).retirada = true;
    } else if (hecho.tipo === "cerrarMes") {
      cierre = { mes: hecho.mes, momento };
    }
  }
  const salida = { vencidas: [] as string[][], sinDato: [] as string[][], porReportar: [] as string[][], historicosSinRegistrar: [] as string[][] };
  for (const [codigo, f] of fichas) {
    if (!f.aprobada || f.retirada) continue;
    for (const p of periodosTerminados(f.periodicidad, f.inicio, ahora, zona)) {
      if (f.conDato.has(p.clave)) continue;
      if (p.hasta.getTime() < f.aprobada.getTime()) {
        salida.historicosSinRegistrar.push([codigo, p.clave]);
        continue;
      }
      const vence = fechaLimiteDeReporte(p, PLAZO_DE_REPORTE, zona);
      if (vence.getTime() >= ahora.getTime()) {
        salida.porReportar.push([codigo, p.clave]);
        continue;
      }
      const c = cierre as { mes: string; momento: Date } | null;
      const cerrada = c !== null && p.hasta.getTime() <= periodoDe(c.mes, zona)!.hasta.getTime() && vence.getTime() < c.momento.getTime();
      (cerrada ? salida.sinDato : salida.vencidas).push([codigo, p.clave]);
    }
  }
  return salida;
}

describe("el calendario de la semilla de indicadores", () => {
  it.each(CASOS)("sembrando el $dia", (caso) => {
    const ahora = sembradoEl(caso.dia);
    const cal = calendarioDeIndicadores(ahora, zona);
    expect(cal.trimestres.map((t) => t.clave)).toEqual(caso.trimestres);
    expect(cal.trimestreSiguiente.clave).toBe(caso.siguiente);
    expect([cal.semestreHistorico.clave, cal.anioHistorico.clave]).toEqual([caso.semestre, caso.anio]);
    expect(cal.meses.map((m) => m.clave)).toEqual(caso.meses);

    const agenda = agendaDeIndicadores(ahora, zona);
    // Todo ocurrió antes de la siembra, en orden; el cierre es el de `meses[3]`.
    expect(agenda.every((p) => p.momento.getTime() < ahora.getTime())).toBe(true);
    expect(agenda.every((p, i) => i === 0 || agenda[i - 1].momento.getTime() <= p.momento.getTime())).toBe(true);
    expect(agenda.filter((p) => p.hecho.tipo === "cerrarMes").map((p) => (p.hecho as { mes: string }).mes)).toEqual([caso.meses[3]]);

    const queda = loQueQueda(ahora);
    expect(queda.vencidas).toEqual([["AIN-IND-01", caso.meses[2]]]);
    expect(queda.sinDato).toEqual([["AIN-IND-01", caso.meses[4]]]);
    expect(queda.historicosSinRegistrar).toEqual([]);
  });

  it("lo que terminó hace menos que su plazo queda por reportar, sin vencer", () => {
    // El 12 de noviembre de 2026 no hay nada en plazo: octubre terminó hace 12 días y el tercer trimestre hace 43.
    expect(loQueQueda(sembradoEl("2026-11-12")).porReportar).toEqual([]);
    // El 5 de enero de 2027, el cuarto trimestre, el segundo semestre, el año 2026 y diciembre siguen en plazo.
    const enero = loQueQueda(sembradoEl("2027-01-05")).porReportar;
    for (const esperado of [["SGC-IND-01", "2026-T4"], ["SGC-IND-03", "2026-S2"], ["SGC-IND-04", "2026"], ["AIN-IND-01", "2026-12"], ["CEX-IND-01", "2026-12"]]) {
      expect(enero).toContainEqual(esperado);
    }
  });
});
