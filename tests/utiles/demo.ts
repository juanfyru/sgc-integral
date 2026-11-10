/**
 * La base de los tests es la de las pruebas a mano: después de recorrer la demostración, sus
 * documentos y trámites ya no están como se sembraron. Lo que un test afirma de la historia
 * sembrada se filtra a lo sembrado (`sembradaEn`); lo que afirma del estado actual de la demo pasa
 * por `exigirDemo`. Justo después de `npm run db:seed`, `SEMILLA_RECIEN=1 npm test` corre todos los
 * casos: con esa variable, un caso que se saltaría falla.
 */
import type { TestContext } from "vitest";
import type { Cliente } from "@/db/cliente";

/** El instante de la siembra: un paso sembrado es anterior; uno hecho después de usar la demo, posterior. */
export async function sembradaEn(sql: Cliente): Promise<Date> {
  const [u] = await sql`SELECT creado_en FROM usuarios WHERE usuario = 'gerente'`;
  return u.creado_en;
}

/** Salta el caso, con su motivo, si la demo ya no cumple lo que el caso necesita. */
export function exigirDemo(ctx: TestContext, cumple: boolean, motivo: string): void {
  if (cumple) return;
  if (process.env.SEMILLA_RECIEN === "1") throw new Error(`SEMILLA_RECIEN=1, pero ${motivo}`);
  const mensaje = `La demo ya se usó: ${motivo}. Resiembre para correr este caso.`;
  console.warn(mensaje);                                                 // el reporte por defecto no muestra la nota del salto
  ctx.skip(mensaje);
}

/**
 * La demostración cierra la carga de documentos ya aprobados. Quien la usa la abre y, con la
 * función que recibe, la deja como estaba: esa fila no se revierte con el test.
 */
export async function abrirCarga(sql: Cliente): Promise<() => Promise<void>> {
  const [{ valor }] = await sql`SELECT valor FROM configuracion WHERE clave = 'publicacion_directa'`;
  await sql`UPDATE configuracion SET valor = '1' WHERE clave = 'publicacion_directa'`;
  return async () => {
    await sql`UPDATE configuracion SET valor = ${valor} WHERE clave = 'publicacion_directa'`;
  };
}

/** Las cinco solicitudes de la 13A y la de la revisión anual de la 13C (`SOL-<año>-006`, por aceptar). */
const ETAPAS_SEMBRADAS = ["publicado", "revision", "publicacion", "aceptacion", "visto_bueno", "aceptacion"];

/**
 * Cuánto deja la siembra de cada cosa que el recorrido de la demostración cambia. Los pasos que no crean filas (fijar o
 * quitar una fecha, ratificar, verificar un externo, resolver un impacto, decidir en la campaña, confirmar un normograma,
 * prorrogar) también se notan: cambian una de estas cifras.
 */
const SEMBRADO = {
  documentos: 36,
  puntos: 7,
  verificaciones: 2,
  hallazgos: 1,
  copias: 5,
  todoElHospital: 1,
  externos: 4,
  normas: 12,
  cambiosDeNorma: 1,
  ratificaciones: 2,
  verificacionesDeExternos: 1,
  documentosConFechaFijada: 25,
  fechasFijadasEnBitacora: 25,
  impactosPendientes: 1,
  impactosResueltos: 1,
  revisionesAbiertasSinProrroga: 1,
  revisionesCerradas: 0,
  decisionesDePersonas: 1,
  normogramasConfirmados: 1,
} as const;

const NOMBRES: Record<keyof typeof SEMBRADO, string> = {
  documentos: "documentos",
  puntos: "puntos de uso",
  verificaciones: "verificaciones de puntos cerradas",
  hallazgos: "hallazgos abiertos",
  copias: "copias controladas",
  todoElHospital: "miembros «todos» como único miembro de «Todo el hospital»",
  externos: "externos",
  normas: "normas",
  cambiosDeNorma: "cambios de estado de normas",
  ratificaciones: "ratificaciones",
  verificacionesDeExternos: "verificaciones de externos",
  documentosConFechaFijada: "documentos con fecha fijada",
  fechasFijadasEnBitacora: "fechas fijadas en la bitácora",
  impactosPendientes: "impactos pendientes",
  impactosResueltos: "impactos resueltos",
  revisionesAbiertasSinProrroga: "revisiones anuales abiertas, de 60 días y sin prórroga",
  revisionesCerradas: "revisiones anuales cerradas",
  decisionesDePersonas: "decisiones de la revisión anual tomadas por una persona",
  normogramasConfirmados: "normogramas confirmados en la revisión anual",
};

/**
 * Si la demo sigue como se sembró: sus cifras (`SEMBRADO`) y las etapas de sus trámites. `motivo` dice lo que cambió. La
 * usan `exigirDemoIntacta` y el test de la guarda (`tests/semilla-vigencia.test.ts`).
 */
export async function estadoDeLaDemo(sql: Cliente): Promise<{ intacta: boolean; motivo: string }> {
  const [c] = await sql`SELECT
      (SELECT count(*)::int FROM documentos) AS documentos,
      (SELECT count(*)::int FROM puntos_uso) AS puntos,
      (SELECT count(*)::int FROM verificaciones WHERE estado = 'cerrada') AS verificaciones,
      (SELECT count(*)::int FROM hallazgos WHERE estado = 'abierto') AS hallazgos,
      (SELECT count(*)::int FROM copias_controladas) AS copias,
      (SELECT CASE WHEN count(*) = 1 AND bool_and(m.tipo = 'todos') THEN 1 ELSE 0 END FROM lista_miembros m
        JOIN listas_distribucion l ON l.id = m.lista_id WHERE l.nombre = 'Todo el hospital') AS "todoElHospital",
      (SELECT count(*)::int FROM externos) AS externos,
      (SELECT count(*)::int FROM normas) AS normas,
      (SELECT count(*)::int FROM norma_cambios) AS "cambiosDeNorma",
      (SELECT count(*)::int FROM ratificaciones) AS ratificaciones,
      (SELECT count(*)::int FROM externo_verificaciones) AS "verificacionesDeExternos",
      (SELECT count(*)::int FROM documentos WHERE proxima_revision_fijada IS NOT NULL) AS "documentosConFechaFijada",
      (SELECT count(*)::int FROM auditoria WHERE accion = 'fecha_revision_fijada') AS "fechasFijadasEnBitacora",
      (SELECT count(*)::int FROM impactos_normativos WHERE estado = 'pendiente') AS "impactosPendientes",
      (SELECT count(*)::int FROM impactos_normativos WHERE estado = 'resuelto') AS "impactosResueltos",
      (SELECT count(*)::int FROM revisiones_anuales
        WHERE estado = 'abierta' AND plazo_dias = 60 AND prorrogas = '[]'::jsonb) AS "revisionesAbiertasSinProrroga",
      (SELECT count(*)::int FROM revisiones_anuales WHERE estado = 'cerrada') AS "revisionesCerradas",
      (SELECT count(*)::int FROM revision_anual_decisiones WHERE usuario_id IS NOT NULL) AS "decisionesDePersonas",
      (SELECT count(*)::int FROM revision_anual_procesos WHERE normograma_resultado IS NOT NULL) AS "normogramasConfirmados"`;
  const cambios = (Object.keys(SEMBRADO) as (keyof typeof SEMBRADO)[])
    .filter((clave) => Number(c[clave]) !== SEMBRADO[clave])
    .map((clave) => `${Number(c[clave])} ${NOMBRES[clave]} (se sembraron ${SEMBRADO[clave]})`);
  const etapas = (await sql`SELECT etapa FROM tramites ORDER BY id`).map((t) => t.etapa as string);
  if (etapas.length !== ETAPAS_SEMBRADAS.length || etapas.some((e, i) => e !== ETAPAS_SEMBRADAS[i])) {
    cambios.push(`los trámites están en ${etapas.join(", ") || "ninguna etapa"} (se sembraron en ${ETAPAS_SEMBRADAS.join(", ")})`);
  }
  return { intacta: cambios.length === 0, motivo: cambios.length === 0 ? "la demo está como se sembró" : `hay ${cambios.join("; ")}` };
}

/** Los totales de la demo solo valen si sigue como se sembró (`estadoDeLaDemo`); si no, el caso se salta con lo que cambió. */
export async function exigirDemoIntacta(ctx: TestContext, sql: Cliente): Promise<void> {
  const { intacta, motivo } = await estadoDeLaDemo(sql);
  exigirDemo(ctx, intacta, motivo);
}
