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
import { FIJOS_DE_VERIFICACION, fuenteDeVerificacion } from "@/lib/mejoramiento/enganches";
import type { ParametrosDeRegistro } from "@/lib/mejoramiento/rutas";
import { puede } from "@/lib/permisos";
import { hallazgoParaAbrir } from "./enganche-verificacion";
import { leerMarca, puedeResolverMarca, textosDeLaMarca } from "./marcas-base";
import type { DatosDeHallazgo } from "./registro";

export type { ParametrosDeRegistro } from "@/lib/mejoramiento/rutas";

/**
 * Lo que el formulario de registro recibe puesto: `valores`, lo propuesto (editable, salvo lo que esté en `fijos`); `fijos`, los
 * campos que se muestran como texto con su campo oculto y no se editan; `ocultos`, los campos ocultos que viajan con el envío
 * (el `planId`); y `rotulo`, la línea (o las líneas, separadas por un salto) que el formulario muestra arriba. `procesos`, si llega,
 * son los únicos procesos entre los que se elige (los del punto de un hallazgo de verificación, anexo §7.2); sin él, todos los que la
 * persona alcanza.
 */
export type Prellenado = {
  valores: Partial<DatosDeHallazgo>;
  fijos: ReadonlyArray<keyof DatosDeHallazgo>;
  ocultos: Record<string, string>;
  rotulo: string | null;
  procesos?: readonly number[];
};

/** Lo que pone una parte que no reconoce o no admite su parámetro: nada. Congelado: se comparte entre todas. */
export const PRELLENADO_VACIO: Prellenado = Object.freeze({
  valores: Object.freeze({}),
  fijos: Object.freeze([]),
  ocultos: Object.freeze({}),
  rotulo: null,
});

/**
 * `ahora`, para las ramas que lo necesiten. La de una medición marcada no lo usa: propone el registro tanto para un pendiente como
 * para una marca que espera su análisis (el registro deja su salida en los dos casos, anexo §6.3).
 */
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

/** El rótulo de la no conformidad que nace de un hallazgo de verificación (anexo §7.2). */
export const rotuloDeVerificacion = (punto: string) =>
  `Nace del hallazgo de verificación de ${punto}: la corrección es la de ese hallazgo y, aceptada, pasa directo a «Por formular».`;

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
 * `medicion` (anexo §6.2 y §10.3): la medición marcada sin salida en vigor (un pendiente, o una que todavía espera su análisis: el
 * registro deja su salida en los dos casos, §6.3) de un indicador que la persona ve y cuya marca puede resolver con un hallazgo (el
 * Admin SGC, o un líder activo de su proceso; `puedeResolverMarca`). Propone el origen «Indicador», el proceso del indicador (si
 * puede registrar en él) y su subproceso vigente, el título (el nombre y el periodo) y la descripción (la frase del resultado);
 * fija el indicador y la medición, y la medición viaja oculta (`marcaMedicionId`), que el registro vuelve a validar. Las mismas
 * lecturas de `registrarHallazgo` (`leerMarca`), sin candado.
 */
async function deLaMedicion(l: Lectura, valor: string): Promise<Prellenado> {
  const id = idDe(valor);
  const m = id === null ? null : await leerMarca(l.sql, l.sesion, id);
  if (!m || !m.marcada || m.decidida) return PRELLENADO_VACIO;
  if (!(await puedeResolverMarca(l.sql, l.sesion, { id: m.indicadorId, procesoId: m.procesoId })).hallazgo) return PRELLENADO_VACIO;
  const proceso = await procesoDondeRegistra(l, m.procesoId);
  const { titulo, descripcion } = textosDeLaMarca(m);
  return {
    valores: {
      origen: "indicador",
      ...proceso,
      ...("procesoId" in proceso && m.subprocesoId !== null ? { subprocesoId: m.subprocesoId } : {}),
      indicadorId: m.indicadorId,
      medicionId: m.medicionId,
      titulo,
      descripcion,
    },
    fijos: ["indicadorId", "medicionId"],
    ocultos: { marcaMedicionId: String(m.medicionId) },
    rotulo: null,
  };
}

/**
 * `verificacion` (anexo §7.2 y §10.3): un hallazgo de verificación de Distribución que la persona ve (`filtroPuntos`) y que no tiene
 * una no conformidad que cuente, solo para el Admin SGC (`mejora.gestionar`). Fija la clase (no conformidad) y el origen («Control
 * documental»); propone la fuente («Verificación del punto …»), su documento en «A qué se refiere» (si tiene versión vigente y la
 * persona lo ve, la regla de `delDocumento`), su descripción y el día en que se abrió; ofrece solo los procesos activos del punto
 * (`procesos`; sin ninguno, todos) y propone el único, si es uno. El hallazgo viaja oculto (`verificacionHallazgoId`) y el formulario
 * pide entonces la justificación de la acción correctiva; el registro lo vuelve a validar todo dentro de su transacción.
 */
async function deLaVerificacion(l: Lectura, valor: string): Promise<Prellenado> {
  const id = idDe(valor);
  if (id === null || !puede(l.sesion, "mejora.gestionar")) return PRELLENADO_VACIO;
  const vh = await hallazgoParaAbrir(l.sql, l.sesion, id);
  if (!vh || vh.yaTiene) return PRELLENADO_VACIO;
  const [d] =
    vh.documentoId === null
      ? []
      : await l.sql`SELECT d.id FROM documentos d
          WHERE d.id = ${vh.documentoId}
            AND EXISTS (SELECT 1 FROM documento_versiones v WHERE v.documento_id = d.id AND v.estado = 'vigente')
            AND ${filtroAcceso(l.sql, l.sesion)}`;
  return {
    valores: {
      ...FIJOS_DE_VERIFICACION,
      fuente: fuenteDeVerificacion(vh.punto),
      ...(d ? { documentoId: Number(d.id) } : {}),
      descripcion: vh.descripcion,
      detectadoEn: vh.detectadoEn,
      ...(vh.procesos.length === 1 ? { procesoId: vh.procesos[0] } : {}),
    },
    fijos: ["clase", "origen"],
    ocultos: { verificacionHallazgoId: String(vh.id) },
    rotulo: rotuloDeVerificacion(vh.punto),
    ...(vh.procesos.length > 0 ? { procesos: vh.procesos } : {}),
  };
}

/**
 * El enganche que se usa (`engancheDe`). Cada uno añade aquí su rama: `medicion`, la Tarea 8 (la marca «Requiere acción de mejora»,
 * anexo §6.3); `verificacion`, la Tarea 10 (§7.2); `impacto` e `impactoIndicador`, la Tarea 11 (§8). Mientras no la tienen, no
 * ponen nada.
 */
async function delEnganche(l: Lectura, e: { clave: Enganche; valor: string } | null): Promise<Prellenado> {
  if (e === null) return PRELLENADO_VACIO;
  switch (e.clave) {
    case "medicion":
      return deLaMedicion(l, e.valor);
    case "verificacion":
      return deLaVerificacion(l, e.valor);
    case "impacto": // Tarea 11.
    case "impactoIndicador": // Tarea 11.
      return PRELLENADO_VACIO;
  }
}

/**
 * Junta las partes en orden: un valor de una parte posterior reemplaza el de una anterior, salvo que el campo sea fijo, que conserva
 * el valor de la parte que lo fija (la última, si lo fijan dos). Los ocultos se juntan igual y los rótulos van uno por línea. Los
 * `procesos` son los de la última parte que los trae; un proceso propuesto que no está entre ellos no se propone.
 */
export function combinar(partes: readonly Prellenado[]): Prellenado {
  const valores: Record<string, unknown> = {};
  const fijos: Array<keyof DatosDeHallazgo> = [];
  const ocultos: Record<string, string> = {};
  const rotulos: string[] = [];
  let procesos: readonly number[] | undefined;
  for (const p of partes) {
    for (const [k, v] of Object.entries(p.valores)) {
      if (!fijos.includes(k as keyof DatosDeHallazgo) || p.fijos.includes(k as keyof DatosDeHallazgo)) valores[k] = v;
    }
    for (const k of p.fijos) if (!fijos.includes(k)) fijos.push(k);
    Object.assign(ocultos, p.ocultos);
    if (p.rotulo) rotulos.push(p.rotulo);
    if (p.procesos) procesos = p.procesos;
  }
  if (procesos && typeof valores.procesoId === "number" && !procesos.includes(valores.procesoId)) delete valores.procesoId;
  return {
    valores: valores as Partial<DatosDeHallazgo>,
    fijos,
    ocultos,
    rotulo: rotulos.length > 0 ? rotulos.join("\n") : null,
    ...(procesos ? { procesos } : {}),
  };
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
