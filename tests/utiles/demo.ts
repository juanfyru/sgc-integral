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
 * Los totales de la demo solo valen si nadie creó documentos, trámites, puntos de uso, externos ni normas, ni avanzó
 * los sembrados: la revisión anual sigue abierta (y ninguna cerrada), el hallazgo de Urgencias abierto y la lista
 * «Todo el hospital» con su único miembro «todos».
 */
export async function exigirDemoIntacta(ctx: TestContext, sql: Cliente): Promise<void> {
  const [c] = await sql`SELECT
      (SELECT count(*)::int FROM documentos) AS documentos,
      (SELECT count(*)::int FROM puntos_uso) AS puntos,
      (SELECT count(*)::int FROM verificaciones WHERE estado = 'cerrada') AS verificaciones,
      (SELECT count(*)::int FROM externos) AS externos,
      (SELECT count(*)::int FROM normas) AS normas,
      (SELECT count(*)::int FROM revisiones_anuales WHERE estado = 'abierta') AS abiertas,
      (SELECT count(*)::int FROM revisiones_anuales WHERE estado = 'cerrada') AS cerradas,
      (SELECT count(*)::int FROM hallazgos WHERE estado = 'abierto') AS hallazgos,
      (SELECT count(*)::int FROM lista_miembros m JOIN listas_distribucion l ON l.id = m.lista_id
        WHERE l.nombre = 'Todo el hospital') AS miembros,
      (SELECT count(*)::int FROM lista_miembros m JOIN listas_distribucion l ON l.id = m.lista_id
        WHERE l.nombre = 'Todo el hospital' AND m.tipo = 'todos') AS todos`;
  const tramites = await sql`SELECT etapa FROM tramites ORDER BY id`;
  const etapas = tramites.map((t) => t.etapa as string);
  const iguales = etapas.length === ETAPAS_SEMBRADAS.length && etapas.every((e, i) => e === ETAPAS_SEMBRADAS[i]);
  exigirDemo(
    ctx,
    c.documentos === 36 && iguales && c.puntos === 7 && c.verificaciones === 2 && c.externos === 4 && c.normas === 12 &&
      c.abiertas === 1 && c.cerradas === 0 && c.hallazgos === 1 && c.miembros === 1 && c.todos === 1,
    `hay ${c.documentos} documentos, ${etapas.length} trámites, ${c.puntos} puntos de uso, ${c.verificaciones} verificaciones ` +
      `cerradas, ${c.externos} externos, ${c.normas} normas, ${c.abiertas} revisiones abiertas y ${c.cerradas} cerradas, ` +
      `${c.hallazgos} hallazgos abiertos y ${c.miembros} miembros en «Todo el hospital» (${c.todos} «todos»), o los sembrados avanzaron`,
  );
}
