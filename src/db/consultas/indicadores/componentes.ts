/**
 * De dónde salen las variables de una ficha (anexo 14C, §4.2, §5.2 y §6.1): un dato compartido, el resultado de otro
 * indicador o la desagregación por una dimensión. `revisarOrigenes` es la única revisión, para guardar, enviar y aprobar; el
 * grafo de quién toma a quién se arma con las fichas vigentes de los indicadores activos, sustituyendo las que se guardan o
 * se aprueban (`revisarEnBloque`, con todas las del bloque). Y, del lado del componente (§6.6), quiénes lo toman
 * (`quienesToman`), a quiénes una versión suya ya no les sirve (`aQuienesDejaDeServir`) y el mensaje que lo dice
 * (`cambieAntes`), que lleva el código del otro indicador solo a quien puede verlo. Y si cambiar la clase de un objetivo en
 * el maestro cerraría un ciclo oculto de «Objetivos cumplidos» (`cambiarClaseCierraCiclo`).
 *
 * Módulo liviano: lo importan `fichas`, la aprobación, la operación y los maestros, así que no importa `lectura`, `fichas`, `aprobacion`
 * ni `operacion`, ni `datos`, `dimensiones` o `mediciones` (arrastran la bitácora): lee el dato, el componente, la dimensión,
 * los objetivos y las versiones que rigen por SQL directo. Ningún mensaje de `revisarOrigenes` nombra al indicador de
 * origen: lo dicen por la letra de la variable. Los del dato llevan su nombre y los de la dimensión, el suyo.
 *
 * Candados: el dato, el componente y la dimensión `FOR KEY SHARE`, en orden de id, como las normas de la ficha: quien los
 * cambia (o retira el componente) los toma `FOR UPDATE` y espera. Que guardar una ficha que toma otro indicador lo tome
 * `FOR KEY SHARE` (lo impondría igual su llave foránea al insertar la variable) es la excepción nombrada a «un solo
 * indicador por transacción»: no choca con el `FOR SHARE` del cierre ni de la reapertura en cascada, y el interbloqueo que
 * puede darse entre dos guardados cruzados le llega a la persona legible (`sinInterbloqueoCrudo`).
 */
import type { Cliente } from "@/db/cliente";
import { puedeVerIndicador, type SujetoVisibilidad } from "@/lib/alcance";
import { errorDeDesagregacion, FORMULA_NO_DESAGREGABLE } from "@/lib/indicadores/categorias";
import { alcanza, caminoDeCiclo, nivelesBajo } from "@/lib/indicadores/grafo";
import { contiene, versionQueRigeEntre } from "@/lib/indicadores/periodos";
import {
  ErrorIndicador,
  MAXIMO_NIVELES,
  type Consolidacion,
  type Forma,
  type OrigenVariable,
  type Periodicidad,
  type Toma,
} from "@/lib/indicadores/tipos";
import { zonaHoraria } from "@/lib/zona-horaria";

export type ClaseDeObjetivo = "calidad" | "institucional";
/** A qué objetivos alcanza un cálculo de «Objetivos cumplidos». */
export type AlcanceDeObjetivos = ClaseDeObjetivo | "todos";

/** El nodo de una ficha que aún no tiene indicador (los ids son positivos: nadie la toma). */
const FICHA_NUEVA = 0;

const CICLO = "Esta ficha cerraría un ciclo entre indicadores";
/** El ciclo que solo aparece con las fichas del bloque juntas (`revisarEnBloque`). */
const CICLO_EN_LA_APROBACION = "Esta aprobación cerraría un ciclo entre indicadores";
const OBJETIVOS_DE_SU_CLASE = "Esta ficha toma «Objetivos cumplidos»: no puede apuntar a un objetivo de esa misma clase";
const NIVELES = "Un indicador compuesto admite hasta cinco niveles";
const DIMENSION_ACTIVA = "Elija una dimensión activa";
const CAMBIE_ANTES = "Cambie antes el indicador que lo usa";

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
 * alcanza (tomar un componente más a mitad de una cadena alarga la de los que están encima); y sin ciclos tampoco con las
 * aristas ocultas de «Objetivos cumplidos» (`conAristasOcultas`): esa ficha cuenta, sin tomarlos, los indicadores que apuntan
 * a un objetivo de una clase que ella cuenta, y su resultado depende del de ellos. Los niveles se miden sin esas aristas.
 * Cuando la ficha llega, tomando componentes, a un «Objetivos cumplidos» que cuenta la clase de su propio objetivo, el
 * mensaje lo dice; cualquier otro ciclo que cierren las aristas ocultas (con una sola o con varias, de clases distintas) es
 * el ciclo de siempre. Solo cuenta un ciclo oculto que pasa por la ficha: todo ciclo que ella crea tiene una arista que la
 * toca, y uno ajeno al que solo llega no es suyo (el maestro no deja cerrarlos: `cambiarClaseCierraCiclo`). La ficha dice
 * lo suyo (`f`), las de `clases` lo suyo, y los demás, lo de su ficha vigente.
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
  const suya = f.objetivoClase;
  if (suya !== null && alcanza(aristas, propio, new Set([...cuentan].filter(([, a]) => cuentaLaClase(a, suya)).map(([id]) => id)))) {
    return OBJETIVOS_DE_SU_CLASE;
  }
  return alcanza(await conAristasOcultas(tx, aristas, cuentan, clases), propio, destino) ? CICLO : null;
}

/** Los indicadores activos cuya ficha vigente apunta al objetivo. */
async function apuntanAlObjetivo(tx: Cliente, objetivoId: number): Promise<number[]> {
  const filas = await tx`SELECT i.id FROM indicadores i
    JOIN indicador_versiones vig ON vig.indicador_id = i.id AND vig.estado = 'aprobada'
      AND vig.numero = (SELECT max(w.numero) FROM indicador_versiones w WHERE w.indicador_id = i.id AND w.estado = 'aprobada')
    WHERE i.estado = 'activo' AND vig.objetivo_id = ${objetivoId}
    ORDER BY i.id`;
  return filas.map((f) => Number(f.id));
}

/**
 * ¿Darle al objetivo la clase `clase` cerraría un ciclo oculto de «Objetivos cumplidos»? Con las fichas vigentes y la clase
 * nueva para todo indicador activo que apunta al objetivo: alguno de ellos queda en un ciclo que pasa por él. Un ciclo nuevo
 * solo puede nacer de una arista oculta nueva, y todas llegan a uno de ellos. Quien llama tiene el candado consultivo de
 * las aprobaciones (`maestros.ts`): ninguna ficha se aprueba entre esta revisión y el cambio.
 */
export async function cambiarClaseCierraCiclo(tx: Cliente, objetivoId: number, clase: ClaseDeObjetivo): Promise<boolean> {
  const afectados = await apuntanAlObjetivo(tx, objetivoId);
  if (afectados.length === 0) return false;
  const cuentan = await fichasDeObjetivosCumplidos(tx);
  if (cuentan.size === 0) return false;
  const clases = new Map<number, ClasesDeFicha>(afectados.map((id) => [id, { objetivoClase: clase, cuentaObjetivos: cuentan.get(id) ?? null }]));
  const conOcultas = await conAristasOcultas(tx, await aristasDeComponentes(tx), cuentan, clases);
  return afectados.some((id) => alcanza(conOcultas, id, new Set([id])));
}

/**
 * El grafo con las aristas ocultas de «Objetivos cumplidos» (anexo 14C, §6.1, con la regla de `aportesDelPeriodo`): de cada
 * ficha de ese cálculo (`cuentan`, ya con las de `clases`) a cada indicador activo, distinto de ella y que no use ese mismo
 * cálculo, cuyo objetivo es de una clase que ella cuenta. La clase sale de `clases` (la ficha que se revisa y las del bloque,
 * aunque su indicador siga en borrador) o de la ficha vigente. No mira si el objetivo está activo: uno inactivo puede volver a
 * activarse sin que se apruebe ninguna ficha.
 */
async function conAristasOcultas(
  tx: Cliente,
  aristas: ReadonlyMap<number, readonly number[]>,
  cuentan: ReadonlyMap<number, AlcanceDeObjetivos>,
  clases: ReadonlyMap<number, ClasesDeFicha>,
): Promise<Map<number, number[]>> {
  const filas = await tx`SELECT vig.indicador_id, o.clase
    FROM indicadores i
    JOIN indicador_versiones vig ON vig.indicador_id = i.id AND vig.estado = 'aprobada'
      AND vig.numero = (SELECT max(w.numero) FROM indicador_versiones w WHERE w.indicador_id = i.id AND w.estado = 'aprobada')
    JOIN objetivos o ON o.id = vig.objetivo_id
    WHERE i.estado = 'activo'`;
  const claseDe = new Map<number, ClaseDeObjetivo>(filas.map((x) => [Number(x.indicador_id), x.clase as ClaseDeObjetivo]));
  for (const [id, c] of clases) {
    if (c.objetivoClase === null) claseDe.delete(id);
    else claseDe.set(id, c.objetivoClase);
  }
  const conOcultas = new Map<number, number[]>([...aristas].map(([id, hijos]) => [id, [...hijos]]));
  for (const [id, alcance] of cuentan) {
    const contados = [...claseDe].filter(([n, clase]) => n !== id && !cuentan.has(n) && cuentaLaClase(alcance, clase)).map(([n]) => n);
    if (contados.length > 0) conOcultas.set(id, [...(conOcultas.get(id) ?? []), ...contados]);
  }
  return conOcultas;
}

const componentesDe = (f: FichaConOrigenes) =>
  f.variables.flatMap((v) => (v.origen === "indicador" && v.indicadorOrigenId !== null ? [v.indicadorOrigenId] : []));

/**
 * Las fichas de un bloque de aprobación juntas (anexo 14C, §6.1): cada una con las demás en lugar de las vigentes de sus
 * indicadores, con sus componentes (`sustituir`) y con lo que dicen de los objetivos (`clases`), todas, tomen algo o no.
 * Quien llama ya revisó cada una sola: el ciclo que aparece aquí lo cierra la aprobación. Con una sola ficha, nada.
 */
export async function revisarEnBloque(tx: Cliente, fichas: readonly FichaConOrigenes[]): Promise<string | null> {
  const delBloque = fichas.filter((f): f is FichaConOrigenes & { indicadorId: number } => f.indicadorId !== null);
  if (delBloque.length < 2) return null;
  const opciones: OpcionesDeRevision = {
    sustituir: new Map(delBloque.map((f) => [f.indicadorId, componentesDe(f)])),
    clases: new Map(delBloque.map((f) => [f.indicadorId, { objetivoClase: f.objetivoClase, cuentaObjetivos: f.cuentaObjetivos }])),
  };
  for (const f of delBloque) {
    const error = await revisarOrigenes(tx, f, opciones);
    if (error) return error === CICLO ? CICLO_EN_LA_APROBACION : error;
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Del lado del componente (anexo 14C, §6.6)
// ─────────────────────────────────────────────────────────────────────────────

/** Un indicador que toma el resultado de otro: qué toma, con la periodicidad de la versión que lo cita. */
export type Toman = { indicadorId: number; codigo: string; toma: Toma; periodicidad: Periodicidad; restringido: boolean; enBorrador: boolean };

/**
 * Las versiones aprobadas del indicador que rigen hoy algo suyo, por id: la vigente y la que rige cada medición ordinaria
 * sin cerrar (un histórico se digita completo y no toma nada de otro, §3.6), como `enUso` de `datos.ts` con los datos
 * compartidos. Es el conjunto de `quienesToman` y de abrir un compuesto (`cambiarOperacion`): los dos sentidos del nivel de
 * acceso miran las mismas versiones.
 */
export async function versionesQueRigen(sql: Cliente, indicadorId: number): Promise<number[]> {
  const versiones = (await sql`SELECT id, rige_desde FROM indicador_versiones
    WHERE indicador_id = ${indicadorId} AND estado = 'aprobada' ORDER BY numero DESC`).map((v) => ({ id: Number(v.id), rigeDesde: textoONulo(v.rige_desde) }));
  if (versiones.length === 0) return [];
  const rigen = new Set([versiones[0].id]);
  const zona = zonaHoraria();
  for (const m of await sql`SELECT desde FROM mediciones WHERE indicador_id = ${indicadorId} AND estado <> 'cerrada' AND NOT historica`) {
    const rige = versionQueRigeEntre(versiones, { desde: new Date(m.desde as string) }, zona);
    if (rige) rigen.add(rige.id);
  }
  return [...rigen].sort((a, b) => a - b);
}

/**
 * Quiénes toman el resultado del indicador: los activos con una versión que rige hoy algo suyo (`versionesQueRigen`: la
 * vigente o la de una medición ordinaria sin cerrar) que lo cita. Con `conBorradores`, también los que lo citan en un
 * borrador o en una ficha por aprobar (`enBorrador`). Una fila por indicador, qué toma y periodicidad, por id de indicador.
 * Solo lee: no bloquea a los otros indicadores, que pueden ser varios.
 */
export async function quienesToman(sql: Cliente, indicadorId: number, opciones?: { conBorradores?: boolean }): Promise<Toman[]> {
  const enCurso = opciones?.conBorradores
    ? sql`OR (fv.estado IN ('borrador', 'por_aprobar') AND i.estado IN ('borrador', 'activo'))`
    : sql``;
  const citas = await sql`SELECT i.id AS indicador_id, i.codigo, i.nivel_acceso, fv.id AS version_id, fv.estado, fv.periodicidad, iv.toma
    FROM indicador_variables iv
    JOIN indicador_versiones fv ON fv.id = iv.version_id
    JOIN indicadores i ON i.id = fv.indicador_id
    WHERE iv.indicador_origen_id = ${indicadorId} AND i.id <> ${indicadorId}
      AND ((fv.estado = 'aprobada' AND i.estado = 'activo') ${enCurso})
    ORDER BY i.id, fv.id, iv.toma`;
  // De las aprobadas que lo citan, solo cuentan las que rigen hoy algo del indicador.
  const conAprobadas = new Set(citas.filter((c) => c.estado === "aprobada").map((c) => Number(c.indicador_id)));
  const cuentan = new Set<number>();
  for (const id of conAprobadas) for (const v of await versionesQueRigen(sql, id)) cuentan.add(v);
  const salida = new Map<string, Toman>();
  for (const c of citas) {
    const enBorrador = c.estado !== "aprobada";
    if (!enBorrador && !cuentan.has(Number(c.version_id))) continue;
    const t: Toman = {
      indicadorId: Number(c.indicador_id),
      codigo: c.codigo as string,
      toma: c.toma as Toma,
      periodicidad: c.periodicidad as Periodicidad,
      restringido: c.nivel_acceso === "restringido",
      enBorrador,
    };
    salida.set(`${t.indicadorId}|${t.toma}|${t.periodicidad}|${t.enBorrador}`, t);
  }
  return [...salida.values()];
}

/**
 * A quiénes de `toman` una versión del componente ya no les sirve: no tiene meta y toman su cumplimiento, o se mide con una
 * periodicidad que la de ellos no contiene.
 */
export function aQuienesDejaDeServir(version: { periodicidad: Periodicidad; conMeta: boolean }, toman: readonly Toman[]): Toman[] {
  return toman.filter((t) => (t.toma === "cumplimiento" && !version.conMeta) || !contiene(t.periodicidad, version.periodicidad));
}

/**
 * «Cambie antes el indicador que lo usa», con el código del primero de `toman` que la persona puede ver
 * (`puedeVerIndicador`); si no ve ninguno, sin código: para quien no puede verlo, no existe.
 */
export async function cambieAntes(sujeto: SujetoVisibilidad, toman: readonly Toman[], opciones: { sql: Cliente }): Promise<string> {
  const vistos = new Set<number>();
  for (const t of toman) {
    if (vistos.has(t.indicadorId)) continue;
    vistos.add(t.indicadorId);
    if (await puedeVerIndicador(t.indicadorId, sujeto, { sql: opciones.sql })) return `${CAMBIE_ANTES}: ${t.codigo}`;
  }
  return CAMBIE_ANTES;
}

/**
 * Los indicadores restringidos de los que la versión (o alguna de las versiones) toma una variable, por id (la regla de
 * `aprobadoresDeFicha`). Toma todos sus componentes `FOR KEY SHARE`, como `componentesCitados`, y filtra después: quien
 * restringe uno lo tiene `FOR UPDATE` y esta lectura lo espera (con el filtro en el `WHERE`, uno que se está restringiendo no
 * se esperaría).
 */
export async function componentesRestringidos(sql: Cliente, versiones: number | readonly number[]): Promise<number[]> {
  const ids = typeof versiones === "number" ? [versiones] : [...versiones];
  if (ids.length === 0) return [];
  const filas = await sql`SELECT id, nivel_acceso FROM indicadores
    WHERE id IN (SELECT indicador_origen_id FROM indicador_variables WHERE version_id IN ${sql(ids)})
    ORDER BY id FOR KEY SHARE`;
  return filas.filter((f) => f.nivel_acceso === "restringido").map((f) => Number(f.id));
}
