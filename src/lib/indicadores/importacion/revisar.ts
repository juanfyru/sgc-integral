/**
 * La revisión de las filas de la plantilla (spec fase 14A §5.3 a §5.6): decide, fila por fila, qué ficha se crearía y qué
 * problemas, avisos y correspondencias pendientes tiene. Puro: sin base ni reloj; el año lo trae quien llama.
 */
import { CODIGOS_RESERVADOS, LARGO_CODIGO_INDICADOR, PATRON_CODIGO_INDICADOR } from "@/lib/esquemas/indicadores";
import { analizar } from "@/lib/indicadores/formula/analizar";
import { FACTORES_TASA, formulaDeForma } from "@/lib/indicadores/formula/formas";
import { aDecimal, CERO, CIEN, comparar, fraccion, multiplicar, UNO } from "@/lib/indicadores/formula/fraccion";
import { claveQueContieneMes } from "@/lib/indicadores/periodos";
import { rangosATexto, rangosDeLaRegla, type RangosEnTexto } from "@/lib/indicadores/rangos";
import type { Consolidacion, Forma, Periodicidad, Tendencia } from "@/lib/indicadores/tipos";
import { normalizar } from "@/lib/lote-usuarios";
import { ENCABEZADO_DE, type ClaveColumna } from "./columnas";
import type { FilaLeida } from "./leer";

export type ReglaDeImportacion = { pctAscendente: number; pctDescendente: number };
export type Pendiente = { tipo: "subproceso" | "cargo" | "tipo" | "unidad"; texto: string };

type Catalogo = { id: number; nombre: string };
export type Catalogos = {
  procesos: { id: number; sigla: string; nombre: string }[];
  subprocesos: { id: number; procesoId: number; nombre: string; sigla: string | null }[];
  tipos: Catalogo[];
  clasificaciones: Catalogo[];
  unidades: (Catalogo & { sufijo: string; decimales: number })[];
  cargos: Catalogo[];
  /** Códigos de indicador ya usados en la app, en minúsculas. */
  codigosUsados: ReadonlySet<string>;
};

/** Clave: el texto del archivo normalizado con `normalizar`. */
export type Correspondencias = {
  subprocesos: Record<string, number>;
  cargos: Record<string, number>;
  tipos: Record<string, number>;
  unidades: Record<string, number>;
};

export type FichaImportada = {
  codigo: string;
  nombre: string;
  procesoId: number;
  subprocesoId: number | null;
  tipoId: number;
  clasificacionId: number;
  nivel: string | null;
  proposito: string | null;
  forma: Forma;
  factor: number | null;
  formula: string;
  variables: { letra: "A" | "B"; nombre: string; fuente: string | null; consolidacion: Consolidacion }[];
  unidadId: number;
  meta: string;
  metaMax: string | null;
  tendencia: Tendencia;
  periodicidad: Periodicidad;
  cargoId: number | null;
  riesgoAsociado: string | null;
  requisito: string | null;
  inicioMedicion: string;
  estado: "aprobado" | "propuesto";
  rangos: RangosEnTexto;
  siglaParaSubproceso: string | null;
};

export type FilaRevisada = {
  numero: number;
  codigo: string;
  ficha: FichaImportada | null;
  problemas: string[];
  avisos: string[];
  pendientes: Pendiente[];
};

/** Los largos son los de `EsquemaFicha` (`src/lib/esquemas/indicadores.ts`) y los de cada variable. */
const LARGOS: Partial<Record<ClaveColumna, number>> = {
  nombre: 200,
  nivel: 60,
  objetivo: 1000,
  variableA: 150,
  variableB: 150,
  fuente: 300,
  riesgo: 300,
  referenteNormativo: 120,
};

const FORMAS: Record<string, Forma> = {
  porcentaje: "porcentaje",
  tasa: "tasa",
  "promedio o razon": "razon",
  conteo: "conteo",
  "formula libre": "libre",
};
const JUNTAS: Record<string, Consolidacion> = { "se suma": "suma", "ultimo valor": "ultimo", promedio: "promedio" };
const SENTIDOS: Record<string, Tendencia> = { ascendente: "ascendente", descendente: "descendente", constante: "constante" };
const PERIODICIDADES: Record<string, Periodicidad> = {
  mensual: "mensual",
  bimestral: "bimestral",
  trimestral: "trimestral",
  semestral: "semestral",
  anual: "anual",
};
const ESTADOS: Record<string, "aprobado" | "propuesto"> = { aprobado: "aprobado", propuesto: "propuesto" };

const buscar = <T>(mapa: Record<string, T>, texto: string): T | undefined => (Object.hasOwn(mapa, normalizar(texto)) ? mapa[normalizar(texto)] : undefined);

/** Un número del archivo a texto decimal con punto, sin ceros de relleno. */
function decimalSinRelleno(texto: string): string {
  return texto.includes(".") ? texto.replace(/0+$/, "").replace(/\.$/, "") : texto;
}


function revisarFila(f: FilaLeida, c: Catalogos, corr: Correspondencias, regla: ReglaDeImportacion, anio: number, repetidos: Map<string, number[]>): FilaRevisada {
  const problemas: string[] = [];
  const avisos: string[] = [];
  const pendientes: Pendiente[] = [];
  const t = (clave: ClaveColumna): string => (f.celdas[clave] ?? "").trim();
  const falta = (clave: ClaveColumna) => problemas.push(`Falta «${ENCABEZADO_DE[clave]}»`);
  const pendiente = (p: Pendiente) => {
    if (!pendientes.some((x) => x.tipo === p.tipo && normalizar(x.texto) === normalizar(p.texto))) pendientes.push(p);
  };

  for (const [clave, maximo] of Object.entries(LARGOS) as [ClaveColumna, number][]) {
    if (t(clave).length > maximo) problemas.push(`«${ENCABEZADO_DE[clave]}» pasa de ${maximo} caracteres`);
  }

  // Código
  const codigo = t("codigo");
  if (codigo === "") falta("codigo");
  else {
    const grupo = repetidos.get(codigo.toLowerCase()) ?? [];
    if (grupo.length > 1) problemas.push(`El código ${codigo} se repite en las filas ${grupo[0]} y ${grupo[grupo.length - 1]}`);
    if (c.codigosUsados.has(codigo.toLowerCase())) problemas.push(`El código ${codigo} ya existe en la app`);
    if (codigo.length > LARGO_CODIGO_INDICADOR) problemas.push(`«${ENCABEZADO_DE.codigo}» pasa de ${LARGO_CODIGO_INDICADOR} caracteres`);
    else if (!PATRON_CODIGO_INDICADOR.test(codigo)) problemas.push("El código solo admite letras, números y guiones");
    else if (CODIGOS_RESERVADOS.includes(codigo.toLowerCase())) problemas.push(`El código «${codigo}» es un nombre reservado: elija otro código`);
  }
  if (t("nombre") === "") falta("nombre");

  // Proceso y subproceso
  let proceso: Catalogos["procesos"][number] | undefined;
  if (t("proceso") === "") falta("proceso");
  else {
    const k = normalizar(t("proceso"));
    proceso = c.procesos.find((p) => normalizar(p.sigla) === k) ?? c.procesos.find((p) => normalizar(p.nombre) === k);
    if (!proceso) problemas.push(`El proceso «${t("proceso")}» no existe en el mapa`);
  }
  let subproceso: Catalogos["subprocesos"][number] | undefined;
  if (t("subproceso") !== "") {
    const completo = normalizar(t("subproceso"));
    const sinSufijo = normalizar(t("subproceso").replace(/\s*\([^()]*\)\s*$/, ""));
    const candidatos = proceso ? c.subprocesos.filter((s) => s.procesoId === proceso!.id) : c.subprocesos;
    subproceso = candidatos.find((s) => [completo, sinSufijo].includes(normalizar(s.nombre)));
    if (!subproceso) {
      const elegido = [completo, sinSufijo].map((k) => (Object.hasOwn(corr.subprocesos, k) ? corr.subprocesos[k] : undefined)).find((id) => id !== undefined);
      subproceso = elegido === undefined ? undefined : c.subprocesos.find((s) => s.id === elegido);
      if (!subproceso) pendiente({ tipo: "subproceso", texto: t("subproceso") });
    }
  }

  // Tipo, clasificación, unidad y cargo
  const emparejar = <T extends Catalogo>(texto: string, lista: T[], elegidas: Record<string, number>): T | undefined => {
    const k = normalizar(texto);
    const exacto = lista.find((x) => normalizar(x.nombre) === k);
    if (exacto) return exacto;
    return Object.hasOwn(elegidas, k) ? lista.find((x) => x.id === elegidas[k]) : undefined;
  };
  let tipo: Catalogo | undefined;
  if (t("tipo") === "") falta("tipo");
  else {
    tipo = emparejar(t("tipo"), c.tipos, corr.tipos);
    if (!tipo) pendiente({ tipo: "tipo", texto: t("tipo") });
  }
  let clasificacion: Catalogo | undefined;
  if (t("clasificacion") === "") falta("clasificacion");
  else {
    clasificacion = c.clasificaciones.find((x) => normalizar(x.nombre) === normalizar(t("clasificacion")));
    if (!clasificacion) problemas.push(`La clasificación «${t("clasificacion")}» no existe`);
  }
  let unidad: Catalogos["unidades"][number] | undefined;
  if (t("unidad") === "") falta("unidad");
  else {
    unidad = emparejar(t("unidad"), c.unidades, corr.unidades);
    if (!unidad) pendiente({ tipo: "unidad", texto: t("unidad") });
  }
  let cargo: Catalogo | undefined;
  if (t("cargo") !== "") {
    cargo = emparejar(t("cargo"), c.cargos, corr.cargos);
    if (!cargo) pendiente({ tipo: "cargo", texto: t("cargo") });
  }

  // Forma, fórmula y variables
  let forma: Forma | undefined;
  if (t("forma") === "") falta("forma");
  else {
    forma = buscar(FORMAS, t("forma"));
    if (!forma) problemas.push(`«${t("forma")}» no es una forma: use Porcentaje, Tasa, Promedio o razón, Conteo o Fórmula libre`);
  }
  let factor: number | null = null;
  let formula: string | null = null;
  let letras: ("A" | "B")[] = ["A", "B"];
  if (forma === "tasa") {
    if (t("factor") === "") falta("factor");
    else {
      const n = Number(t("factor").replace(/[.,\s]/g, ""));
      if (!FACTORES_TASA.includes(n)) problemas.push(`«${t("factor")}» no es un factor: use 100, 1.000, 10.000 o 100.000`);
      else factor = n;
    }
  }
  if (forma === "libre") {
    if (t("formulaLibre") === "") falta("formulaLibre");
    else {
      const a = analizar(t("formulaLibre"));
      if (!a.ok) problemas.push(`La fórmula libre no es válida: ${a.error}`);
      else if (a.variables.length === 0) problemas.push("La fórmula libre no usa ninguna variable");
      else {
        const fuera = a.variables.find((l) => l !== "A" && l !== "B");
        if (fuera) problemas.push(`La fórmula libre usa la variable ${fuera}, y la plantilla solo trae A y B`);
        else {
          formula = t("formulaLibre");
          letras = a.variables as ("A" | "B")[];
        }
      }
    }
  } else if (forma !== undefined && (forma !== "tasa" || factor !== null)) {
    formula = formulaDeForma(forma, factor ?? undefined);
    letras = forma === "conteo" ? ["A"] : ["A", "B"];
  }
  for (const letra of letras) {
    if (forma !== undefined && t(letra === "A" ? "variableA" : "variableB") === "") falta(letra === "A" ? "variableA" : "variableB");
  }
  const consolidaciones: Partial<Record<"A" | "B", Consolidacion>> = {};
  for (const [letra, clave] of [["A", "comoSeJuntaA"], ["B", "comoSeJuntaB"]] as const) {
    if (t(clave) === "") consolidaciones[letra] = "suma";
    else {
      const j = buscar(JUNTAS, t(clave));
      if (!j) problemas.push(`«${t(clave)}» no es una forma de juntar: use Se suma, Último valor o Promedio`);
      else consolidaciones[letra] = j;
    }
  }

  // Meta, sentido y periodicidad
  let metaTexto: string | null = null;
  if (t("meta") === "") falta("meta");
  else {
    const m = fraccion(t("meta"));
    if (m === null) problemas.push(`La meta «${t("meta")}» no es un número`);
    else {
      metaTexto = t("meta").replace(",", ".");
      if (unidad && unidad.sufijo.trim() === "%" && comparar(m, CERO) > 0 && comparar(m, UNO) <= 0) {
        const por100 = decimalSinRelleno(aDecimal(multiplicar(m, CIEN), 10, "truncar")).replace(".", ",");
        avisos.push(`La meta ${t("meta")} de un porcentaje parece una fracción: ¿quiso escribir ${por100}?`);
      }
    }
  }
  let metaMax: string | null = null;
  if (t("metaHasta") !== "") {
    if (fraccion(t("metaHasta")) === null) problemas.push(`La meta hasta «${t("metaHasta")}» no es un número`);
    else metaMax = t("metaHasta").replace(",", ".");
  }
  let sentido: Tendencia | undefined;
  if (t("sentido") === "") falta("sentido");
  else {
    sentido = buscar(SENTIDOS, t("sentido"));
    if (!sentido) problemas.push(`«${t("sentido")}» no es un sentido: use Ascendente, Descendente o Constante`);
    else if (sentido === "constante") problemas.push("«Mantenerse en un rango» no se importa: cree esa ficha en la app");
  }
  let periodicidad: Periodicidad | undefined;
  if (t("periodicidad") === "") falta("periodicidad");
  else {
    periodicidad = buscar(PERIODICIDADES, t("periodicidad"));
    if (!periodicidad) problemas.push(`«${t("periodicidad")}» no es una periodicidad: use Mensual, Bimestral, Trimestral, Semestral o Anual`);
  }
  let inicioMes: { anio: number; mes: number } = { anio, mes: 1 };
  if (t("inicioMedicion") !== "") {
    const m = /^(\d{4})-(\d{2})$/.exec(t("inicioMedicion"));
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) problemas.push(`El inicio de medición «${t("inicioMedicion")}» no es AAAA-MM`);
    else inicioMes = { anio: Number(m[1]), mes: Number(m[2]) };
  }
  let estado: "aprobado" | "propuesto" | undefined;
  if (t("estado") === "") falta("estado");
  else {
    estado = buscar(ESTADOS, t("estado"));
    if (!estado) problemas.push(`«${t("estado")}» no es un estado: use Aprobado o Propuesto`);
  }

  const nombresDe = (letra: "A" | "B") => t(letra === "A" ? "variableA" : "variableB");
  const sinPendientes = pendientes.length === 0;
  if (
    !(problemas.length === 0 && sinPendientes && proceso && tipo && clasificacion && unidad && forma && formula !== null && metaTexto !== null && sentido && sentido !== "constante" && periodicidad && estado)
  )
    return { numero: f.numero, codigo, ficha: null, problemas, avisos, pendientes };

  const meta = fraccion(metaTexto!)!;
  const siglaDelCodigo = /^(.+?)-ID-\d+$/i.exec(codigo)?.[1].toUpperCase() ?? null;
  const siglaParaSubproceso =
    subproceso && subproceso.sigla === null && siglaDelCodigo !== null && normalizar(siglaDelCodigo) !== normalizar(proceso.sigla) ? siglaDelCodigo : null;
  const ficha: FichaImportada = {
    codigo,
    nombre: t("nombre"),
    procesoId: proceso.id,
    subprocesoId: subproceso?.id ?? null,
    tipoId: tipo.id,
    clasificacionId: clasificacion.id,
    nivel: t("nivel") || null,
    proposito: t("objetivo") || null,
    forma,
    factor,
    formula: formula!,
    variables: letras.map((letra) => ({
      letra,
      nombre: nombresDe(letra),
      fuente: t("fuente") || null,
      consolidacion: consolidaciones[letra] ?? "suma",
    })),
    unidadId: unidad.id,
    meta: metaTexto!,
    metaMax,
    tendencia: sentido as Tendencia,
    periodicidad,
    cargoId: cargo?.id ?? null,
    riesgoAsociado: t("riesgo") || null,
    requisito: t("referenteNormativo") || null,
    inicioMedicion: claveQueContieneMes(periodicidad, inicioMes.anio, inicioMes.mes),
    estado,
    rangos: rangosATexto(rangosDeLaRegla(meta, sentido as "ascendente" | "descendente", regla.pctAscendente, regla.pctDescendente)),
    siglaParaSubproceso,
  };
  return { numero: f.numero, codigo, ficha, problemas, avisos, pendientes };
}

export function revisarLote(filas: FilaLeida[], c: Catalogos, corr: Correspondencias, regla: ReglaDeImportacion, anio: number): FilaRevisada[] {
  const repetidos = new Map<string, number[]>();
  for (const f of filas) {
    const codigo = (f.celdas.codigo ?? "").trim().toLowerCase();
    if (codigo !== "") repetidos.set(codigo, [...(repetidos.get(codigo) ?? []), f.numero]);
  }
  return filas.map((f) => revisarFila(f, c, corr, regla, anio, repetidos));
}
