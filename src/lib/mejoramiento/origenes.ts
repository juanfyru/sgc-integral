import type { Origen } from "./tipos";

/** Los catorce orígenes, en el orden del spec §7.2. Lista fija: de cada uno cuelgan reglas. */
export const ORIGENES: ReadonlyArray<{ clave: Origen; etiqueta: string; externo: boolean }> = [
  { clave: "auditoria_interna", etiqueta: "Auditoría interna", externo: false },
  { clave: "control_interno", etiqueta: "Control Interno", externo: false },
  { clave: "revision_direccion", etiqueta: "Revisión por la dirección", externo: false },
  { clave: "pamec", etiqueta: "PAMEC", externo: false },
  { clave: "autoevaluacion", etiqueta: "Autoevaluación", externo: false },
  { clave: "indicador", etiqueta: "Indicador", externo: false },
  { clave: "pqrsf", etiqueta: "PQRSF", externo: false },
  { clave: "evento_adverso", etiqueta: "Evento adverso o seguridad del paciente", externo: false },
  { clave: "riesgo_materializado", etiqueta: "Riesgo materializado", externo: false },
  { clave: "satisfaccion_usuario", etiqueta: "Satisfacción del usuario", externo: false },
  { clave: "control_documental", etiqueta: "Control documental", externo: false },
  { clave: "otro", etiqueta: "Otro (la fuente dice cuál)", externo: false },
  { clave: "auditoria_externa", etiqueta: "Auditoría externa", externo: true },
  { clave: "ente_control", etiqueta: "Ente de control", externo: true },
];

export function esExterno(o: Origen): boolean {
  return o === "auditoria_externa" || o === "ente_control";
}

export function pideReferenciaDelCaso(o: Origen): boolean {
  return o === "pqrsf" || o === "evento_adverso";
}

/** La fuente es obligatoria salvo en «Indicador» cuando lleva la medición enlazada (spec §7.1). */
export function fuenteObligatoria(o: Origen, conMedicion: boolean): boolean {
  return !(o === "indicador" && conMedicion);
}
