/**
 * De dónde salen las variables de una ficha (anexo 14C, §4.2, §5.2 y §6.1): un dato compartido, el resultado de otro
 * indicador o la desagregación por una dimensión. `revisarOrigenes` es la única revisión, para guardar, enviar y aprobar; el
 * grafo de quién toma a quién se arma con las fichas vigentes de los indicadores activos, sustituyendo las que se guardan o
 * se aprueban.
 *
 * Módulo liviano: lo importan `fichas` y la aprobación, así que no importa `lectura`, `fichas`, `aprobacion` ni `operacion`,
 * ni `datos` o `dimensiones` (arrastran la bitácora): lee el dato, el componente, la dimensión y los objetivos por SQL
 * directo. Ningún mensaje nombra al indicador de origen: lo dicen por la letra de la variable. Los del dato llevan su
 * nombre y los de la dimensión, el suyo.
 *
 * Candados: el dato, el componente y la dimensión `FOR KEY SHARE`, en orden de id, como las normas de la ficha: quien los
 * cambia (o retira el componente) los toma `FOR UPDATE` y espera. Que guardar una ficha que toma otro indicador lo tome
 * `FOR KEY SHARE` (lo impondría igual su llave foránea al insertar la variable) es la excepción nombrada a «un solo
 * indicador por transacción»: no choca con el `FOR SHARE` del cierre ni de la reapertura en cascada, y el interbloqueo que
 * puede darse entre dos guardados cruzados le llega a la persona legible (`sinInterbloqueoCrudo`).
 */
import type { Cliente } from "@/db/cliente";
import { errorDeDesagregacion, FORMULA_NO_DESAGREGABLE } from "@/lib/indicadores/categorias";
import { alcanza, caminoDeCiclo, nivelesBajo } from "@/lib/indicadores/grafo";
import { contiene } from "@/lib/indicadores/periodos";
import {
  ErrorIndicador,
  MAXIMO_NIVELES,
  type Consolidacion,
  type Forma,
  type OrigenVariable,
  type Periodicidad,
  type Toma,
} from "@/lib/indicadores/tipos";

export type ClaseDeObjetivo = "calidad" | "institucional";
/** A qué objetivos alcanza un cálculo de «Objetivos cumplidos». */
export type AlcanceDeObjetivos = ClaseDeObjetivo | "todos";

/** El nodo de una ficha que aún no tiene indicador (los ids son positivos: nadie la toma). */
const FICHA_NUEVA = 0;

const CICLO = "Esta ficha cerraría un ciclo entre indicadores";
const NIVELES = "Un indicador compuesto admite hasta cinco niveles";
const DIMENSION_ACTIVA = "Elija una dimensión activa";

const ADJETIVO: Record<Periodicidad, string> = {
  mensual: "mensual",
  bimestral: "bimestral",
  trimestral: "trimestral",
  semestral: "semestral",
  anual: "anual",
};

const unicos = (ids: readonly number[]) => [...new Set(ids)].sort((a, b) => a - b);
const textoONulo = (x: unknown) => (x === null || x === undefined ? null : String(x));
const idONulo = (x: unknown) => (x === null || x === undefined ? null : Number(x));

// ─────────────────────────────────────────────────────────────────────────────
// El grafo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Por cada indicador activo que toma a otros, los `indicador_origen_id` de su ficha vigente (los que no toman a nadie no
 * aparecen). `sustituir` reemplaza los de los indicadores que trae: el borrador que se guarda, o las fichas del bloque que
 * se aprueba, que rigen en lugar de sus vigentes.
 */
export async function aristasDeComponentes(
  sql: Cliente,
  opciones?: { sustituir?: ReadonlyMap<number, readonly number[]> },
): Promise<Map<number, number[]>> {
  const filas = await sql`
    SELECT i.id, array_agg(DISTINCT v.indicador_origen_id ORDER BY v.indicador_origen_id)::int[] AS componentes
    FROM indicadores i
    JOIN indicador_versiones vig ON vig.indicador_id = i.id AND vig.estado = 'aprobada'
      AND vig.numero = (SELECT max(w.numero) FROM indicador_versiones w WHERE w.indicador_id = i.id AND w.estado = 'aprobada')
    JOIN indicador_variables v ON v.version_id = vig.id AND v.indicador_origen_id IS NOT NULL
    WHERE i.estado = 'activo'
    GROUP BY i.id`;
  const aristas = new Map<number, number[]>(filas.map((f) => [Number(f.id), (f.componentes as number[]).map(Number)]));
  for (const [id, componentes] of opciones?.sustituir ?? []) aristas.set(id, unicos(componentes));
  return aristas;
}

/** Los indicadores activos cuyo cálculo vigente es «Objetivos cumplidos», con su alcance: cuentan a otros sin tomarlos. */
export async function fichasDeObjetivosCumplidos(sql: Cliente): Promise<Map<number, AlcanceDeObjetivos>> {
  const filas = await sql`SELECT id, calculo_alcance FROM indicadores WHERE estado = 'activo' AND calculo = 'objetivos_cumplidos'`;
  return new Map(filas.map((f) => [Number(f.id), f.calculo_alcance as AlcanceDeObjetivos]));
}

const cuentaLaClase = (alcance: AlcanceDeObjetivos, clase: ClaseDeObjetivo) => alcance === "todos" || alcance === clase;

/** El alcance de una ficha de «Objetivos cumplidos», o `null` si su cálculo es otro (o no lo calcula el sistema). */
export const cuentaObjetivosDe = (calculo: string | null | undefined, alcance: string | null | undefined): AlcanceDeObjetivos | null =>
  calculo === "objetivos_cumplidos" ? ((alcance as AlcanceDeObjetivos | null | undefined) ?? null) : null;

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se cita
// ─────────────────────────────────────────────────────────────────────────────

/** Un dato compartido del catálogo, tal como está hoy: de aquí se copia lo que la variable firma. */
export type DatoCitado = {
  id: number;
  nombre: string;
  descripcion: string | null;
  fuente: string | null;
  unidad: string | null;
  periodicidad: Periodicidad;
  consolidacion: Consolidacion;
  capturaMin: string | null;
  capturaMax: string | null;
  admiteNegativos: boolean;
  dimensionId: number | null;
  dimension: string | null;
  activa: boolean;
};

/** Los datos `ids`, activos o no, tomados `FOR KEY SHARE`. */
export async function datosCitados(sql: Cliente, ids: readonly number[]): Promise<Map<number, DatoCitado>> {
  if (ids.length === 0) return new Map();
  const filas = await sql`
    SELECT d.id, d.nombre, d.descripcion, d.fuente, d.unidad, d.periodicidad, d.consolidacion, d.captura_min, d.captura_max,
      d.admite_negativos, d.dimension_id, dim.nombre AS dimension, d.activa
    FROM variables_compartidas d
    LEFT JOIN dimensiones dim ON dim.id = d.dimension_id
    WHERE d.id IN ${sql(unicos(ids))}
    ORDER BY d.id
    FOR KEY SHARE OF d`;
  return new Map(
    filas.map((f) => [
      Number(f.id),
      {
        id: Number(f.id),
        nombre: f.nombre as string,
        descripcion: textoONulo(f.descripcion),
        fuente: textoONulo(f.fuente),
        unidad: textoONulo(f.unidad),
        periodicidad: f.periodicidad as Periodicidad,
        consolidacion: f.consolidacion as Consolidacion,
        capturaMin: textoONulo(f.captura_min),
        capturaMax: textoONulo(f.captura_max),
        admiteNegativos: f.admite_negativos === true,
        dimensionId: idONulo(f.dimension_id),
        dimension: textoONulo(f.dimension),
        activa: f.activa === true,
      },
    ]),
  );
}

/** Un indicador del que sale una variable, con su ficha vigente (la última aprobada, aunque esté retirado). */
export type ComponenteCitado = {
  id: number;
  codigo: string;
  activo: boolean;
  restringido: boolean;
  vigente: { nombre: string; periodicidad: Periodicidad; conMeta: boolean } | null;
};

/** Los indicadores `ids`, en cualquier estado, tomados `FOR KEY SHARE`, con su ficha vigente. */
export async function componentesCitados(sql: Cliente, ids: readonly number[]): Promise<Map<number, ComponenteCitado>> {
  if (ids.length === 0) return new Map();
  const lista = unicos(ids);
  const filas = await sql`SELECT id, codigo, estado, nivel_acceso FROM indicadores WHERE id IN ${sql(lista)} ORDER BY id FOR KEY SHARE`;
  const vigentes = await sql`SELECT DISTINCT ON (indicador_id) indicador_id, nombre, periodicidad, meta FROM indicador_versiones
    WHERE indicador_id IN ${sql(lista)} AND estado = 'aprobada' ORDER BY indicador_id, numero DESC`;
  const vigenteDe = new Map(vigentes.map((v) => [Number(v.indicador_id), v]));
  return new Map(
    filas.map((f) => {
      const v = vigenteDe.get(Number(f.id));
      return [
        Number(f.id),
        {
          id: Number(f.id),
          codigo: f.codigo as string,
          activo: f.estado === "activo",
          restringido: f.nivel_acceso === "restringido",
          vigente: v ? { nombre: (v.nombre as string | null) ?? "", periodicidad: v.periodicidad as Periodicidad, conMeta: v.meta !== null } : null,
        },
      ];
    }),
  );
}

/** Lo que cita la ficha vigente del indicador: contra eso una cita es nueva (anexo 14C, §4.2 y §6.1). */
export type CitasDeLaVigente = { datos: ReadonlySet<number>; componentes: ReadonlySet<number>; dimensionId: number | null };

const SIN_CITAS: CitasDeLaVigente = { datos: new Set(), componentes: new Set(), dimensionId: null };

/** Lo que cita la ficha vigente del indicador; nada si aún no tiene una aprobada (o si es una ficha nueva, `null`). */
export async function citasDeLaVigente(sql: Cliente, indicadorId: number | null): Promise<CitasDeLaVigente> {
  if (indicadorId === null) return SIN_CITAS;
  const [vigente] = await sql`SELECT id, dimension_id FROM indicador_versiones
    WHERE indicador_id = ${indicadorId} AND estado = 'aprobada' ORDER BY numero DESC LIMIT 1`;
  if (!vigente) return SIN_CITAS;
  const filas = await sql`SELECT variable_compartida_id, indicador_origen_id FROM indicador_variables WHERE version_id = ${vigente.id}`;
  const de = (columna: "variable_compartida_id" | "indicador_origen_id") =>
    new Set(filas.filter((f) => f[columna] !== null).map((f) => Number(f[columna])));
  return { datos: de("variable_compartida_id"), componentes: de("indicador_origen_id"), dimensionId: idONulo(vigente.dimension_id) };
}

/** ¿La variable cita un dato o un indicador que la ficha vigente no citaba? */
export function esCitaNueva(
  v: { origen: OrigenVariable; datoId: number | null; indicadorOrigenId: number | null },
  citas: CitasDeLaVigente,
): boolean {
  if (v.origen === "compartida") return v.datoId === null || !citas.datos.has(v.datoId);
  if (v.origen === "indicador") return v.indicadorOrigenId === null || !citas.componentes.has(v.indicadorOrigenId);
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// La revisión
// ─────────────────────────────────────────────────────────────────────────────

export type FichaConOrigenes = {
  /** `null` en una ficha nueva, que aún no tiene indicador. */
  indicadorId: number | null;
  periodicidad: Periodicidad;
  restringido: boolean;
  automatica: boolean;
  objetivoClase: ClaseDeObjetivo | null;
  /** El alcance, si la ficha es automática de «Objetivos cumplidos»: cuenta los indicadores que apuntan a esa clase. */
  cuentaObjetivos: AlcanceDeObjetivos | null;
  dimensionId: number | null;
  /** La fórmula usa min, max o abs (`errorDeDesagregacion`). */
  conFuncionesNoSumables: boolean;
  variables: {
    letra: string;
    origen: OrigenVariable;
    datoId: number | null;
    indicadorOrigenId: number | null;
    toma: Toma | null;
    /** Cita un dato o un indicador que la ficha vigente no citaba (`esCitaNueva`). */
    citaNueva: boolean;
    /** Lo que la versión guardada copió del dato; `null` cuando la ficha aún no se ha escrito (al guardarla). */
    firmado: { datoPeriodicidad: Periodicidad | null; consolidacion: Consolidacion } | null;
  }[];
};

/** Lo que una ficha dice de los objetivos: a qué clase apunta y, si es de «Objetivos cumplidos», cuáles cuenta. */
export type ClasesDeFicha = { objetivoClase: ClaseDeObjetivo | null; cuentaObjetivos: AlcanceDeObjetivos | null };

export type OpcionesDeRevision = {
  /** Los componentes de estos indicadores, en lugar de los de su ficha vigente. */
  sustituir?: ReadonlyMap<number, readonly number[]>;
  /** Lo que estos indicadores dicen de los objetivos, en lugar de lo que dice su ficha vigente. */
  clases?: ReadonlyMap<number, ClasesDeFicha>;
};

/**
 * El primer rechazo que aplique a los orígenes de la ficha, o `null`: el dato de cada variable compartida, el indicador de
 * cada variable tomada, el grafo (ciclos, niveles y «Objetivos cumplidos», con las fichas de `sustituir` y `clases` en lugar
 * de sus vigentes) y la desagregación. Solo una cita nueva exige que el dato, el indicador y la dimensión estén activos; la
 * que la ficha vigente ya traía sigue valiendo.
 */
export async function revisarOrigenes(tx: Cliente, f: FichaConOrigenes, opciones?: OpcionesDeRevision): Promise<string | null> {
  const compartidas = f.variables.filter((v) => v.origen === "compartida");
  const tomadas = f.variables.filter((v) => v.origen === "indicador");

  const datos = await datosCitados(tx, compartidas.flatMap((v) => (v.datoId === null ? [] : [v.datoId])));
  for (const v of compartidas) {
    const dato = v.datoId === null ? undefined : datos.get(v.datoId);
    if (!dato || (!dato.activa && v.citaNueva)) return `Elija un dato compartido activo para la variable ${v.letra}`;
    const cambio =
      v.firmado !== null &&
      (v.firmado.datoPeriodicidad !== dato.periodicidad || v.firmado.consolidacion !== dato.consolidacion || f.dimensionId !== dato.dimensionId);
    if (v.citaNueva && cambio) return `El dato «${dato.nombre}» cambió desde que se guardó esta ficha: guárdela de nuevo`;
    if (!contiene(f.periodicidad, dato.periodicidad)) {
      return `El dato «${dato.nombre}» es ${ADJETIVO[dato.periodicidad]}: el indicador debe medirse con esa periodicidad o con una que la contenga`;
    }
  }

  const componentes = await componentesCitados(tx, tomadas.flatMap((v) => (v.indicadorOrigenId === null ? [] : [v.indicadorOrigenId])));
  for (const v of tomadas) {
    if (v.indicadorOrigenId === null || v.toma === null) return `Elija el indicador del que sale la variable ${v.letra} y qué se toma de él`;
    // Antes que «activo»: un indicador en borrador que se toma a sí mismo no está activo, pero lo que falla es tomarse.
    if (v.indicadorOrigenId === f.indicadorId) return "Un indicador no puede tomar su propio resultado";
    const c = componentes.get(v.indicadorOrigenId);
    if (!c || c.vigente === null || (!c.activo && v.citaNueva)) return `El indicador de la variable ${v.letra} debe estar activo y tener ficha vigente`;
    if (!contiene(f.periodicidad, c.vigente.periodicidad)) {
      return `El indicador de la variable ${v.letra} se mide con una periodicidad más gruesa que la de esta ficha`;
    }
    if (v.toma === "cumplimiento" && !c.vigente.conMeta) return `No se puede tomar el cumplimiento de un indicador sin meta (variable ${v.letra})`;
    if (c.restringido && !f.restringido) return "Esta ficha toma un indicador restringido: debe ser restringida";
  }

  // Sin variables tomadas la ficha no añade aristas: no cierra ciclos ni alarga cadenas (la importación pasa por aquí por
  // fila). Una de «Objetivos cumplidos» sí puede cerrar el ciclo oculto: con los que la alcanzan y apuntan a lo que cuenta.
  if (tomadas.length > 0 || (f.cuentaObjetivos !== null && f.indicadorId !== null)) {
    const error = await revisarGrafo(tx, f, tomadas.map((v) => v.indicadorOrigenId!), opciones);
    if (error) return error;
  }

  if (f.dimensionId === null) {
    for (const v of compartidas) {
      const dato = datos.get(v.datoId!)!;
      if (dato.dimensionId !== null) return `El dato «${dato.nombre}» está desagregado por ${dato.dimension}: desagregue el indicador por ella`;
    }
    return null;
  }
  if (f.automatica) return "Un indicador que calcula el sistema no se desagrega";
  if (tomadas.length > 0) return "Un indicador desagregado no puede tomar el resultado de otro indicador";
  const [dimension] = await tx`SELECT nombre, activo FROM dimensiones WHERE id = ${f.dimensionId} FOR KEY SHARE`;
  if (!dimension) return DIMENSION_ACTIVA;
  for (const v of compartidas) {
    const dato = datos.get(v.datoId!)!;
    if (dato.dimensionId !== f.dimensionId) return `El dato «${dato.nombre}» no está desagregado por ${dimension.nombre as string}`;
  }
  if (!dimension.activo && (await citasDeLaVigente(tx, f.indicadorId)).dimensionId !== f.dimensionId) return DIMENSION_ACTIVA;
  if (f.conFuncionesNoSumables) return FORMULA_NO_DESAGREGABLE;
  return null;
}

/**
 * Con el grafo ya sustituido: sin ciclos; a lo sumo `MAXIMO_NIVELES` por debajo de la ficha y de cada indicador que la
 * alcanza (tomar un componente más a mitad de una cadena alarga la de los que están encima); y sin la arista oculta de
 * «Objetivos cumplidos», que cuenta los indicadores que apuntan a un objetivo de su clase. Esa arista cierra un ciclo cuando
 * un indicador que apunta a una clase llega, tomando componentes, a uno que la cuenta. Con esta ficha en él, hay tres
 * formas: la ficha llega a uno que cuenta su clase; uno que la alcanza llega, a través de ella, a uno que cuenta la suya; o
 * la ficha es de «Objetivos cumplidos» y la alcanza uno que apunta a lo que ella cuenta. La ficha dice lo suyo (`f`), las de
 * `clases` lo suyo, y los demás, lo de su ficha vigente.
 */
async function revisarGrafo(tx: Cliente, f: FichaConOrigenes, componentes: number[], opciones?: OpcionesDeRevision): Promise<string | null> {
  const propio = f.indicadorId ?? FICHA_NUEVA;
  const reemplazos = new Map<number, readonly number[]>(opciones?.sustituir ?? []);
  reemplazos.set(propio, componentes);
  const aristas = await aristasDeComponentes(tx, { sustituir: reemplazos });
  if (caminoDeCiclo(aristas, propio) !== null) return CICLO;
  const destino = new Set([propio]);
  const arriba = [...aristas.keys()].filter((n) => n !== propio && alcanza(aristas, n, destino));
  if ([propio, ...arriba].some((n) => nivelesBajo(aristas, n) > MAXIMO_NIVELES)) return NIVELES;

  const cuentan = await fichasDeObjetivosCumplidos(tx);
  const clases = new Map<number, ClasesDeFicha>(opciones?.clases ?? []);
  clases.set(propio, { objetivoClase: f.objetivoClase, cuentaObjetivos: f.cuentaObjetivos });
  for (const [id, c] of clases) {
    if (c.cuentaObjetivos === null) cuentan.delete(id);
    else cuentan.set(id, c.cuentaObjetivos);
  }
  if (cuentan.size === 0) return null;
  const llegaA = (clase: ClaseDeObjetivo) =>
    alcanza(aristas, propio, new Set([...cuentan].filter(([, a]) => cuentaLaClase(a, clase)).map(([id]) => id)));
  if (f.objetivoClase !== null && llegaA(f.objetivoClase)) {
    return "Esta ficha toma «Objetivos cumplidos»: no puede apuntar a un objetivo de esa misma clase";
  }
  if (arriba.length === 0) return null;

  const claseDe = new Map<number, ClaseDeObjetivo | null>();
  const deLaVigente = arriba.filter((n) => !clases.has(n));
  if (deLaVigente.length > 0) {
    const filas = await tx`SELECT vig.indicador_id, o.clase
      FROM indicador_versiones vig
      JOIN objetivos o ON o.id = vig.objetivo_id
      WHERE vig.indicador_id IN ${tx(deLaVigente)} AND vig.estado = 'aprobada'
        AND vig.numero = (SELECT max(w.numero) FROM indicador_versiones w WHERE w.indicador_id = vig.indicador_id AND w.estado = 'aprobada')`;
    for (const x of filas) claseDe.set(Number(x.indicador_id), x.clase as ClaseDeObjetivo);
  }
  for (const n of arriba) if (clases.has(n)) claseDe.set(n, clases.get(n)!.objetivoClase);
  const deArriba = [...new Set([...claseDe.values()].filter((c): c is ClaseDeObjetivo => c !== null))];
  // Uno que la alcanza llega a lo que ella llega: si apunta a una clase que ella alcanza a contar, el ciclo es suyo.
  if (deArriba.some(llegaA)) return CICLO;
  // Ella cuenta a uno que la alcanza.
  const cuenta = f.cuentaObjetivos;
  if (cuenta !== null && deArriba.some((c) => cuentaLaClase(cuenta, c))) return CICLO;
  return null;
}

/** Los orígenes de una versión guardada, para revisarla al enviarla o aprobarla: la cita nueva, contra la vigente. */
export async function origenesDeVersion(tx: Cliente, versionId: number): Promise<FichaConOrigenes> {
  const [v] = await tx`SELECT v.indicador_id, v.periodicidad, v.origen_dato, v.calculo, v.calculo_alcance, v.dimension_id, v.forma,
      v.formula, i.nivel_acceso, o.clase AS objetivo_clase
    FROM indicador_versiones v
    JOIN indicadores i ON i.id = v.indicador_id
    LEFT JOIN objetivos o ON o.id = v.objetivo_id
    WHERE v.id = ${versionId}`;
  if (!v) throw new ErrorIndicador("La ficha no existe");
  const indicadorId = Number(v.indicador_id);
  const filas = await tx`SELECT letra, origen, variable_compartida_id, indicador_origen_id, toma, dato_periodicidad, consolidacion
    FROM indicador_variables WHERE version_id = ${versionId} ORDER BY orden, letra`;
  const citas = await citasDeLaVigente(tx, indicadorId);
  return {
    indicadorId,
    periodicidad: v.periodicidad as Periodicidad,
    restringido: v.nivel_acceso === "restringido",
    automatica: v.origen_dato === "automatico",
    objetivoClase: (v.objetivo_clase as ClaseDeObjetivo | null) ?? null,
    cuentaObjetivos: cuentaObjetivosDe(v.origen_dato === "automatico" ? textoONulo(v.calculo) : null, textoONulo(v.calculo_alcance)),
    dimensionId: idONulo(v.dimension_id),
    conFuncionesNoSumables: errorDeDesagregacion({ forma: v.forma as Forma, formula: textoONulo(v.formula) }) !== null,
    variables: filas.map((x) => {
      const variable = {
        letra: x.letra as string,
        origen: x.origen as OrigenVariable,
        datoId: idONulo(x.variable_compartida_id),
        indicadorOrigenId: idONulo(x.indicador_origen_id),
        toma: (x.toma as Toma | null) ?? null,
      };
      return {
        ...variable,
        citaNueva: esCitaNueva(variable, citas),
        firmado: { datoPeriodicidad: (x.dato_periodicidad as Periodicidad | null) ?? null, consolidacion: x.consolidacion as Consolidacion },
      };
    }),
  };
}
