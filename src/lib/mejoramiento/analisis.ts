/**
 * El contenido de cada método de análisis de causa raíz (spec 15 §9.1, F15-DC16): un esquema por método, validado y
 * normalizado antes de guardarse. Puro: sin base de datos. El Pareto es de la 15C y aquí se rechaza.
 */
import { z } from "zod";
import { ErrorMejora, type MetodoAnalisis } from "./tipos";

export const CATEGORIAS_6M = ["mano_de_obra", "metodo", "maquina", "material", "medicion", "medio_ambiente"] as const;
export type Categoria6M = (typeof CATEGORIAS_6M)[number];

export const ETIQUETA_6M: Record<Categoria6M, string> = {
  mano_de_obra: "Mano de obra",
  metodo: "Método",
  maquina: "Máquina o equipo",
  material: "Material",
  medicion: "Medición",
  medio_ambiente: "Medio ambiente",
};

export const IMPACTOS = ["alto", "medio", "bajo"] as const;
export type ImpactoDeCausa = (typeof IMPACTOS)[number];
export const ETIQUETA_IMPACTO: Record<ImpactoDeCausa, string> = { alto: "Alto", medio: "Medio", bajo: "Bajo" };

export const MAXIMO_DE_NIVELES = 5;
export const PARETO_NO_DISPONIBLE = "El análisis de Pareto todavía no está disponible";
export const NIVELES_EN_ORDEN = "Los niveles van en orden, sin saltar ninguno";
export const SIN_IMPACTO = "Indique el impacto de cada causa confirmada";

const texto = (vacio: string, maximo: number, largo: string) =>
  z.string({ error: vacio }).trim().min(1, vacio).max(maximo, largo);

const nivel = z
  .object({
    respuesta: z.string({ error: "Escriba la respuesta de cada nivel" }).trim().max(1000, "La respuesta de un nivel no puede pasar de 1000 caracteres"),
    evidencia: z
      .string({ error: "La evidencia no es un texto válido" })
      .trim()
      .max(1000, "La evidencia de un nivel no puede pasar de 1000 caracteres")
      .nullish()
      .transform((v) => v || undefined),
  })
  .strict();

/** De uno a cinco niveles, en orden y sin huecos; los vacíos del final no cuentan. */
export const EsquemaCincoPorques = z
  .object({ niveles: z.array(nivel, { error: "Escriba los niveles del análisis" }).max(MAXIMO_DE_NIVELES, "Son cinco niveles como máximo") })
  .strict()
  .superRefine((d, ctx) => {
    const llenos = d.niveles.map((n) => n.respuesta !== "");
    const ultimo = llenos.lastIndexOf(true);
    if (ultimo < 0) {
      ctx.addIssue({ code: "custom", path: ["niveles"], message: "Escriba al menos el primer nivel" });
    } else if (llenos.slice(0, ultimo).includes(false)) {
      ctx.addIssue({ code: "custom", path: ["niveles"], message: NIVELES_EN_ORDEN });
    }
  })
  .transform((d) => {
    const ultimo = d.niveles.map((n) => n.respuesta !== "").lastIndexOf(true);
    return {
      niveles: d.niveles.slice(0, ultimo + 1).map((n) => (n.evidencia ? { respuesta: n.respuesta, evidencia: n.evidencia } : { respuesta: n.respuesta })),
    };
  });

const causaDeIshikawa = z
  .object({
    categoria: z.enum(CATEGORIAS_6M, { error: "Elija una de las seis categorías" }),
    texto: texto("Escriba cada causa", 500, "Una causa no puede pasar de 500 caracteres"),
    confirmada: z.boolean({ error: "Diga si la causa está confirmada" }),
    impacto: z.enum(IMPACTOS, { error: SIN_IMPACTO }).nullish(),
    requiereAccion: z.boolean().nullish(),
  })
  .strict();

/** Causas posibles por categoría; las confirmadas llevan su impacto y si requieren acción. */
export const EsquemaIshikawa = z
  .object({ causas: z.array(causaDeIshikawa, { error: "Escriba las causas del análisis" }).max(60, "Son sesenta causas como máximo") })
  .strict()
  .superRefine((d, ctx) => {
    if (d.causas.some((x) => x.confirmada && !x.impacto)) {
      ctx.addIssue({ code: "custom", path: ["causas"], message: SIN_IMPACTO });
    }
  })
  .transform((d) => ({
    causas: d.causas.map((x) =>
      x.confirmada
        ? { categoria: x.categoria, texto: x.texto, confirmada: true as const, impacto: x.impacto as ImpactoDeCausa, requiereAccion: x.requiereAccion === true }
        : { categoria: x.categoria, texto: x.texto, confirmada: false as const },
    ),
  }));

/** Un método que no es de los dos: su nombre y su descripción (los adjuntos viajan como archivos de la ronda). */
export const EsquemaOtroMetodo = z
  .object({
    nombre: texto("Escriba el nombre del método", 120, "El nombre del método no puede pasar de 120 caracteres"),
    descripcion: texto("Escriba la descripción del método", 4000, "La descripción no puede pasar de 4000 caracteres"),
  })
  .strict();

export type ContenidoCincoPorques = z.output<typeof EsquemaCincoPorques>;
export type ContenidoIshikawa = z.output<typeof EsquemaIshikawa>;
export type ContenidoOtroMetodo = z.output<typeof EsquemaOtroMetodo>;
export type ContenidoDeAnalisis = ContenidoCincoPorques | ContenidoIshikawa | ContenidoOtroMetodo;

/** Valida y normaliza el contenido de un método; lanza `ErrorMejora` con el primer mensaje. */
export function leerContenido(metodo: "cinco_porques", crudo: unknown): ContenidoCincoPorques;
export function leerContenido(metodo: "ishikawa", crudo: unknown): ContenidoIshikawa;
export function leerContenido(metodo: "otro", crudo: unknown): ContenidoOtroMetodo;
export function leerContenido(metodo: MetodoAnalisis, crudo: unknown): ContenidoDeAnalisis;
export function leerContenido(metodo: MetodoAnalisis, crudo: unknown): ContenidoDeAnalisis {
  if (metodo === "pareto") throw new ErrorMejora(PARETO_NO_DISPONIBLE);
  const esquema = metodo === "cinco_porques" ? EsquemaCincoPorques : metodo === "ishikawa" ? EsquemaIshikawa : EsquemaOtroMetodo;
  const leido = esquema.safeParse(crudo);
  if (!leido.success) throw new ErrorMejora(leido.error.issues[0].message);
  return leido.data as ContenidoDeAnalisis;
}

/** Si el análisis está completo (spec §9.1): 5 porqués con su primer nivel; Ishikawa con una causa confirmada; otro, con nombre y descripción. */
export function analisisCompleto(a: { metodo: MetodoAnalisis; contenido: unknown }): boolean {
  try {
    const c = leerContenido(a.metodo, a.contenido);
    if (a.metodo === "ishikawa") return (c as ContenidoIshikawa).causas.some((x) => x.confirmada);
    return true;
  } catch {
    return false;
  }
}

const EsquemaCambios = z
  .object({
    documentos: z.boolean(),
    riesgos: z.boolean(),
    controles: z.boolean(),
    descripcion: z.string().nullish().transform((v) => v ?? null),
  })
  .strict();
export type CambiosDeCierre = z.output<typeof EsquemaCambios>;

/** Lee lo guardado en `mejora_rondas.cambios` sin confiar en su forma: `null` si no se respondió, `undefined` si no se puede leer. */
export function leerCambios(crudo: unknown): CambiosDeCierre | null | undefined {
  if (crudo === null || crudo === undefined) return null;
  const leido = EsquemaCambios.safeParse(crudo);
  return leido.success ? leido.data : undefined;
}

/** Las marcas de la segunda pregunta del análisis tal como estén guardadas: lo que no es un `true` no cuenta. */
function marcasDeCambios(crudo: unknown): { documentos: boolean; riesgos: boolean; controles: boolean } {
  const c = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
  return { documentos: c.documentos === true, riesgos: c.riesgos === true, controles: c.controles === true };
}

/** Si la segunda pregunta del análisis pidió cambios en documentos, riesgos o controles (spec 15 §9.3 y §11.5). */
export function pideCambios(crudo: unknown): boolean {
  const m = marcasDeCambios(crudo);
  return m.documentos || m.riesgos || m.controles;
}

/**
 * Si el cierre exige decir cómo se atendieron los cambios (spec 15 §11.5; Fase 15B, anexo §9.6): con la matriz de riesgos o los
 * controles marcados, siempre; con solo documentos, cuando la ronda que se cierra no tiene ningún trámite enlazado que terminó bien
 * (`tramitesQueTerminaronBien`: entonces la pantalla los lista y el evento del cierre los guarda); sin nada marcado, nunca. Una sola
 * regla para el cierre, la evaluación que cierra y sus pantallas.
 */
export function exigeComoSeAtendieron(crudo: unknown, tramitesQueTerminaronBien: number): boolean {
  const m = marcasDeCambios(crudo);
  if (m.riesgos || m.controles) return true;
  return m.documentos && tramitesQueTerminaronBien === 0;
}
