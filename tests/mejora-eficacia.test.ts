/**
 * Las dos fechas de la eficacia (spec 15 §11.3 y §11.4) y la huella del plan (§12.1), reglas puras: sin base de datos.
 * Los días son `AAAA-MM-DD` del calendario de la zona; la zona es la de Suaza.
 */
import { describe, expect, it } from "vitest";
import { CONFIG_MEJORA_DEFECTO } from "@/db/consultas/mejoramiento/config";
import { EsquemaCriterio, EsquemaDiaDeCalendario, EsquemaHallazgo } from "@/lib/esquemas/mejoramiento";
import { SIN_AJUSTES } from "@/lib/dias-habiles";
import { cierrePrevisto, fechaMinimaDeEficacia, venceLaEvaluacion } from "@/lib/mejoramiento/eficacia";
import { huellaDePlan, type PlanFirmado } from "@/lib/mejoramiento/huellas";
import { finDeFecha } from "@/lib/tramites/plazos";

const ZONA = "America/Bogota";
const C = { zona: ZONA, config: CONFIG_MEJORA_DEFECTO, calendario: SIN_AJUSTES };

const nc = (r: string, periodicidad: "mensual" | "trimestral" | "anual" | null = null) =>
  fechaMinimaDeEficacia({ clase: "no_conformidad", r, fechaEvaluacion: null, periodicidad }, ZONA);

describe("fechaMinimaDeEficacia (spec §11.3)", () => {
  it("el ejemplo del spec: el 5 de diciembre y un indicador mensual, desde el 1 de marzo; sin indicador, el 5 de febrero", () => {
    expect(nc("2026-12-05", "mensual")).toBe("2027-03-01");
    expect(nc("2026-12-05")).toBe("2027-02-05");
  });

  it("r el primer día del mes: diciembre no empieza después de r, los dos periodos son enero y febrero", () => {
    expect(nc("2026-12-01", "mensual")).toBe("2027-03-01");
  });

  it("r el último día del mes: diciembre y enero", () => {
    expect(nc("2026-11-30", "mensual")).toBe("2027-02-01");
  });

  it("trimestral: los trimestres 1 y 2 de 2027; anual: 2027 y 2028", () => {
    expect(nc("2026-12-05", "trimestral")).toBe("2027-07-01");
    expect(nc("2026-12-05", "anual")).toBe("2029-01-01");
  });

  it("fin de mes corto: dos meses después del 31 de diciembre es el 28 de febrero", () => {
    expect(nc("2026-12-31")).toBe("2027-02-28");
  });

  it("sin indicador: dos meses calendario desde r (el 30 de noviembre, el 30 de enero)", () => {
    expect(fechaMinimaDeEficacia({ clase: "no_conformidad", r: "2026-11-30", fechaEvaluacion: null, periodicidad: null }, ZONA)).toBe("2027-01-30");
  });

  it("observación y oportunidad: la fecha de evaluación, o r si es posterior", () => {
    const obs = (r: string, fechaEvaluacion: string | null) =>
      fechaMinimaDeEficacia({ clase: "observacion", r, fechaEvaluacion, periodicidad: "mensual" }, ZONA);
    expect(obs("2026-12-05", "2027-01-15")).toBe("2027-01-15");
    expect(obs("2027-02-01", "2027-01-15")).toBe("2027-02-01");
    expect(obs("2027-02-01", null)).toBe("2027-02-01");
    expect(fechaMinimaDeEficacia({ clase: "oportunidad", r: "2026-12-05", fechaEvaluacion: "2027-01-15", periodicidad: null }, ZONA)).toBe(
      "2027-01-15",
    );
  });
});

describe("venceLaEvaluacion (spec §11.4)", () => {
  it("con el plazo de reporte del indicador: el quinto día hábil después del 11 de marzo (el lunes 22 es festivo)", () => {
    // Del 12 de marzo de 2027 (viernes) al jueves 18: cinco días hábiles.
    expect(venceLaEvaluacion("2027-03-01", 10, C)).toEqual(finDeFecha("2027-03-18", ZONA));
  });

  it("sin indicador: el quinto día hábil después del 1 de marzo", () => {
    expect(venceLaEvaluacion("2027-03-01", null, C)).toEqual(finDeFecha("2027-03-08", ZONA));
  });
});

describe("cierrePrevisto (spec §11.3)", () => {
  it("la misma cuenta desde el fin planeado, más evaluar y cerrar", () => {
    // Mínima del 1 de marzo; con 10 días de reporte vence el 18; tres días hábiles después, el miércoles 24 (el 22 es festivo).
    expect(
      cierrePrevisto({ clase: "no_conformidad", finPlaneado: "2026-12-05", fechaEvaluacion: null, periodicidad: "mensual", plazoReporteDias: 10 }, C),
    ).toEqual(finDeFecha("2027-03-24", ZONA));
    // Sin indicador: mínima el viernes 5 de febrero, evaluar vence el viernes 12 y cerrar el miércoles 17.
    expect(
      cierrePrevisto({ clase: "no_conformidad", finPlaneado: "2026-12-05", fechaEvaluacion: null, periodicidad: null, plazoReporteDias: null }, C),
    ).toEqual(finDeFecha("2027-02-17", ZONA));
  });
});

const PLAN: PlanFirmado = {
  ronda: 1,
  identificacion: {
    codigo: "HZ-2026-014",
    clase: "no_conformidad",
    criticidad: "alta",
    origen: "auditoria_interna",
    fuente: "Auditoría interna del 3 de noviembre",
    referenciaCaso: null,
    detectadoEn: "2026-11-03",
    proceso: "Farmacia",
    subproceso: null,
    titulo: "Dos turnos de noche sin registro de temperatura",
    descripcion: "En la planilla de la nevera faltan los registros de los turnos de noche.",
    requisitoClausula: "8.5.1",
    requisitoNorma: null,
    requisitoDocumento: null,
    riesgo: null,
    fechaLimiteEnte: null,
    reincidenteDe: null,
    documentoId: null,
    documento: null,
    indicadorId: 3,
    indicador: "FAR-ID-002 Registros de temperatura completos",
    medicionId: null,
    medicion: null,
  },
  correccion: { requerida: true, descripcion: "Se reubicaron las dosis", responsable: "L. Rojas", implementadaEn: "2026-11-05" },
  analisis: [{ orden: 1, metodo: "cinco_porques", equipo: null, observaciones: null, contenido: { niveles: [{ respuesta: "Nadie lo asignó" }] } }],
  causas: [
    { orden: 1, texto: "El procedimiento no asigna el registro al turno de noche", sinAccionPorque: null },
    { orden: 2, texto: "La planilla es de papel", sinAccionPorque: "Se cambiará con el equipo nuevo" },
  ],
  preguntas: { similares: false, similaresDetalle: null, cambios: { documentos: true, riesgos: false, controles: false, descripcion: "Actualizar FAR-PR-04" } },
  acciones: [
    {
      numero: "A1",
      tipo: "correctiva",
      descripcion: "Actualizar el procedimiento de cadena de frío",
      causas: [1],
      recursos: null,
      indicadorCumplimiento: "Procedimiento publicado",
      meta: "100 %",
      actividades: [
        { numero: "A1.1", descripcion: "Pedir el cambio documental", responsableId: 7, responsable: "L. Rojas", inicio: "2026-11-14", fin: "2026-11-20" },
        { numero: "A1.2", descripcion: "Socializar la versión nueva", responsableId: 7, responsable: "L. Rojas", inicio: "2026-11-21", fin: "2026-12-05" },
      ],
    },
  ],
  criterio: {
    criterios: ["mejora_indicador"],
    criterioOtro: null,
    indicador: { id: 3, codigo: "FAR-ID-002", nombre: "Registros de temperatura completos", periodicidad: "mensual" },
    fechaEvaluacion: null,
  },
};

/** El mismo objeto con las claves de cada nivel en orden inverso. */
function alReves(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(alReves);
  if (v !== null && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse().map(([k, x]) => [k, alReves(x)]));
  }
  return v;
}

describe("huellaDePlan (spec §12.1)", () => {
  const otra = (cambio: (p: PlanFirmado) => void) => {
    const copia = structuredClone(PLAN);
    cambio(copia);
    return huellaDePlan(copia);
  };

  it("es un SHA-256 en hexadecimal que no cambia al reordenar las claves", () => {
    expect(huellaDePlan(PLAN)).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaDePlan(alReves(PLAN) as PlanFirmado)).toBe(huellaDePlan(PLAN));
  });

  it("cambia al cambiar una fecha, un responsable o el texto de una causa", () => {
    const original = huellaDePlan(PLAN);
    expect(otra((p) => (p.acciones[0].actividades[1].fin = "2026-12-06"))).not.toBe(original);
    expect(otra((p) => (p.acciones[0].actividades[0].responsableId = 8))).not.toBe(original);
    expect(otra((p) => (p.acciones[0].actividades[0].responsable = "J. Perdomo"))).not.toBe(original);
    expect(otra((p) => (p.causas[0].texto = "El procedimiento no dice quién registra"))).not.toBe(original);
  });
});

describe("las fechas de día que escribe una persona (2000 a 2100)", () => {
  const FUERA = "La fecha debe estar entre el año 2000 y el 2100";
  const mensaje = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) => (r.success ? null : r.error!.issues[0].message);

  it("la fecha de evaluación, la del hallazgo y la del calendario rechazan 9999-12-31 y 1999-12-31", () => {
    for (const fecha of ["9999-12-31", "1999-12-31", "2101-01-01"]) {
      expect(mensaje(EsquemaCriterio.safeParse({ hallazgoId: 1, criterios: ["no_recurrencia"], fechaEvaluacion: fecha }))).toBe(FUERA);
      expect(mensaje(EsquemaDiaDeCalendario.safeParse({ fecha, tipo: "no_habil", motivo: "Cierre institucional" }))).toBe(FUERA);
      const hallazgo = EsquemaHallazgo.safeParse({
        clase: "observacion", origen: "auditoria_interna", fuente: "Auditoría", detectadoEn: fecha, procesoId: 1,
        titulo: "Un hallazgo", descripcion: "Una descripción suficiente",
      });
      expect(mensaje(hallazgo)).toBe(FUERA);
    }
    expect(EsquemaCriterio.safeParse({ hallazgoId: 1, criterios: [], fechaEvaluacion: "2100-12-31" }).success).toBe(true);
    expect(EsquemaCriterio.safeParse({ hallazgoId: 1, criterios: [], fechaEvaluacion: "2000-01-01" }).success).toBe(true);
    // Una fecha imposible sigue diciendo lo de siempre.
    expect(mensaje(EsquemaCriterio.safeParse({ hallazgoId: 1, criterios: [], fechaEvaluacion: "2027-02-30" }))).toBe("Escriba una fecha de evaluación válida");
  });
});
