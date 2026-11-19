/**
 * El SGC-FO-14, plan de mejoramiento (Fase 15B, anexo §5): lo que imprime, de un plan para uno de sus procesos (`fo14DePlan`) o
 * consolidado de un proceso en un año (`fo14Consolidado`). El encabezado del formato, el del plan, las filas del plan de acción
 * (`filasDePlanDeAccion`, la lectura común con el Excel para el ente) y «Aprobación y control». Lo imprime quien ve completos todos
 * sus hallazgos (§5.5, F15B-DC44): quien ve todo, o el líder de ese proceso (`procesosQueImprime`, en `src/lib/alcance.ts` con las
 * demás reglas de visibilidad de los hallazgos: la parte de `vistaCompletaDeHallazgo` que no depende del hallazgo, porque el impreso
 * tiene que salir entero, también cuando no trae ninguno). Para los demás, y para un plan o
 * un proceso que no existe, nulo: la página responde «no encontrado» igual en los dos casos. Imprimir no se audita, como los
 * impresos de la 15A.
 */
import { obtenerSql, type Cliente } from "@/db/cliente";
import type { SesionFlujo } from "@/db/consultas/flujo/contrato";
import { filtroPlanes, procesosQueImprime, type SujetoVisibilidad } from "@/lib/alcance";
import { ETIQUETA_ORIGEN, ORIGENES } from "@/lib/mejoramiento/origenes";
import { NO_CUENTAN_PARA_PLAN } from "@/lib/mejoramiento/planes";
import type { Origen } from "@/lib/mejoramiento/tipos";
import { fechaEnZona } from "@/lib/tramites/plazos";
import { zonaHoraria } from "@/lib/zona-horaria";
import { filasDePlanDeAccion, type FilaDePlanDeAccion } from "./filas-de-plan";
import { encabezadoDeFormato, responsablesDelProceso, type EncabezadoDelFormato } from "./formatos";

type Opciones = { sql?: Cliente; ahora?: Date };

/** El origen y el código del plan de un consolidado (anexo §5.2): no hay plan del que tomarlos. */
export const CONSOLIDADO_DEL_PROCESO = "Consolidado del proceso";

/** Los años que se imprimen en un consolidado: los de toda fecha de día del módulo (spec 15 §13). */
export const ANIO_MINIMO = 2000;
export const ANIO_MAXIMO = 2100;

/** El rol que declaró quien cargó un hallazgo ya en curso (spec 15 §15), como lo nombran el formulario de la carga y su página. */
const ROL_EN_PAPEL: Readonly<Record<string, string>> = { admin_sgc: "Coordinador del SGC", gerencia: "Gerencia" };

export type Fo14 = {
  forma: "plan" | "consolidado";
  formato: EncabezadoDelFormato | null;
  encabezado: {
    origenDelPlan: string;
    codigoDelPlan: string;
    macroproceso: string;
    proceso: string;
    responsables: Array<{ nombre: string; cargo: string | null }>;
    vigencia: number;
    elaboradoEl: string;
    fuentes: Origen[];
    objetivo: string | null;
  };
  filas: FilaDePlanDeAccion[];
  aprobaciones: Array<{
    codigo: string;
    elaboro: { nombre: string; cargo: string | null } | null;
    aprobo: { nombre: string; cargo: string | null; fecha: string } | null;
    fuera: { rol: string; fecha: string } | null;
  }>;
};

const idValido = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Quién imprime: la regla de `procesosQueImprime` (`src/lib/alcance.ts`), para un proceso. */
async function imprimeElProceso(sql: Cliente, sujeto: SujetoVisibilidad, procesoId: number): Promise<boolean> {
  return (await procesosQueImprime(sujeto, [procesoId], { sql })).length === 1;
}

/** El nombre del proceso y el de su macroproceso, o nulo si el proceso no existe. */
async function procesoDelImpreso(sql: Cliente, procesoId: number): Promise<{ proceso: string; macroproceso: string } | null> {
  const [p] = await sql`SELECT p.nombre, m.nombre AS macroproceso FROM procesos p JOIN macroprocesos m ON m.id = p.macroproceso_id
    WHERE p.id = ${procesoId}`;
  return p ? { proceso: p.nombre as string, macroproceso: p.macroproceso as string } : null;
}

type Firma = { firma: string; ronda: number; nombre: string; cargo: string | null; dia: string };

/**
 * «Aprobación y control» (anexo §5.4): una línea por hallazgo con plan de acción aprobado, en el orden de `hallazgoIds`. La ronda en
 * vigor es la última con su plan aprobado; de ella, las firmas de su envío vigente (desde su última «Elaboró», como `firmasDelPlan`):
 * «Elaboró» y quien aprobó, que es «Revisó» cuando la revisión valió como aprobación (`aprobado_rol` del Admin SGC) y «Aprobó» de
 * Gerencia si no. Una ronda aprobada en papel (un hallazgo cargado) no tiene firmas del sistema: lleva el rol que se declaró y el día.
 * Dos consultas para todos los hallazgos.
 */
async function aprobacionesDe(sql: Cliente, hallazgoIds: readonly number[], zona: string): Promise<Fo14["aprobaciones"]> {
  if (hallazgoIds.length === 0) return [];
  const ids = sql.array([...hallazgoIds]);
  const [rondas, firmas] = await Promise.all([
    sql`SELECT DISTINCT ON (r.hallazgo_id) r.hallazgo_id, h.codigo, r.numero, r.aprobado_rol, r.aprobado_fuera,
        to_char(r.aprobado_en AT TIME ZONE ${zona}, 'YYYY-MM-DD') AS aprobado
      FROM mejora_rondas r JOIN mejora_hallazgos h ON h.id = r.hallazgo_id
      WHERE r.hallazgo_id = ANY(${ids}::bigint[]) AND r.estado_plan = 'aprobado'
      ORDER BY r.hallazgo_id, r.numero DESC`,
    sql`SELECT f.mejora_hallazgo_id, f.ronda, f.firma, f.nombre_firmante, f.cargo_firmante,
        to_char(f.creado_en AT TIME ZONE ${zona}, 'YYYY-MM-DD') AS dia
      FROM firmas f
      WHERE f.mejora_hallazgo_id = ANY(${ids}::bigint[]) AND f.firma IN ('elaboro', 'reviso', 'aprobo')
      ORDER BY f.id`,
  ]);
  const firmasDe = new Map<number, Firma[]>();
  for (const f of firmas) {
    const id = Number(f.mejora_hallazgo_id);
    const lista = firmasDe.get(id) ?? [];
    lista.push({
      firma: f.firma as string,
      ronda: Number(f.ronda),
      nombre: f.nombre_firmante as string,
      cargo: (f.cargo_firmante as string | null) ?? null,
      dia: f.dia as string,
    });
    firmasDe.set(id, lista);
  }
  const porHallazgo = new Map(rondas.map((r) => [Number(r.hallazgo_id), r]));
  const lineas: Fo14["aprobaciones"] = [];
  for (const id of hallazgoIds) {
    const r = porHallazgo.get(id);
    if (!r) continue;
    const codigo = r.codigo as string;
    if (r.aprobado_fuera !== null) {
      lineas.push({ codigo, elaboro: null, aprobo: null, fuera: { rol: ROL_EN_PAPEL[r.aprobado_rol as string] ?? ROL_EN_PAPEL.admin_sgc, fecha: r.aprobado as string } });
      continue;
    }
    const deLaRonda = (firmasDe.get(id) ?? []).filter((f) => f.ronda === Number(r.numero));
    const desde = deLaRonda.findLastIndex((f) => f.firma === "elaboro");
    const envio = desde === -1 ? [] : deLaRonda.slice(desde);
    const de = (firma: string) => envio.find((f) => f.firma === firma) ?? null;
    const elaboro = de("elaboro");
    const aprobo = r.aprobado_rol === "admin_sgc" ? de("reviso") : r.aprobado_rol === "gerencia" ? de("aprobo") : (de("aprobo") ?? de("reviso"));
    lineas.push({
      codigo,
      elaboro: elaboro ? { nombre: elaboro.nombre, cargo: elaboro.cargo } : null,
      aprobo: aprobo ? { nombre: aprobo.nombre, cargo: aprobo.cargo, fecha: aprobo.dia } : null,
      fuera: null,
    });
  }
  return lineas;
}

/** Lo común de las dos formas: el formato, los responsables, las filas, las fuentes que tienen y «Aprobación y control». */
async function armar(
  sql: Cliente,
  forma: Fo14["forma"],
  procesoId: number,
  proceso: { proceso: string; macroproceso: string },
  plan: Pick<Fo14["encabezado"], "origenDelPlan" | "codigoDelPlan" | "vigencia" | "elaboradoEl" | "objetivo">,
  hallazgoIds: number[],
  ahora: Date,
): Promise<Fo14> {
  const zona = zonaHoraria();
  const [formato, responsables, filas] = await Promise.all([
    encabezadoDeFormato(sql, "plan"),
    responsablesDelProceso(sql, procesoId),
    filasDePlanDeAccion(sql, hallazgoIds, ahora),
  ]);
  // Los hallazgos en el orden de las filas (por código), para que «Aprobación y control» los siga.
  const enOrden = [...new Set(filas.map((f) => f.hallazgo.id))];
  const tienen = new Set<Origen>(filas.map((f) => f.hallazgo.origen));
  return {
    forma,
    formato,
    encabezado: {
      ...plan,
      ...proceso,
      responsables,
      fuentes: ORIGENES.map((o) => o.clave).filter((c) => tienen.has(c)),
    },
    filas,
    aprobaciones: await aprobacionesDe(sql, enOrden, zona),
  };
}

/**
 * El SGC-FO-14 de un plan para uno de sus procesos (anexo §5.1): los hallazgos del plan que cuentan (ni anulados ni rechazados) y son
 * de ese proceso; el encabezado lleva el origen, el código, la vigencia, el día de creación y el objetivo del plan (su texto y su
 * objetivo del maestro). Nulo si la persona no imprime ese proceso, si no ve el plan, si el plan no tiene ningún hallazgo de ese
 * proceso que cuente (el botón sale solo en un grupo que los tiene) o si el plan o el proceso no existen.
 */
export async function fo14DePlan(sesion: SesionFlujo, planId: number, procesoId: number, opciones?: Opciones): Promise<Fo14 | null> {
  if (!idValido(planId) || !idValido(procesoId)) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!(await imprimeElProceso(sql, sesion, procesoId))) return null;
  const [p] = await sql`SELECT p.codigo, p.origen, p.vigencia, p.objetivo_texto, p.creado_en, o.enunciado AS objetivo, o.clase AS objetivo_clase
    FROM mejora_planes p
    LEFT JOIN objetivos o ON o.id = p.objetivo_id
    WHERE p.id = ${planId} AND ${filtroPlanes(sql, sesion)}`;
  if (!p) return null;
  const hallazgos = await sql`SELECT h.id FROM mejora_clasificacion cl JOIN mejora_hallazgos h ON h.id = cl.hallazgo_id
    WHERE cl.plan_id = ${planId} AND h.proceso_id = ${procesoId} AND h.estado <> ALL(${sql.array([...NO_CUENTAN_PARA_PLAN])}::text[])`;
  if (hallazgos.length === 0) return null;
  const proceso = await procesoDelImpreso(sql, procesoId);
  if (!proceso) return null;
  const texto = (p.objetivo_texto as string | null) ?? null;
  const maestro = p.objetivo === null ? null : `${p.objetivo_clase === "calidad" ? "Calidad" : "Institucional"} · ${p.objetivo as string}`;
  const objetivo = [texto, maestro].filter((x): x is string => x !== null && x !== "").join("\n");
  return armar(
    sql,
    "plan",
    procesoId,
    proceso,
    {
      origenDelPlan: ETIQUETA_ORIGEN[p.origen as Origen] ?? (p.origen as string),
      codigoDelPlan: p.codigo as string,
      vigencia: Number(p.vigencia),
      elaboradoEl: fechaEnZona(p.creado_en as Date, zonaHoraria()),
      objetivo: objetivo === "" ? null : objetivo,
    },
    hallazgos.map((h) => Number(h.id)),
    ahora,
  );
}

/**
 * El SGC-FO-14 consolidado de un proceso en un año (anexo §5.1 y §5.2): los hallazgos del proceso que cuentan y estuvieron abiertos
 * en algún momento de ese año, con o sin plan: registrados ese año o antes, y sin terminar o cerrados ese año o después. Los años, en
 * la zona de la instalación; la fecha de registro de un hallazgo cargado es la del registro en papel (su evento `registrar` marcado
 * `fuera`). El origen y el código del plan dicen «Consolidado del proceso», el objetivo va en blanco y la fecha de elaboración es la
 * del día en que se imprime. Nulo si la persona no imprime ese proceso, si el proceso no existe o si el año no está entre 2000 y 2100.
 */
export async function fo14Consolidado(sesion: SesionFlujo, procesoId: number, anio: number, opciones?: Opciones): Promise<Fo14 | null> {
  if (!idValido(procesoId) || !Number.isInteger(anio) || anio < ANIO_MINIMO || anio > ANIO_MAXIMO) return null;
  const sql = opciones?.sql ?? obtenerSql();
  const ahora = opciones?.ahora ?? new Date();
  if (!(await imprimeElProceso(sql, sesion, procesoId))) return null;
  const proceso = await procesoDelImpreso(sql, procesoId);
  if (!proceso) return null;
  const zona = zonaHoraria();
  const hallazgos = await sql`SELECT h.id FROM mejora_hallazgos h
    WHERE h.proceso_id = ${procesoId} AND h.estado <> ALL(${sql.array([...NO_CUENTAN_PARA_PLAN])}::text[])
      AND extract(year FROM coalesce(
          (SELECT min(e.ocurrio_en) FROM mejora_eventos e WHERE e.hallazgo_id = h.id AND e.fuera AND e.tipo = 'registrar'),
          h.registrado_en) AT TIME ZONE ${zona}) <= ${anio}
      AND (h.estado <> 'cerrado' OR extract(year FROM h.cerrado_en AT TIME ZONE ${zona}) >= ${anio})`;
  return armar(
    sql,
    "consolidado",
    procesoId,
    proceso,
    {
      origenDelPlan: CONSOLIDADO_DEL_PROCESO,
      codigoDelPlan: CONSOLIDADO_DEL_PROCESO,
      vigencia: anio,
      elaboradoEl: fechaEnZona(ahora, zona),
      objetivo: null,
    },
    hallazgos.map((h) => Number(h.id)),
    ahora,
  );
}
