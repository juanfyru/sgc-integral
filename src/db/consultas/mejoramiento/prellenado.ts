/**
 * Lo que llega puesto al formulario de registro de un hallazgo (Fase 15B, anexo §3.4 camino 1 y §10.3): los parámetros de
 * `/mejoramiento/nuevo` que vienen de otra página (un plan, un documento, un indicador, un proceso y, desde las tareas
 * siguientes, una medición marcada, un hallazgo de verificación y un impacto de norma) se vuelven valores propuestos, campos
 * fijos, campos ocultos y el rótulo que el formulario muestra arriba.
 *
 * **Lo que la persona no puede ver o no puede usar se ignora sin decir por qué** (el patrón de `?revision=`): esa parte no pone
 * nada, sin lanzar, y las demás siguen. Cada regla es la de las listas del formulario (`opciones.ts`), para que lo propuesto esté
 * siempre entre lo que se puede elegir. Lo que llega oculto lo vuelve a validar el registro dentro de su transacción
 * (`registrarHallazgo`, `cargarHallazgo`): esto solo pinta. Solo lecturas, sin candados.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { alcanceProcesos, enAlcance, filtroAcceso, filtroIndicadores, type Alcance } from "@/lib/alcance";
import type { ParametrosDeRegistro } from "@/lib/mejoramiento/rutas";
import { puede } from "@/lib/permisos";
import type { DatosDeHallazgo } from "./registro";

export type { ParametrosDeRegistro } from "@/lib/mejoramiento/rutas";

/**
 * Lo que el formulario de registro recibe puesto: `valores`, lo propuesto (editable, salvo lo que esté en `fijos`); `fijos`, los
 * campos que se muestran como texto con su campo oculto y no se editan; `ocultos`, los campos ocultos que viajan con el envío
 * (el `planId`); y `rotulo`, la línea (o las líneas, separadas por un salto) que el formulario muestra arriba.
 */
export type Prellenado = {
  valores: Partial<DatosDeHallazgo>;
  fijos: ReadonlyArray<keyof DatosDeHallazgo>;
  ocultos: Record<string, string>;
  rotulo: string | null;
};

/** Lo que pone una parte que no reconoce o no admite su parámetro: nada. Congelado: se comparte entre todas. */
export const PRELLENADO_VACIO: Prellenado = Object.freeze({
  valores: Object.freeze({}),
  fijos: Object.freeze([]),
  ocultos: Object.freeze({}),
  rotulo: null,
});

/** `ahora`, para las ramas que lo necesiten (la marca de una medición, Tarea 8). */
export type OpcionesDePrellenado = { sql?: Cliente; ahora?: Date };

/** Los enganches de otros módulos, en su orden de precedencia: si llega más de uno, se usa el primero. */
export const ENGANCHES = ["medicion", "verificacion", "impacto", "impactoIndicador"] as const;
export type Enganche = (typeof ENGANCHES)[number];

/**
 * El enganche que se usa: el primero de `ENGANCHES` que llega (no vacío), sirva o no. Uno que no sirve no cede su lugar al
 * siguiente: el resultado no depende de qué ve la persona.
 */
export function engancheDe(p: ParametrosDeRegistro): { clave: Enganche; valor: string } | null {
  for (const clave of ENGANCHES) {
    const valor = p[clave];
    if (typeof valor === "string" && valor !== "") return { clave, valor };
  }
  return null;
}

/** Un id de la dirección: solo cifras, como `/^\d{1,15}$/`; si no, nulo. */
const idDe = (v: string | undefined): number | null => (typeof v === "string" && /^\d{1,15}$/.test(v) && Number(v) > 0 ? Number(v) : null);

/** Un código o un slug de la dirección, recortado; uno vacío o demasiado largo no es ninguno. */
const claveDe = (v: string | undefined): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t !== "" && t.length <= 100 ? t : null;
};

/** El rótulo de un hallazgo que se registra dentro de un plan. */
export const rotuloDePlan = (codigo: string) => `Se registra dentro del plan ${codigo}`;

type Lectura = { sql: Cliente; sesion: SesionFlujo; alcance: () => Promise<Alcance> };

/**
 * El proceso que se propone, solo si la persona puede registrar en él: activo y en su alcance (`alcanceProcesos`: el líder, los
 * suyos; los demás, todos). Una sola regla para `proceso`, `documento` e `indicador`: el líder que ve un documento general de otro
 * proceso recibe el documento, no el proceso.
 */
async function procesoDondeRegistra(l: Lectura, procesoId: number | null): Promise<{ procesoId: number } | Record<string, never>> {
  if (procesoId === null) return {};
  const [p] = await l.sql`SELECT activo FROM procesos WHERE id = ${procesoId}`;
  return p?.activo === true && enAlcance(await l.alcance(), procesoId) ? { procesoId } : {};
}

/**
 * `plan` (anexo §3.4, camino 1): con `mejora.planes` y un plan que existe y no está anulado, propone su origen, su nombre como
 * fuente, su fecha límite del ente y su objetivo (si sigue activo: uno inactivo no se elige de nuevo), todos editables, y el plan
 * viaja oculto. La misma regla de `bloquearPlanDelRegistro`, sin candado.
 */
async function delPlan(l: Lectura, valor: string | undefined): Promise<Prellenado> {
  const id = idDe(valor);
  if (id === null || !puede(l.sesion, "mejora.planes")) return PRELLENADO_VACIO;
  const [p] = await l.sql`SELECT p.id, p.codigo, p.nombre, p.origen, to_char(p.fecha_limite_ente, 'YYYY-MM-DD') AS limite,
      o.id AS objetivo_id
    FROM mejora_planes p LEFT JOIN objetivos o ON o.id = p.objetivo_id AND o.activo
    WHERE p.id = ${id} AND p.anulado_en IS NULL`;
  if (!p) return PRELLENADO_VACIO;
  return {
    valores: {
      origen: p.origen as DatosDeHallazgo["origen"],
      fuente: p.nombre as string,
      ...(p.limite ? { fechaLimiteEnte: p.limite as string } : {}),
      ...(p.objetivo_id !== null ? { objetivoId: Number(p.objetivo_id) } : {}),
    },
    fijos: [],
    ocultos: { planId: String(Number(p.id)) },
    rotulo: rotuloDePlan(p.codigo as string),
  };
}

/**
 * `documento` (anexo §10.3), por su código: uno con versión vigente que la persona ve (`filtroAcceso`, la regla de
 * `documentosVigentesVisibles`), y su proceso propietario si puede registrar en él.
 */
async function delDocumento(l: Lectura, valor: string | undefined): Promise<Prellenado> {
  const codigo = claveDe(valor);
  if (codigo === null) return PRELLENADO_VACIO;
  const [d] = await l.sql`SELECT d.id, coalesce(dp.proceso_id, s.proceso_id) AS proceso_id FROM documentos d
      LEFT JOIN documento_proceso dp ON dp.documento_id = d.id AND dp.es_principal
      LEFT JOIN subprocesos s ON s.id = dp.subproceso_id
    WHERE d.codigo = ${codigo}
      AND EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
      AND ${filtroAcceso(l.sql, l.sesion)}`;
  if (!d) return PRELLENADO_VACIO;
  const proceso = await procesoDondeRegistra(l, d.proceso_id === null ? null : Number(d.proceso_id));
  return { ...PRELLENADO_VACIO, valores: { documentoId: Number(d.id), ...proceso } };
}

/**
 * `indicador` (anexo §10.3), por su código: uno activo o retirado que la persona ve (`filtroIndicadores`, la regla de
 * `indicadoresConMediciones`), y su proceso si puede registrar en él.
 */
async function delIndicador(l: Lectura, valor: string | undefined): Promise<Prellenado> {
  const codigo = claveDe(valor);
  if (codigo === null) return PRELLENADO_VACIO;
  const [i] = await l.sql`SELECT i.id, i.proceso_id FROM indicadores i
    WHERE i.codigo = ${codigo} AND i.estado IN ('activo', 'retirado') AND ${filtroIndicadores(l.sql, l.sesion)}`;
  if (!i) return PRELLENADO_VACIO;
  const proceso = await procesoDondeRegistra(l, Number(i.proceso_id));
  return { ...PRELLENADO_VACIO, valores: { indicadorId: Number(i.id), ...proceso } };
}

/** `proceso` (anexo §10.3), por su slug: uno activo donde la persona puede registrar. */
async function delProceso(l: Lectura, valor: string | undefined): Promise<Prellenado> {
  const slug = claveDe(valor);
  if (slug === null) return PRELLENADO_VACIO;
  const [p] = await l.sql`SELECT id FROM procesos WHERE slug = ${slug}`;
  if (!p) return PRELLENADO_VACIO;
  const proceso = await procesoDondeRegistra(l, Number(p.id));
  return "procesoId" in proceso ? { ...PRELLENADO_VACIO, valores: proceso } : PRELLENADO_VACIO;
}

/**
 * El enganche que se usa (`engancheDe`). Cada uno añade aquí su rama: `medicion`, la Tarea 8 (la marca «Requiere acción de mejora»,
 * anexo §6.3); `verificacion`, la Tarea 10 (§7.2); `impacto` e `impactoIndicador`, la Tarea 11 (§8). Mientras no la tienen, no
 * ponen nada.
 */
async function delEnganche(_l: Lectura, e: { clave: Enganche; valor: string } | null): Promise<Prellenado> {
  if (e === null) return PRELLENADO_VACIO;
  switch (e.clave) {
    case "medicion": // Tarea 8.
    case "verificacion": // Tarea 10.
    case "impacto": // Tarea 11.
    case "impactoIndicador": // Tarea 11.
      return PRELLENADO_VACIO;
  }
}

/**
 * Junta las partes en orden: un valor de una parte posterior reemplaza el de una anterior, salvo que el campo sea fijo, que conserva
 * el valor de la parte que lo fija (la última, si lo fijan dos). Los ocultos se juntan igual y los rótulos van uno por línea.
 */
export function combinar(partes: readonly Prellenado[]): Prellenado {
  const valores: Record<string, unknown> = {};
  const fijos: Array<keyof DatosDeHallazgo> = [];
  const ocultos: Record<string, string> = {};
  const rotulos: string[] = [];
  for (const p of partes) {
    for (const [k, v] of Object.entries(p.valores)) {
      if (!fijos.includes(k as keyof DatosDeHallazgo) || p.fijos.includes(k as keyof DatosDeHallazgo)) valores[k] = v;
    }
    for (const k of p.fijos) if (!fijos.includes(k)) fijos.push(k);
    Object.assign(ocultos, p.ocultos);
    if (p.rotulo) rotulos.push(p.rotulo);
  }
  return { valores: valores as Partial<DatosDeHallazgo>, fijos, ocultos, rotulo: rotulos.length > 0 ? rotulos.join("\n") : null };
}

/**
 * Lo que llega puesto al formulario de registro (y al de la carga) desde los parámetros de la dirección. Resuelve `plan`,
 * `documento`, `indicador` y `proceso`, y el primero de los enganches; lo que no reconoce o no admite, lo ignora. Las partes se
 * juntan de menor a mayor precedencia: el plan, el documento, el indicador, el proceso explícito y, al final, el enganche, que es el
 * que fija campos.
 */
export async function prellenadoDeRegistro(
  sesion: SesionFlujo,
  p: ParametrosDeRegistro,
  opciones?: OpcionesDePrellenado,
): Promise<Prellenado> {
  const sql = opciones?.sql ?? obtenerSql();
  let alcance: Promise<Alcance> | null = null;
  const l: Lectura = { sql, sesion, alcance: () => (alcance ??= alcanceProcesos(sesion, { sql })) };
  const partes = await Promise.all([
    delPlan(l, p.plan),
    delDocumento(l, p.documento),
    delIndicador(l, p.indicador),
    delProceso(l, p.proceso),
    delEnganche(l, engancheDe(p)),
  ]);
  return combinar(partes);
}
