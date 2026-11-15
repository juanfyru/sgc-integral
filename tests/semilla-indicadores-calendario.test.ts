/**
 * El calendario y la agenda de la semilla de indicadores (spec 14 §22), sin base: para varios días de siembra, los
 * trimestres, los meses y el mes del cierre; ningún paso en el futuro; y lo que queda de cada periodo que terminó. Lo que
 * pasó su plazo de reporte queda reportado, registrado, «no aplica» o cerrado; solo urgencias deja a propósito un mes
 * vencido (`meses[2]`) y uno sin dato (`meses[4]`); lo que sigue en plazo queda por reportar, sin vencer. Lo que calcula el
 * sistema desde la 14B (anexo §11) no lo reporta nadie: queda aparte (`delSistema`), con sus propias comprobaciones.
 */
import { describe, expect, it } from "vitest";
import { agendaDeIndicadores, calendarioDeIndicadores, constanciasDeLaDemo, type Hecho } from "@/db/semillas/indicadores-demo-agenda";
import { DEL_SGC, PLAZO_DE_REPORTE, SGC_REPORTES } from "@/db/semillas/indicadores-demo-fichas";
import { periodoDe, type Periodo } from "@/lib/indicadores-documentales/periodo";
import { fechaLimiteDeReporte, periodosTerminados } from "@/lib/indicadores/periodos";
import type { Periodicidad } from "@/lib/indicadores/tipos";
import { fechaEnZona, fechaLimite } from "@/lib/tramites/plazos";
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
  // Desde la 14B: el cierre (de diciembre, el 15 de enero) llega después de que vence el segundo semestre, que calcula el
  // sistema; y una siembra el primer día de un mes, con el mes anterior recién terminado.
  {
    dia: "2027-03-20",
    trimestres: ["2026-T2", "2026-T3", "2026-T4"],
    siguiente: "2027-T1",
    semestre: "2026-S1",
    anio: "2025",
    meses: ["2027-03", "2027-02", "2027-01", "2026-12", "2026-11", "2026-10", "2026-09"],
  },
  {
    dia: "2026-10-01",
    trimestres: ["2025-T4", "2026-T1", "2026-T2"],
    siguiente: "2026-T3",
    semestre: "2025-S2",
    anio: "2025",
    meses: ["2026-09", "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03"],
  },
];

const sembradoEl = (dia: string) => new Date(`${dia}T15:00:00Z`);

type Ficha = {
  periodicidad: Periodicidad;
  inicio: string;
  aprobada: Date | null;
  retirada: boolean;
  conDato: Set<string>;
  /** Desde qué periodo lo calcula el sistema (una ficha automática, o un cambio mayor que la pasó a automática). */
  automaticaDesde: string | null;
  /** Un cambio mayor a automática enviado y aún sin aprobar: desde qué periodo regirá. */
  cambioPendiente: string | null;
  plazo: number;
};

/** Hechos de la agenda de un tipo, con su hora. */
const deTipo = <T extends Hecho["tipo"]>(agenda: ReturnType<typeof agendaDeIndicadores>, tipo: T) =>
  agenda.filter((p) => p.hecho.tipo === tipo) as { momento: Date; hecho: Extract<Hecho, { tipo: T }> }[];

/**
 * Lo que la agenda deja de cada periodo terminado de cada indicador aprobado y no retirado (al retirar se quitan sus
 * mediciones vacías): `vencidas` (sin dato, abiertas y con el plazo pasado), `sinDato` (las cerró el cierre del mes sin
 * dato), `porReportar` (sin dato y en plazo), `historicosSinRegistrar` y `delSistema` (los que rige una versión
 * automática: nadie los reporta; los calcula el sistema).
 */
function loQueQueda(ahora: Date) {
  const fichas = new Map<string, Ficha>();
  let cierre: { mes: string; momento: Date } | null = null;
  for (const { momento, hecho } of agendaDeIndicadores(ahora, zona)) {
    const ficha = (codigo: string) => fichas.get(codigo)!;
    if (hecho.tipo === "crear") {
      fichas.set(hecho.ficha.codigo, {
        periodicidad: hecho.ficha.periodicidad,
        inicio: hecho.inicio,
        aprobada: null,
        retirada: false,
        conDato: new Set(),
        automaticaDesde: hecho.ficha.calculo ? hecho.inicio : null,
        cambioPendiente: null,
        plazo: hecho.ficha.plazoReporte ?? PLAZO_DE_REPORTE,
      });
    } else if (hecho.tipo === "cambiar") {
      if (hecho.ficha.calculo) ficha(hecho.codigo).cambioPendiente = hecho.rigeDesde ?? null;
    } else if (hecho.tipo === "aprobar") {
      for (const codigo of hecho.codigos) {
        const f = ficha(codigo);
        f.aprobada ??= momento;
        if (f.cambioPendiente) [f.automaticaDesde, f.cambioPendiente] = [f.cambioPendiente, null];
      }
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
  const salida = {
    vencidas: [] as string[][],
    sinDato: [] as string[][],
    porReportar: [] as string[][],
    historicosSinRegistrar: [] as string[][],
    delSistema: [] as string[][],
  };
  for (const [codigo, f] of fichas) {
    if (!f.aprobada || f.retirada) continue;
    const automatica = f.automaticaDesde ? periodoDe(f.automaticaDesde, zona)! : null;
    for (const p of periodosTerminados(f.periodicidad, f.inicio, ahora, zona)) {
      if (automatica && p.desde.getTime() >= automatica.desde.getTime()) {
        // Lo que calcula el sistema no tiene datos digitados: nadie lo reporta.
        expect(f.conDato.has(p.clave), `${codigo} ${p.clave}`).toBe(false);
        salida.delSistema.push([codigo, p.clave]);
        continue;
      }
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
    // El 5 de enero de 2027, el cuarto trimestre, el año 2026 y diciembre siguen en plazo. El segundo semestre de
    // `SGC-IND-03` ya no se reporta: desde su versión 2 (que rige desde el primer semestre) lo calcula el sistema.
    const enero = loQueQueda(sembradoEl("2027-01-05"));
    for (const esperado of [["SGC-IND-01", "2026-T4"], ["SGC-IND-04", "2026"], ["AIN-IND-01", "2026-12"], ["CEX-IND-01", "2026-12"]]) {
      expect(enero.porReportar).toContainEqual(esperado);
    }
    expect(enero.porReportar).not.toContainEqual(["SGC-IND-03", "2026-S2"]);
    expect(enero.delSistema).toContainEqual(["SGC-IND-03", "2026-S2"]);
  });
});

/** Los meses en los que vence la medición de algún indicador manual del SGC (las ordinarias, no las históricas). */
function mesesConFechaLimiteDelSgc(ahora: Date): Set<string> {
  const agenda = agendaDeIndicadores(ahora, zona);
  const meses = new Set<string>();
  const aprobacion = deTipo(agenda, "aprobar").find((p) => p.hecho.codigos.includes(DEL_SGC[0].codigo))!.momento;
  const cambio = deTipo(agenda, "cambiar").find((p) => p.hecho.ficha.calculo)!;
  for (const crear of deTipo(agenda, "crear")) {
    const f = crear.hecho.ficha;
    if (f.proceso !== "SGC" || f.calculo) continue;
    for (const p of periodosTerminados(f.periodicidad, crear.hecho.inicio, ahora, zona)) {
      if (p.hasta.getTime() < aprobacion.getTime()) continue;
      if (f.codigo === cambio.hecho.codigo && p.desde.getTime() >= periodoDe(cambio.hecho.rigeDesde!, zona)!.desde.getTime()) continue;
      meses.add(fechaEnZona(fechaLimiteDeReporte(p, PLAZO_DE_REPORTE, zona), zona).slice(0, 7));
    }
  }
  return meses;
}

describe("lo que calcula el sistema y lo regulatorio en la agenda (anexo 14B, §11)", () => {
  it.each(CASOS)("sembrando el $dia", (caso) => {
    const ahora = sembradoEl(caso.dia);
    const cal = calendarioDeIndicadores(ahora, zona);
    const agenda = agendaDeIndicadores(ahora, zona);

    // `SGC-IND-03`: el cambio mayor a «Objetivos cumplidos» rige desde un semestre que ya terminó, sin datos de la versión
    // manual en él ni después; lo aprueba Gerencia y su foto (si su hora llegó) no la cierra el cierre del mes.
    const [cambio, ...otros] = deTipo(agenda, "cambiar").filter((p) => p.hecho.ficha.calculo);
    expect(otros).toEqual([]);
    expect(cambio.hecho).toMatchObject({ codigo: "SGC-IND-03", rigeDesde: cal.semestreAutomatico.clave });
    expect(cambio.hecho.ficha.calculo).toEqual({ clave: "objetivos_cumplidos", alcance: "calidad" });
    expect(cal.semestreAutomatico.hasta.getTime()).toBeLessThan(cambio.momento.getTime());
    const aprobada = deTipo(agenda, "aprobar").find((p) => p.hecho.codigos.includes("SGC-IND-03") && p.momento > cambio.momento);
    expect(aprobada?.momento).toEqual(cal.sgc03.aprobacion);
    expect(loQueQueda(ahora).delSistema).toContainEqual(["SGC-IND-03", cal.semestreAutomatico.clave]);
    const foto = cal.sgc03.foto ?? ahora;
    const venceTrasLaFoto = fechaLimite(foto, PLAZO_DE_REPORTE, zona);
    expect(foto.getTime() > cal.cierre.getTime() || venceTrasLaFoto.getTime() > cal.cierre.getTime()).toBe(true);
    const fotos = deTipo(agenda, "fotos");
    expect(fotos.map((p) => p.momento)).toEqual(cal.sgc03.foto ? [cal.sgc03.foto] : []);

    // `CEX-IND-01`: al menos dos trimestres desde que se reporta al ente; una registrada y al menos otra vencida.
    const plan = constanciasDeLaDemo(ahora, zona);
    expect(plan.periodos.length).toBeGreaterThanOrEqual(2);
    expect(plan.periodos.map((p) => p.clave)).toContain(plan.registrada);
    const vencidas = plan.periodos.filter((p) => p.clave !== plan.registrada && p.vence.getTime() < ahora.getTime());
    expect(vencidas.length).toBeGreaterThan(0);
    expect(plan.fechaEnvio < fechaEnZona(ahora, zona)).toBe(true);
    expect(plan.fechaEnvio >= fechaEnZona(periodoDe(plan.registrada, zona)!.hasta, zona)).toBe(true);

    // `SGC-ID-001` («Reportes a tiempo» del SGC, 31 días): un mes con su foto y sin fechas límite del SGC («No aplica») y otro
    // que aún la espera («Falta un dato»).
    const reportes = deTipo(agenda, "crear").find((p) => p.hecho.ficha.codigo === SGC_REPORTES.codigo)!;
    const meses: Periodo[] = periodosTerminados("mensual", reportes.hecho.inicio, ahora, zona);
    const conFoto = meses.filter((m) => fechaLimiteDeReporte(m, SGC_REPORTES.plazoReporte!, zona).getTime() < ahora.getTime());
    const conFechas = mesesConFechaLimiteDelSgc(ahora);
    expect(conFoto.some((m) => !conFechas.has(m.clave)), caso.dia).toBe(true);
    expect(meses.some((m) => !conFoto.includes(m)), caso.dia).toBe(true);
  });
});
