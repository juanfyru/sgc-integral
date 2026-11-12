import type { PuntoDeSerie } from "@/componentes/ui/geometria-tubos";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const NOMBRE = { bien: "Bien", atencion: "Atención", critico: "Crítico" } as const;

const conValor = (i: number, valor: number, estado: keyof typeof NOMBRE): PuntoDeSerie => ({
  clave: `2026-${String(i + 1).padStart(2, "0")}`,
  etiqueta: MESES[i],
  valor,
  texto: `${String(valor).replace(".", ",")} %`,
  estado,
  nombreEstado: NOMBRE[estado],
});

const sinValor = (i: number, estado: "sin-dato" | "no-aplica" | "futuro", nombreEstado: string): PuntoDeSerie => ({
  clave: `2026-${String(i + 1).padStart(2, "0")}`,
  etiqueta: MESES[i],
  valor: null,
  texto: "",
  estado,
  nombreEstado,
});

/**
 * El recaudo de cartera de la maqueta (`estilo-graficas-v3.html`, estilo A): meta 85 %, crítico por debajo de 59,5 %;
 * julio sin dato, noviembre «no aplica» y diciembre aún no llega.
 */
export const doce: PuntoDeSerie[] = [
  conValor(0, 88, "bien"),
  conValor(1, 91, "bien"),
  conValor(2, 86, "bien"),
  conValor(3, 79, "atencion"),
  conValor(4, 74, "atencion"),
  conValor(5, 82, "atencion"),
  sinValor(6, "sin-dato", "Sin dato"),
  conValor(7, 58, "critico"),
  conValor(8, 71, "atencion"),
  conValor(9, 87, "bien"),
  sinValor(10, "no-aplica", "No aplica"),
  sinValor(11, "futuro", "Por reportar"),
];
